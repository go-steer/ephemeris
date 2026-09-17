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
	mode := flag.String("mode", orchestrator.GetEnvOrDefault("EPHEMERIS_MODE", "mock"), "Operational mode: 'mock' or 'live'")
	webDir := flag.String("web-dir", "", "Serve web assets from directory instead of embedded bundle")
	gcpProject := flag.String("gcp-project", orchestrator.GetEnvOrDefault("GOOGLE_CLOUD_PROJECT", ""), "GCP Project ID")
	vertexLocation := flag.String("vertex-location", orchestrator.GetEnvOrDefault("VERTEX_LOCATION", "global"), "Vertex AI Location (default: global)")
	model := flag.String("model", orchestrator.GetEnvOrDefault("GEMINI_MODEL", "gemini-3.8-flash"), "Gemini model identifier")
	gkeMCPEndpoint := flag.String("gke-mcp-endpoint", orchestrator.GetEnvOrDefault("GKE_MCP_ENDPOINT", "https://container.googleapis.com/mcp"), "GKE MCP endpoint URL")
	loggingMCPEndpoint := flag.String("logging-mcp-endpoint", orchestrator.GetEnvOrDefault("LOGGING_MCP_ENDPOINT", "https://logging.googleapis.com/mcp"), "Logging MCP endpoint URL")
	lookoutMCPEndpoint := flag.String("lookout-mcp-endpoint", orchestrator.GetEnvOrDefault("LOOKOUT_MCP_ENDPOINT", ""), "Optional external k8s-lookout MCP server endpoint (defaults to built-in engine)")
	forceMockLLM := flag.Bool("force-mock-llm", os.Getenv("EPHEMERIS_FORCE_MOCK_LLM") == "true", "Force deterministic mock UI compiler without calling Vertex AI")
	flag.Parse()

	log.Printf("Starting ephemeris daemon [mode=%s, port=%d, model=%s, location=%s]", *mode, *port, *model, *vertexLocation)

	ctx := context.Background()

	// 1. Initialize providers
	var gkeProvider gke.Provider
	var telemProvider telemetry.Provider
	var lookoutClient *mcp.LookoutClient

	if *lookoutMCPEndpoint != "" {
		lc, err := mcp.NewClient(ctx, mcp.ClientConfig{
			BaseURL: *lookoutMCPEndpoint,
		})
		if err != nil {
			log.Printf("Warning: failed to initialize external k8s-lookout MCP client (%v); using built-in k8s-lookout engine", err)
			lookoutClient = mcp.NewLookoutClient(nil)
		} else {
			log.Printf("Using external k8s-lookout MCP server at %s", *lookoutMCPEndpoint)
			lookoutClient = mcp.NewLookoutClient(lc)
		}
	} else {
		lookoutClient = mcp.NewLookoutClient(nil)
	}

	if *mode == "live" {
		if *gcpProject == "" {
			log.Printf("Warning: -mode=live specified but -gcp-project is empty; falling back to mock providers")
			gkeProvider = gke.NewMockProvider()
			telemProvider = telemetry.NewMockProvider()
		} else {
			gkeClient, err := mcp.NewClient(ctx, mcp.ClientConfig{
				BaseURL: *gkeMCPEndpoint,
			})
			if err != nil {
				log.Printf("Warning: failed to initialize GKE MCP client (%v); falling back to mock GKE provider", err)
				gkeProvider = gke.NewMockProvider()
			} else {
				log.Printf("Using live GKE MCP provider connecting to %s for project %s", *gkeMCPEndpoint, *gcpProject)
				gkeProvider = gke.NewMCPProvider(gkeClient, *gcpProject)
			}

			logClient, err := mcp.NewClient(ctx, mcp.ClientConfig{
				BaseURL: *loggingMCPEndpoint,
			})
			if err != nil {
				log.Printf("Warning: failed to initialize Logging MCP client (%v); falling back to mock telemetry provider", err)
				telemProvider = telemetry.NewMockProvider()
			} else {
				log.Printf("Using live Logging MCP provider connecting to %s for project %s", *loggingMCPEndpoint, *gcpProject)
				telemProvider = telemetry.NewMCPProvider(logClient, *gcpProject)
			}
		}
	} else {
		gkeProvider = gke.NewMockProvider()
		telemProvider = telemetry.NewMockProvider()
	}

	// 2. Initialize Vertex AI Agent (uses live Vertex AI Gemini when ADC is available, falls back gracefully if offline)
	agent := orchestrator.NewAgent(ctx, orchestrator.AgentConfig{
		Model:         *model,
		Location:      *vertexLocation,
		ProjectID:     *gcpProject,
		ForceMock:     *forceMockLLM,
		LookoutClient: lookoutClient,
	})

	// 3. Configure Server
	spaFS, err := webui.FS()
	if err != nil {
		log.Printf("Warning: failed to load embedded FS (%v)", err)
	}

	serverCfg := orchestrator.ServerConfig{
		Port:          *port,
		WebDir:        *webDir,
		SPAFileSystem: spaFS,
	}

	server := orchestrator.NewServer(serverCfg, gkeProvider, telemProvider, agent)

	// 4. Start Server
	if err := server.Start(); err != nil {
		log.Fatalf("Server stopped: %v", err)
	}
}
