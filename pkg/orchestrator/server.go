// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/go-steer/ephemeris/pkg/api"
	"github.com/go-steer/ephemeris/pkg/gke"
	"github.com/go-steer/ephemeris/pkg/telemetry"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow local development from Vite on :5173
		return true
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// ServerConfig configures port, operational mode, and static file serving.
type ServerConfig struct {
	Port          int
	WebDir        string
	SPAFileSystem fs.FS
}

// Server manages the WebSocket telemetry hub and HTTP static assets.
type Server struct {
	cfg       ServerConfig
	gke       gke.Provider
	telemetry telemetry.Provider
	mockGKE   gke.Provider
	mockTelem telemetry.Provider
	liveGKE   gke.Provider
	liveTelem telemetry.Provider
	mode      string
	projectID string
	agent     *Agent

	mu      sync.Mutex
	clients map[*websocket.Conn]*clientState
}

type clientState struct {
	writeMu        sync.Mutex
	activeResource string
	selectedNodeID string
}

// NewServer initializes the orchestrator hub.
func NewServer(cfg ServerConfig, gkeProv gke.Provider, telemProv telemetry.Provider, agent *Agent) *Server {
	return &Server{
		cfg:       cfg,
		gke:       gkeProv,
		telemetry: telemProv,
		mockGKE:   gkeProv,
		mockTelem: telemProv,
		mode:      "mock",
		agent:     agent,
		clients:   make(map[*websocket.Conn]*clientState),
	}
}

// ConfigureLiveProviders attaches native Live GKE & Telemetry providers so the user can switch
// between 'live' (gke-demos-345619) and 'mock' chaos simulation from the HUD without restarting.
func (s *Server) ConfigureLiveProviders(liveGKE gke.Provider, liveTelem telemetry.Provider, projectID string, initialMode string) {
	s.mu.Lock()
	s.liveGKE = liveGKE
	s.liveTelem = liveTelem
	s.projectID = projectID
	if initialMode == "live" && liveGKE != nil && liveTelem != nil {
		s.mode = "live"
		s.gke = liveGKE
		s.telemetry = liveTelem
	}
	s.mu.Unlock()

	if liveGKE != nil {
		go s.runLiveSyncLoop()
	}
}

func (s *Server) runLiveSyncLoop() {
	ticker := time.NewTicker(8 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		isLive := s.mode == "live" && s.liveGKE != nil
		hasClients := len(s.clients) > 0
		liveProv := s.liveGKE
		proj := s.projectID
		s.mu.Unlock()

		if !isLive || !hasClients {
			continue
		}

		ctx, cancel := context.WithTimeout(context.Background(), 7*time.Second)
		topo, err := liveProv.GetTopology(ctx)
		cancel()
		if err == nil && topo != nil {
			topo.Mode = "live"
			topo.ProjectID = proj
			s.broadcastTopology(topo)
		}
	}
}

func (s *Server) writeJSON(conn *websocket.Conn, state *clientState, msg api.ServerMessage) error {
	if state != nil {
		state.writeMu.Lock()
		defer state.writeMu.Unlock()
	}
	return conn.WriteJSON(msg)
}

func (s *Server) broadcastTopology(topo *api.TopologyData) {
	if topo == nil {
		return
	}
	s.mu.Lock()
	conns := make([]*websocket.Conn, 0, len(s.clients))
	states := make([]*clientState, 0, len(s.clients))
	for c, st := range s.clients {
		conns = append(conns, c)
		states = append(states, st)
	}
	s.mu.Unlock()

	msg := api.ServerMessage{
		Type:     api.MsgTypeTopology,
		Topology: topo,
	}
	for i, c := range conns {
		_ = s.writeJSON(c, states[i], msg)
	}
}

// Routes constructs the HTTP handler for the server.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprintln(w, "ok")
	}
	mux.HandleFunc("/healthz", healthHandler)
	mux.HandleFunc("/api/health", healthHandler)

	mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/x-icon")
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("/ws", s.handleWebSocket)

	// Serve frontend assets
	if s.cfg.WebDir != "" {
		log.Printf("Serving web assets from disk: %s", s.cfg.WebDir)
		mux.Handle("/", http.FileServer(http.Dir(s.cfg.WebDir)))
	} else if s.cfg.SPAFileSystem != nil {
		mux.Handle("/", http.FileServer(http.FS(s.cfg.SPAFileSystem)))
	}

	return mux
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer func() {
		_ = conn.Close()
	}()

	state := &clientState{}
	s.mu.Lock()
	s.clients[conn] = state
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.clients, conn)
		s.mu.Unlock()
	}()

	// Send initial topology upon connection
	ctx := r.Context()
	s.sendTopology(ctx, conn, state)

	for {
		_, messageBytes, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket connection closed: %v", err)
			}
			break
		}

		var clientMsg api.ClientMessage
		if err := json.Unmarshal(messageBytes, &clientMsg); err != nil {
			s.sendError(conn, state, fmt.Sprintf("invalid message format: %v", err))
			continue
		}

		s.handleClientMessage(ctx, conn, state, &clientMsg)
	}
}

func (s *Server) handleClientMessage(ctx context.Context, conn *websocket.Conn, state *clientState, msg *api.ClientMessage) {
	switch msg.Type {
	case api.MsgTypeInit:
		s.sendTopology(ctx, conn, state)

	case api.MsgTypeSetMode:
		targetMode := strings.ToLower(strings.TrimSpace(msg.Mode))
		if targetMode != "live" && targetMode != "mock" {
			targetMode = "mock"
		}
		s.mu.Lock()
		if targetMode == "live" && s.liveGKE != nil && s.liveTelem != nil {
			s.mode = "live"
			s.gke = s.liveGKE
			s.telemetry = s.liveTelem
		} else {
			targetMode = "mock"
			s.mode = "mock"
			s.gke = s.mockGKE
			s.telemetry = s.mockTelem
		}
		proj := s.projectID
		s.mu.Unlock()

		if targetMode == "live" {
			_ = s.writeJSON(conn, state, api.ServerMessage{
				Type:    api.MsgTypeStatus,
				Message: fmt.Sprintf("🌐 Switching to Live GKE (%s) — querying clusters via Google Cloud GKE SDK (container/v1) + k8s.io/client-go...", proj),
			})
		} else {
			_ = s.writeJSON(conn, state, api.ServerMessage{
				Type:    api.MsgTypeStatus,
				Message: "🧪 Switched to Mock Simulation Engine",
			})
		}

		topo, err := s.gke.GetTopology(ctx)
		if err != nil {
			s.sendError(conn, state, fmt.Sprintf("failed to fetch %s topology: %v", targetMode, err))
			return
		}
		if topo != nil {
			topo.Mode = targetMode
			if targetMode == "live" {
				topo.ProjectID = proj
			}
		}
		s.broadcastTopology(topo)
		if targetMode == "live" && topo != nil {
			_ = s.writeJSON(conn, state, api.ServerMessage{
				Type:    api.MsgTypeStatus,
				Message: fmt.Sprintf("✓ Live GKE Connected: %d running clusters in %s rendered on 3D canvas", len(topo.Clusters), proj),
			})
		}

	case api.MsgTypeSelectNode:
		state.activeResource = msg.ResourceURI
		state.selectedNodeID = msg.SelectedNodeID

		// Fetch and stream telemetry for the selected pod
		if msg.ResourceURI != "" {
			telem, err := s.telemetry.QueryLogs(ctx, msg.ResourceURI, 50)
			if err != nil {
				s.sendError(conn, state, fmt.Sprintf("telemetry query failed: %v", err))
				return
			}
			_ = s.writeJSON(conn, state, api.ServerMessage{
				Type:      api.MsgTypeTelemetry,
				Telemetry: telem,
			})
		}

	case api.MsgTypeRemediate:
		target := msg.SelectedNodeID
		if target == "" {
			target = state.selectedNodeID
		}
		if target == "" {
			target = "payment-service"
		}
		pod, err := s.gke.RemediatePod(ctx, target, msg.RemediationAction)
		if err != nil {
			s.sendError(conn, state, fmt.Sprintf("remediation failed: %v", err))
			return
		}
		if mockTelem, ok := s.telemetry.(*telemetry.MockProvider); ok {
			mockTelem.RecordRemediation(pod.Name)
		}
		topo, _ := s.gke.GetTopology(ctx)
		s.broadcastTopology(topo)
		_ = s.writeJSON(conn, state, api.ServerMessage{
			Type:    api.MsgTypeStatus,
			Message: fmt.Sprintf("✓ Stateful remediation complete: %s is now Running (lookout findings cleared)", pod.Name),
		})

	case api.MsgTypeScenario:
		scenarioID := msg.ScenarioID
		if scenarioID == "" {
			scenarioID = "default"
		}
		topo, err := s.gke.ApplyScenario(ctx, scenarioID)
		if err != nil {
			s.sendError(conn, state, fmt.Sprintf("scenario switch failed: %v", err))
			return
		}
		if mockTelem, ok := s.telemetry.(*telemetry.MockProvider); ok {
			mockTelem.SetScenario(scenarioID)
		}
		s.broadcastTopology(topo)
		_ = s.writeJSON(conn, state, api.ServerMessage{
			Type:    api.MsgTypeStatus,
			Message: fmt.Sprintf("⚡ Chaos Scenario Injected: %s — running k8s-lookout diagnostics...", scenarioID),
		})

		telemData := &api.TelemetryData{
			ResourceURI: "gke://fleet/issues",
			Topology:    topo,
		}
		intent := LLMIntentResult{
			Archetype: ArchetypeIssuesFleetMatrix,
			Reasoning: fmt.Sprintf("Scenario %q injected; displaying fleet-wide incident matrix and k8s-lookout findings.", scenarioID),
		}
		code, _ := s.agent.GenerateStreamWithIntent(ctx, "show fleet issues", intent, telemData, nil)
		_ = s.writeJSON(conn, state, api.ServerMessage{
			Type: api.MsgTypeUIComponent,
			UI: &api.UIComponentData{
				ResourceURI: "gke://fleet/issues",
				Prompt:      fmt.Sprintf("Scenario: %s", scenarioID),
				Archetype:   string(ArchetypeIssuesFleetMatrix),
				Code:        code,
				Telemetry:   telemData,
			},
		})

	case api.MsgTypeScaleTest:
		cfg := api.ScaleTestConfig{Preset: msg.ScalePreset}
		if msg.ScaleConfig != nil {
			cfg = *msg.ScaleConfig
			if cfg.Preset == "" {
				cfg.Preset = msg.ScalePreset
			}
		}
		if cfg.Preset == "" {
			cfg.Preset = "large"
		}
		topo, err := s.gke.ApplyScaleTest(ctx, cfg)
		if err != nil {
			s.sendError(conn, state, fmt.Sprintf("scale test failed: %v", err))
			return
		}
		s.broadcastTopology(topo)
		_ = s.writeJSON(conn, state, api.ServerMessage{
			Type:    api.MsgTypeStatus,
			Message: fmt.Sprintf("⚡ Scale Stress Test Active: %s preset (%d clusters)", cfg.Preset, len(topo.Clusters)),
		})
		telemData := &api.TelemetryData{
			ResourceURI: "gke://fleet/scale-test",
			Topology:    topo,
		}
		intent := LLMIntentResult{
			Archetype:      ArchetypeScaleBenchmark,
			TargetScenario: cfg.Preset,
			Reasoning:      fmt.Sprintf("Synthetic fleet scale stress-test (%s preset) generated across %d GKE clusters.", cfg.Preset, len(topo.Clusters)),
		}
		code, _ := s.agent.GenerateStreamWithIntent(ctx, "scale test benchmark", intent, telemData, nil)
		_ = s.writeJSON(conn, state, api.ServerMessage{
			Type: api.MsgTypeUIComponent,
			UI: &api.UIComponentData{
				ResourceURI: "gke://fleet/scale-test",
				Prompt:      fmt.Sprintf("Scale Test: %s", cfg.Preset),
				Archetype:   string(ArchetypeScaleBenchmark),
				Code:        code,
				Telemetry:   telemData,
			},
		})

	case api.MsgTypePrompt:
		resourceURI := msg.ResourceURI
		if resourceURI == "" {
			resourceURI = state.activeResource
		}
		if resourceURI == "" {
			resourceURI = "gke://fleet/overview"
		}

		statusFn := func(statusMsg string) {
			_ = s.writeJSON(conn, state, api.ServerMessage{
				Type:    api.MsgTypeStatus,
				Message: statusMsg,
			})
		}

		topo, _ := s.gke.GetTopology(ctx)

		// Step 1: Resolve natural-language intent via Gemini LLM (or deterministic fallback)
		intent := s.agent.ResolveIntent(ctx, msg.Prompt, &api.TelemetryData{
			ResourceURI: resourceURI,
			Topology:    topo,
		}, statusFn)

		// If prompt requested a scale stress test, apply it immediately
		if intent.Archetype == ArchetypeScaleBenchmark {
			preset := intent.TargetScenario
			if preset == "" {
				preset = "large"
			}
			newTopo, err := s.gke.ApplyScaleTest(ctx, api.ScaleTestConfig{Preset: preset})
			if err == nil {
				topo = newTopo
				s.broadcastTopology(topo)
				statusFn(fmt.Sprintf("⚡ Scale Stress Test Injected: %s (%d clusters) — synthesizing benchmark UI...", preset, len(topo.Clusters)))
			}
			resourceURI = "gke://fleet/scale-test"
		}

		// If prompt requested a chaos scenario injection, apply it immediately and transition to issues_matrix
		if intent.Archetype == ArchetypeChaosScenario {
			scenarioID := intent.TargetScenario
			if scenarioID == "" {
				scenarioID = "redis-oom"
			}
			newTopo, err := s.gke.ApplyScenario(ctx, scenarioID)
			if err == nil {
				topo = newTopo
				if mockTelem, ok := s.telemetry.(*telemetry.MockProvider); ok {
					mockTelem.SetScenario(scenarioID)
				}
				s.broadcastTopology(topo)
				statusFn(fmt.Sprintf("⚡ Chaos Scenario Injected: %s — synthesizing fleet incident matrix...", scenarioID))
			}
			intent.Archetype = ArchetypeIssuesFleetMatrix
			resourceURI = "gke://fleet/issues"
		}

		// Adjust resourceURI based on LLM-resolved intent
		switch intent.Archetype {
		case ArchetypeScaleBenchmark:
			resourceURI = "gke://fleet/scale-test"
		case ArchetypeIssuesFleetMatrix:
			if intent.TargetCluster != "" {
				resourceURI = "gke://cluster/" + intent.TargetCluster + "/issues"
			} else {
				resourceURI = "gke://fleet/issues"
			}
		case ArchetypeDynamicCustom:
			if intent.TargetCluster != "" {
				resourceURI = "gke://cluster/" + intent.TargetCluster + "/resources"
			} else {
				resourceURI = "gke://fleet/resources"
			}
		case ArchetypeNamespaceInventory:
			ns := intent.TargetNamespace
			if ns == "" {
				ns = "production"
			}
			resourceURI = "gke://namespace/" + ns
		case ArchetypeResourceLeaderboard:
			resourceURI = "gke://fleet/leaderboard"
		default:
			if intent.TargetPod != "" && !strings.Contains(resourceURI, intent.TargetPod) {
				resourceURI = "gke://production/" + intent.TargetPod
			}
		}

		// Step 2: Fetch telemetry and attach live topology
		statusFn("Executing MCP telemetry & topology query...")
		telem, err := s.telemetry.QueryLogs(ctx, resourceURI, 50)
		if err != nil {
			s.sendError(conn, state, fmt.Sprintf("telemetry query failed: %v", err))
			return
		}
		if topo != nil {
			telem.Topology = topo
		}

		// Step 3: Generate ArrowJS reactive UI with progressive streaming status updates
		code, err := s.agent.GenerateStreamWithIntent(ctx, msg.Prompt, intent, telem, statusFn)
		if err != nil {
			s.sendError(conn, state, fmt.Sprintf("UI compilation failed: %v", err))
			return
		}

		// Step 4: Deliver UI component with resolved Archetype metadata
		_ = s.writeJSON(conn, state, api.ServerMessage{
			Type: api.MsgTypeUIComponent,
			UI: &api.UIComponentData{
				ResourceURI:     resourceURI,
				Prompt:          msg.Prompt,
				Archetype:       string(intent.Archetype),
				TargetNamespace: intent.TargetNamespace,
				TargetCluster:   intent.TargetCluster,
				TargetPod:       intent.TargetPod,
				Code:            code,
				Telemetry:       telem,
			},
		})

	default:
		s.sendError(conn, state, fmt.Sprintf("unknown message type: %q", msg.Type))
	}
}

func (s *Server) sendTopology(ctx context.Context, conn *websocket.Conn, state *clientState) {
	s.mu.Lock()
	gkeProv := s.gke
	mode := s.mode
	proj := s.projectID
	s.mu.Unlock()

	topo, err := gkeProv.GetTopology(ctx)
	if err != nil {
		s.sendError(conn, state, fmt.Sprintf("failed to fetch topology: %v", err))
		return
	}
	if topo != nil && topo.Mode == "" {
		topo.Mode = mode
		if mode == "live" {
			topo.ProjectID = proj
		}
	}

	_ = s.writeJSON(conn, state, api.ServerMessage{
		Type:     api.MsgTypeTopology,
		Topology: topo,
	})
}

func (s *Server) sendError(conn *websocket.Conn, state *clientState, errMsg string) {
	_ = s.writeJSON(conn, state, api.ServerMessage{
		Type:    api.MsgTypeError,
		Message: errMsg,
	})
}

// Start launches the HTTP server with safe timeouts.
func (s *Server) Start() error {
	addr := fmt.Sprintf(":%d", s.cfg.Port)
	srv := &http.Server{
		Addr:              addr,
		Handler:           s.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("Ephemeris server listening on %s", addr)
	return srv.ListenAndServe()
}
