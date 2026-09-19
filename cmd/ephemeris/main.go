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

// ephemeris is the orchestrator daemon and WebGL observability server.
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"strconv"

	"github.com/go-steer/ephemeris/internal/webui"
	"github.com/go-steer/ephemeris/pkg/gke"
	"github.com/go-steer/ephemeris/pkg/mcp"
	"github.com/go-steer/ephemeris/pkg/orchestrator"
	"github.com/go-steer/ephemeris/pkg/telemetry"
)

func main() {
	defaultPort := 8080
	if envPort := os.Getenv("PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil {
			defaultPort = p
		}
	}

	port := flag.Int("port", defaultPort, "HTTP and WebSocket listen port (env: PORT)")
	mode := flag.String("mode", orchestrator.GetEnvOrDefault("EPHEMERIS_MODE", "mock"), "Initial operational mode: 'mock' or 'live'")
	webDir := flag.String("web-dir", "", "Serve web assets from directory instead of embedded bundle")
	gcpProject := flag.String("gcp-project", orchestrator.GetEnvOrDefault("GOOGLE_CLOUD_PROJECT", "gke-demos-345619"), "GCP Project ID")
	vertexLocation := flag.String("vertex-location", orchestrator.GetEnvOrDefault("VERTEX_LOCATION", "global"), "Vertex AI Location (default: global)")
	model := flag.String("model", orchestrator.GetEnvOrDefault("GEMINI_MODEL", "gemini-3.8-flash"), "Gemini model identifier")
	gkeMCPEndpoint := flag.String("gke-mcp-endpoint", orchestrator.GetEnvOrDefault("GKE_MCP_ENDPOINT", "https://container.googleapis.com/mcp"), "GKE MCP endpoint URL")
	loggingMCPEndpoint := flag.String("logging-mcp-endpoint", orchestrator.GetEnvOrDefault("LOGGING_MCP_ENDPOINT", "https://logging.googleapis.com/mcp"), "Logging MCP endpoint URL")
	lookoutMCPEndpoint := flag.String("lookout-mcp-endpoint", orchestrator.GetEnvOrDefault("LOOKOUT_MCP_ENDPOINT", ""), "Optional external k8s-lookout MCP server endpoint (defaults to built-in engine)")
	forceMockLLM := flag.Bool("force-mock-llm", os.Getenv("EPHEMERIS_FORCE_MOCK_LLM") == "true", "Force deterministic mock UI compiler without calling Vertex AI")
	flag.Parse()

	log.Printf("Starting ephemeris daemon [mode=%s, port=%d, project=%s, model=%s, location=%s]", *mode, *port, *gcpProject, *model, *vertexLocation)

	ctx := context.Background()

	// 1. Initialize Mock Simulation Providers
	mockGKE := gke.NewMockProvider()
	mockTelem := telemetry.NewMockProvider()

	// 2. Initialize Agentic MCP Clients (backed by github.com/go-steer/mast/pkg/mcp)
	var lookoutClient *mcp.LookoutClient
	if *lookoutMCPEndpoint != "" {
		if lc, err := mcp.NewClient(ctx, mcp.ClientConfig{BaseURL: *lookoutMCPEndpoint}); err == nil {
			lookoutClient = mcp.NewLookoutClient(lc)
		}
	}
	if lookoutClient == nil {
		lookoutClient = mcp.NewLookoutClient(nil)
	}

	var gkeMCPClient *mcp.Client
	var logMCPClient *mcp.Client
	var liveGKE *gke.LiveProvider
	var liveTelem *telemetry.LiveProvider

	if *gcpProject != "" {
		if c, err := mcp.NewClient(ctx, mcp.ClientConfig{BaseURL: *gkeMCPEndpoint}); err == nil {
			gkeMCPClient = c
			log.Printf("Initialized GKE MCP toolset (github.com/go-steer/mast/pkg/mcp) at %s", *gkeMCPEndpoint)
		} else {
			log.Printf("Warning: GKE MCP client unavailable (%v)", err)
		}

		if c, err := mcp.NewClient(ctx, mcp.ClientConfig{BaseURL: *loggingMCPEndpoint}); err == nil {
			logMCPClient = c
			log.Printf("Initialized Cloud Logging MCP toolset (github.com/go-steer/mast/pkg/mcp) at %s", *loggingMCPEndpoint)
		} else {
			log.Printf("Warning: Logging MCP client unavailable (%v)", err)
		}

		if lp, err := gke.NewLiveProvider(ctx, *gcpProject, gkeMCPClient); err == nil {
			liveGKE = lp
			liveTelem = telemetry.NewLiveProvider(*gcpProject, liveGKE, gkeMCPClient, logMCPClient)
			log.Printf("Initialized Native Live GKE Provider (google.golang.org/api/container/v1 + k8s.io/client-go) for project %s", *gcpProject)
			go func() {
				_, _ = liveGKE.GetTopology(context.Background())
			}()
		} else {
			log.Printf("Warning: Live GKE provider initialization skipped (%v)", err)
		}
	}

	// 3. Initialize Vertex AI Agent with mast/pkg/mcp toolsets
	agent := orchestrator.NewAgent(ctx, orchestrator.AgentConfig{
		Model:            *model,
		Location:         *vertexLocation,
		ProjectID:        *gcpProject,
		ForceMock:        *forceMockLLM,
		LookoutClient:    lookoutClient,
		GKEMCPClient:     gkeMCPClient,
		LoggingMCPClient: logMCPClient,
	})

	// 4. Configure Server (supports dynamic HUD switching between 'mock' and 'live')
	spaFS, err := webui.FS()
	if err != nil {
		log.Printf("Warning: failed to load embedded FS (%v)", err)
	}

	serverCfg := orchestrator.ServerConfig{
		Port:          *port,
		WebDir:        *webDir,
		SPAFileSystem: spaFS,
	}

	server := orchestrator.NewServer(serverCfg, mockGKE, mockTelem, agent)
	if liveGKE != nil && liveTelem != nil {
		server.ConfigureLiveProviders(liveGKE, liveTelem, *gcpProject, *mode)
	}

	// 5. Start Server
	if err := server.Start(); err != nil {
		log.Fatalf("Server stopped: %v", err)
	}
}
