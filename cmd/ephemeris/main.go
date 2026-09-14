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

	"github.com/go-steer/ephemeris/internal/webui"
	"github.com/go-steer/ephemeris/pkg/gke"
	"github.com/go-steer/ephemeris/pkg/orchestrator"
	"github.com/go-steer/ephemeris/pkg/telemetry"
)

func main() {
	port := flag.Int("port", 8080, "HTTP and WebSocket listen port")
	mode := flag.String("mode", "mock", "Operational mode: 'mock' or 'live'")
	webDir := flag.String("web-dir", "", "Serve web assets from directory instead of embedded bundle")
	gcpProject := flag.String("gcp-project", orchestrator.GetEnvOrDefault("GOOGLE_CLOUD_PROJECT", ""), "GCP Project ID")
	vertexLocation := flag.String("vertex-location", orchestrator.GetEnvOrDefault("VERTEX_LOCATION", "global"), "Vertex AI Location (default: global)")
	model := flag.String("model", orchestrator.GetEnvOrDefault("GEMINI_MODEL", "gemini-3.8-flash"), "Gemini model identifier")
	flag.Parse()

	log.Printf("Starting ephemeris daemon [mode=%s, port=%d, model=%s, location=%s]", *mode, *port, *model, *vertexLocation)

	ctx := context.Background()

	// 1. Initialize providers
	var gkeProvider gke.Provider
	var telemProvider telemetry.Provider

	// Default to mock for Phase 1
	gkeProvider = gke.NewMockProvider()
	telemProvider = telemetry.NewMockProvider()

	// 2. Initialize Vertex AI Agent
	forceMock := (*mode == "mock")
	agent := orchestrator.NewAgent(ctx, orchestrator.AgentConfig{
		Model:     *model,
		Location:  *vertexLocation,
		ProjectID: *gcpProject,
		ForceMock: forceMock,
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
