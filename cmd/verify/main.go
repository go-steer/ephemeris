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

// verify executes an end-to-end HTTP + WebSocket smoke test against a live or Cloud Run ephemeris instance.
package main

import (
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/go-steer/ephemeris/pkg/api"
)

func main() {
	targetURL := flag.String("url", "http://localhost:8080", "Target Ephemeris base URL (e.g. https://ephemeris-demo-xxx.run.app)")
	timeout := flag.Duration("timeout", 25*time.Second, "Overall verification timeout")
	flag.Parse()

	base := strings.TrimRight(*targetURL, "/")
	fmt.Printf("▸ Starting E2E verification against %s\n", base)

	client := &http.Client{Timeout: *timeout}

	// 1. Verify /healthz endpoint
	if err := checkHealthz(client, base); err != nil {
		fatalf("Health check failed: %v", err)
	}
	fmt.Println("  ✓ GET /healthz returned 200 OK")

	// 2. Verify / (SPA WebGL + ArrowJS bundle)
	if err := checkSPA(client, base); err != nil {
		fatalf("SPA asset check failed: %v", err)
	}
	fmt.Println("  ✓ GET / served HTML SPA bundle")

	// 3. Verify WebSocket /ws topology & AI incident triage flow
	wsURL, err := toWebSocketURL(base)
	if err != nil {
		fatalf("Invalid target URL %q: %v", base, err)
	}

	if err := checkWebSocketFlow(wsURL, *timeout); err != nil {
		fatalf("WebSocket E2E verification failed: %v", err)
	}
	fmt.Println("  ✓ WSS /ws topology stream & ArrowJS UI compilation verified")
	fmt.Printf("✓ All post-deployment verification checks passed for %s\n", base)
}

func checkHealthz(client *http.Client, base string) error {
	resp, err := client.Get(base + "/healthz")
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("expected HTTP 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "ok") {
		return fmt.Errorf("unexpected healthz body: %q", string(body))
	}
	return nil
}

func checkSPA(client *http.Client, base string) error {
	resp, err := client.Get(base + "/")
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("expected HTTP 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	html := string(body)
	if !strings.Contains(html, "EPHEMERIS") && !strings.Contains(html, "<div id=\"app\">") {
		return fmt.Errorf("HTML response missing expected EPHEMERIS SPA root container")
	}
	return nil
}

func toWebSocketURL(base string) (string, error) {
	u, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	case "http":
		u.Scheme = "ws"
	default:
		return "", fmt.Errorf("unsupported URL scheme %q", u.Scheme)
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/ws"
	return u.String(), nil
}

func checkWebSocketFlow(wsURL string, timeout time.Duration) error {
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		return fmt.Errorf("websocket dial %s failed: %w", wsURL, err)
	}
	defer func() { _ = conn.Close() }()

	_ = conn.SetReadDeadline(time.Now().Add(timeout))

	// Send explicit init message
	if err := conn.WriteJSON(api.ClientMessage{Type: api.MsgTypeInit}); err != nil {
		return fmt.Errorf("failed to send init message: %w", err)
	}

	// Wait for topology message
	var gotTopology bool
	for !gotTopology {
		var msg api.ServerMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return fmt.Errorf("failed reading topology message: %w", err)
		}
		if msg.Type == api.MsgTypeTopology && msg.Topology != nil {
			if len(msg.Topology.Clusters) == 0 {
				return fmt.Errorf("topology message contained 0 clusters")
			}
			gotTopology = true
		}
	}

	// Send AI Triage prompt for payment-service
	promptMsg := api.ClientMessage{
		Type:           api.MsgTypePrompt,
		SelectedNodeID: "pod-payment",
		ResourceURI:    "gke://default/payment-service",
		Prompt:         "Investigate crash in payment-service and synthesize triage UI",
	}
	if err := conn.WriteJSON(promptMsg); err != nil {
		return fmt.Errorf("failed to send prompt message: %w", err)
	}

	// Read messages until ui_component arrives
	for {
		var msg api.ServerMessage
		if err := conn.ReadJSON(&msg); err != nil {
			return fmt.Errorf("failed waiting for ui_component: %w", err)
		}
		if msg.Type == api.MsgTypeError {
			return fmt.Errorf("server returned error message: %s", msg.Message)
		}
		if msg.Type == api.MsgTypeUIComponent && msg.UI != nil {
			if !strings.Contains(msg.UI.Code, "reactive") && !strings.Contains(msg.UI.Code, "html") {
				return fmt.Errorf("ui_component code does not contain expected ArrowJS reactive template")
			}
			return nil
		}
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "✗ "+format+"\n", args...)
	os.Exit(1)
}
