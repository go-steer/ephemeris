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

package mcp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/oauth2"
)

type staticTokenSource struct {
	token *oauth2.Token
}

func (s *staticTokenSource) Token() (*oauth2.Token, error) {
	return s.token, nil
}

func newTestTokenSource(tokenValue string) oauth2.TokenSource {
	return &staticTokenSource{
		token: &oauth2.Token{
			AccessToken: tokenValue,
			Expiry:      time.Now().Add(1 * time.Hour),
		},
	}
}

func TestClient_CallTool_GuardrailBlocksUnauthorized(t *testing.T) {
	ctx := context.Background()
	client, err := NewClient(ctx, ClientConfig{
		BaseURL:     "https://container.googleapis.com/mcp",
		TokenSource: newTestTokenSource("test-token"),
	})
	if err != nil {
		t.Fatalf("unexpected NewClient error: %v", err)
	}

	dangerousTools := []string{
		"delete_pod",
		"scale_deployment",
		"apply_manifest",
		"patch_service",
		"drain_node",
	}

	for _, tool := range dangerousTools {
		_, err := client.CallTool(ctx, tool, map[string]interface{}{})
		if err == nil {
			t.Errorf("expected guardrail error for %q, got nil", tool)
		} else if !strings.Contains(err.Error(), "security guardrail") {
			t.Errorf("expected security guardrail error message for %q, got: %v", tool, err)
		}
	}
}

func TestClient_CallTool_Success(t *testing.T) {
	ctx := context.Background()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify auth header
		authHeader := r.Header.Get("Authorization")
		if authHeader != "Bearer test-secret-token" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req jsonRPCRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if req.Method != "tools/call" {
			http.Error(w, "invalid method", http.StatusBadRequest)
			return
		}

		resp := jsonRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  json.RawMessage(`{"status":"ok","items":["cluster-1","cluster-2"]}`),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, err := NewClient(ctx, ClientConfig{
		BaseURL:     server.URL,
		TokenSource: newTestTokenSource("test-secret-token"),
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	res, err := client.CallTool(ctx, "list_gke_clusters", map[string]interface{}{"project": "my-project"})
	if err != nil {
		t.Fatalf("CallTool failed: %v", err)
	}

	var data struct {
		Status string   `json:"status"`
		Items  []string `json:"items"`
	}
	if err := json.Unmarshal(res, &data); err != nil {
		t.Fatalf("failed to parse result: %v", err)
	}

	if data.Status != "ok" || len(data.Items) != 2 {
		t.Errorf("unexpected response content: %+v", data)
	}
}

func TestClient_CallTool_ServerError(t *testing.T) {
	ctx := context.Background()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := jsonRPCResponse{
			JSONRPC: "2.0",
			ID:      1,
			Error: &jsonRPCError{
				Code:    -32602,
				Message: "Invalid params: project not found",
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, err := NewClient(ctx, ClientConfig{
		BaseURL:     server.URL,
		TokenSource: newTestTokenSource("test-token"),
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	_, err = client.CallTool(ctx, "list_pods", map[string]interface{}{"project": "non-existent"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !strings.Contains(err.Error(), "Invalid params: project not found") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestClient_ListTools(t *testing.T) {
	ctx := context.Background()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := jsonRPCResponse{
			JSONRPC: "2.0",
			ID:      1,
			Result: json.RawMessage(`{
				"tools": [
					{"name": "list_gke_clusters", "description": "List GKE clusters"},
					{"name": "query_logs", "description": "Query Cloud Logging"}
				]
			}`),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, err := NewClient(ctx, ClientConfig{
		BaseURL:     server.URL,
		TokenSource: newTestTokenSource("test-token"),
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	tools, err := client.ListTools(ctx)
	if err != nil {
		t.Fatalf("ListTools failed: %v", err)
	}

	if len(tools) != 2 {
		t.Fatalf("expected 2 tools, got %d", len(tools))
	}
	if tools[0].Name != "list_gke_clusters" {
		t.Errorf("expected list_gke_clusters, got %s", tools[0].Name)
	}
}
