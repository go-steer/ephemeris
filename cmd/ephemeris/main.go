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
	"flag"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-steer/ephemeris/internal/webui"
)

func main() {
	port := flag.Int("port", 8080, "HTTP and WebSocket listen port")
	mode := flag.String("mode", "mock", "Operational mode (mock or live)")
	webDir := flag.String("web-dir", "", "Serve web assets from directory instead of embedded bundle")
	flag.Parse()

	log.Printf("Starting ephemeris (mode: %s, port: %d)...", *mode, *port)

	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprintln(w, "ok")
	})

	if *webDir != "" {
		log.Printf("Serving static assets from disk: %s", *webDir)
		mux.Handle("/", http.FileServer(http.Dir(*webDir)))
	} else {
		spaFS, err := webui.FS()
		if err != nil {
			log.Fatalf("Failed to load embedded webui: %v", err)
		}
		mux.Handle("/", http.FileServer(http.FS(spaFS)))
	}

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", *port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server exited: %v", err)
	}
}
