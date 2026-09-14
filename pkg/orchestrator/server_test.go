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
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/go-steer/ephemeris/pkg/api"
	"github.com/go-steer/ephemeris/pkg/gke"
	"github.com/go-steer/ephemeris/pkg/telemetry"
)

func TestServer_Healthz(t *testing.T) {
	server := NewServer(ServerConfig{}, gke.NewMockProvider(), telemetry.NewMockProvider(), nil)
	handler := server.Routes()

	req := httptest.NewRequest("GET", "/healthz", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	if strings.TrimSpace(w.Body.String()) != "ok" {
		t.Errorf("expected body 'ok', got %q", w.Body.String())
	}
}

func TestServer_WebSocketWorkflow(t *testing.T) {
	ctx := context.Background()
	agent := NewAgent(ctx, AgentConfig{ForceMock: true})
	server := NewServer(ServerConfig{}, gke.NewMockProvider(), telemetry.NewMockProvider(), agent)

	testServer := httptest.NewServer(server.Routes())
	defer testServer.Close()

	wsURL := "ws" + strings.TrimPrefix(testServer.URL, "http") + "/ws"
	wsConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer func() { _ = wsConn.Close() }()

	// 1. Initial message from server should be topology
	var topoMsg api.ServerMessage
	_ = wsConn.SetReadDeadline(time.Now().Add(2 * time.Second))
	if err := wsConn.ReadJSON(&topoMsg); err != nil {
		t.Fatalf("failed to read initial topology: %v", err)
	}
	if topoMsg.Type != api.MsgTypeTopology {
		t.Errorf("expected topology message, got %s", topoMsg.Type)
	}

	// 2. Client selects payment-service pod
	selectMsg := api.ClientMessage{
		Type:           api.MsgTypeSelectNode,
		SelectedNodeID: "pod-payment-service-84f7b6",
		ResourceURI:    "gke://production/payment-service",
	}
	if err := wsConn.WriteJSON(selectMsg); err != nil {
		t.Fatalf("failed to write select_node message: %v", err)
	}

	// Read telemetry response
	var telemMsg api.ServerMessage
	_ = wsConn.SetReadDeadline(time.Now().Add(2 * time.Second))
	if err := wsConn.ReadJSON(&telemMsg); err != nil {
		t.Fatalf("failed to read telemetry: %v", err)
	}
	if telemMsg.Type != api.MsgTypeTelemetry {
		t.Errorf("expected telemetry message, got %s", telemMsg.Type)
	}
	if telemMsg.Telemetry.Metrics["status"] != "CrashLoopBackOff" {
		t.Errorf("expected CrashLoopBackOff, got %s", telemMsg.Telemetry.Metrics["status"])
	}

	// 3. Client sends incident prompt
	promptMsg := api.ClientMessage{
		Type:        api.MsgTypePrompt,
		ResourceURI: "gke://production/payment-service",
		Prompt:      "Why is this crashing?",
	}
	if err := wsConn.WriteJSON(promptMsg); err != nil {
		t.Fatalf("failed to write prompt: %v", err)
	}

	// Server should send status updates, then ui_component
	var gotUI bool
	for i := 0; i < 5; i++ {
		var resp api.ServerMessage
		_ = wsConn.SetReadDeadline(time.Now().Add(3 * time.Second))
		if err := wsConn.ReadJSON(&resp); err != nil {
			break
		}
		if resp.Type == api.MsgTypeUIComponent {
			gotUI = true
			if !strings.Contains(resp.UI.Code, "reactive") {
				t.Errorf("expected ArrowJS reactive code in response")
			}
			break
		}
	}

	if !gotUI {
		t.Errorf("expected to receive ui_component message from orchestrator")
	}
}
