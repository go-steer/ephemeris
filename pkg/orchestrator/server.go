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
	agent     *Agent

	mu      sync.Mutex
	clients map[*websocket.Conn]*clientState
}

type clientState struct {
	activeResource string
	selectedNodeID string
}

// NewServer initializes the orchestrator hub.
func NewServer(cfg ServerConfig, gke gke.Provider, telem telemetry.Provider, agent *Agent) *Server {
	return &Server{
		cfg:       cfg,
		gke:       gke,
		telemetry: telem,
		agent:     agent,
		clients:   make(map[*websocket.Conn]*clientState),
	}
}

// Routes constructs the HTTP handler for the server.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprintln(w, "ok")
	})

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
	s.sendTopology(ctx, conn)

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
			s.sendError(conn, fmt.Sprintf("invalid message format: %v", err))
			continue
		}

		s.handleClientMessage(ctx, conn, state, &clientMsg)
	}
}

func (s *Server) handleClientMessage(ctx context.Context, conn *websocket.Conn, state *clientState, msg *api.ClientMessage) {
	switch msg.Type {
	case api.MsgTypeInit:
		s.sendTopology(ctx, conn)

	case api.MsgTypeSelectNode:
		state.activeResource = msg.ResourceURI
		state.selectedNodeID = msg.SelectedNodeID

		// Fetch and stream telemetry for the selected pod
		if msg.ResourceURI != "" {
			telem, err := s.telemetry.QueryLogs(ctx, msg.ResourceURI, 50)
			if err != nil {
				s.sendError(conn, fmt.Sprintf("telemetry query failed: %v", err))
				return
			}
			_ = conn.WriteJSON(api.ServerMessage{
				Type:      api.MsgTypeTelemetry,
				Telemetry: telem,
			})
		}

	case api.MsgTypePrompt:
		resourceURI := msg.ResourceURI
		if resourceURI == "" {
			resourceURI = state.activeResource
		}

		if resourceURI == "" {
			s.sendError(conn, "no active pod selected in 3D scene")
			return
		}

		// Step 1: Send status notification
		_ = conn.WriteJSON(api.ServerMessage{
			Type:    api.MsgTypeStatus,
			Message: "Querying telemetry from MCP...",
		})

		// Step 2: Fetch telemetry
		telem, err := s.telemetry.QueryLogs(ctx, resourceURI, 50)
		if err != nil {
			s.sendError(conn, fmt.Sprintf("telemetry query failed: %v", err))
			return
		}

		// Step 3: Send status notification
		_ = conn.WriteJSON(api.ServerMessage{
			Type:    api.MsgTypeStatus,
			Message: "Compiling ArrowJS reactive UI via Gemini...",
		})

		// Step 4: Generate ArrowJS reactive UI with progressive streaming status updates
		code, err := s.agent.GenerateStream(ctx, msg.Prompt, telem, func(statusMsg string) {
			_ = conn.WriteJSON(api.ServerMessage{
				Type:    api.MsgTypeStatus,
				Message: statusMsg,
			})
		})
		if err != nil {
			s.sendError(conn, fmt.Sprintf("UI compilation failed: %v", err))
			return
		}

		// Step 5: Deliver UI component
		_ = conn.WriteJSON(api.ServerMessage{
			Type: api.MsgTypeUIComponent,
			UI: &api.UIComponentData{
				ResourceURI: resourceURI,
				Prompt:      msg.Prompt,
				Code:        code,
				Telemetry:   telem,
			},
		})

	default:
		s.sendError(conn, fmt.Sprintf("unknown message type: %q", msg.Type))
	}
}

func (s *Server) sendTopology(ctx context.Context, conn *websocket.Conn) {
	topo, err := s.gke.GetTopology(ctx)
	if err != nil {
		s.sendError(conn, fmt.Sprintf("failed to fetch topology: %v", err))
		return
	}

	_ = conn.WriteJSON(api.ServerMessage{
		Type:     api.MsgTypeTopology,
		Topology: topo,
	})
}

func (s *Server) sendError(conn *websocket.Conn, errMsg string) {
	_ = conn.WriteJSON(api.ServerMessage{
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
