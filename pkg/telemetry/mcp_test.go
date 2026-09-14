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

package telemetry

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"golang.org/x/oauth2"

	"github.com/go-steer/ephemeris/pkg/api"
	"github.com/go-steer/ephemeris/pkg/mcp"
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

func TestMCPProvider_QueryLogs_Success_Direct(t *testing.T) {
	ctx := context.Background()

	mockTelemetry := api.TelemetryData{
		ResourceURI: "gke://production/payment-service",
		PodID:       "payment-service",
		Logs: []api.LogEntry{
			{
				Timestamp: "2026-09-14T20:00:00Z",
				Severity:  "ERROR",
				Message:   "OutOfMemoryKilled: Container exceeded memory limit",
			},
		},
		Metrics: map[string]string{
			"memory_usage": "512Mi",
			"memory_limit": "512Mi",
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID int64 `json:"id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)

		payload, _ := json.Marshal(mockTelemetry)
		resp := map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      req.ID,
			"result":  json.RawMessage(payload),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, err := mcp.NewClient(ctx, mcp.ClientConfig{
		BaseURL:     server.URL,
		TokenSource: newTestTokenSource("test-token"),
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	provider := NewMCPProvider(client, "test-project")
	data, err := provider.QueryLogs(ctx, "gke://production/payment-service", 50)
	if err != nil {
		t.Fatalf("QueryLogs failed: %v", err)
	}

	if data.PodID != "payment-service" {
		t.Errorf("expected payment-service, got %s", data.PodID)
	}
	if len(data.Logs) != 1 {
		t.Fatalf("expected 1 log entry, got %d", len(data.Logs))
	}
	if data.Logs[0].Severity != "ERROR" {
		t.Errorf("expected ERROR severity, got %s", data.Logs[0].Severity)
	}
	if data.Metrics["memory_limit"] != "512Mi" {
		t.Errorf("expected 512Mi memory limit, got %s", data.Metrics["memory_limit"])
	}
}

func TestMCPProvider_QueryLogs_Success_Wrapped(t *testing.T) {
	ctx := context.Background()

	wrappedResp := map[string]interface{}{
		"pod_id": "cart-service",
		"logs": []map[string]string{
			{
				"timestamp": "2026-09-14T20:01:00Z",
				"severity":  "INFO",
				"message":   "Service started normally",
			},
		},
		"metrics": map[string]string{
			"cpu_usage": "120m",
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID int64 `json:"id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)

		payload, _ := json.Marshal(wrappedResp)
		resp := map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      req.ID,
			"result":  json.RawMessage(payload),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client, err := mcp.NewClient(ctx, mcp.ClientConfig{
		BaseURL:     server.URL,
		TokenSource: newTestTokenSource("test-token"),
	})
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	provider := NewMCPProvider(client, "test-project")
	data, err := provider.QueryLogs(ctx, "gke://production/cart-service", 10)
	if err != nil {
		t.Fatalf("QueryLogs failed: %v", err)
	}

	if data.PodID != "cart-service" {
		t.Errorf("expected cart-service, got %s", data.PodID)
	}
	if len(data.Logs) != 1 {
		t.Fatalf("expected 1 log line, got %d", len(data.Logs))
	}
	if data.Metrics["cpu_usage"] != "120m" {
		t.Errorf("expected 120m cpu usage, got %s", data.Metrics["cpu_usage"])
	}
}

func TestMCPProvider_QueryLogs_NilClient(t *testing.T) {
	provider := NewMCPProvider(nil, "test-project")
	_, err := provider.QueryLogs(context.Background(), "gke://production/cart-service", 10)
	if err == nil {
		t.Fatal("expected error with nil client, got nil")
	}
}
