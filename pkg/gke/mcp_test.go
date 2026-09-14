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

package gke

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

func TestMCPProvider_GetTopology_Success(t *testing.T) {
	ctx := context.Background()

	mockTopology := api.TopologyData{
		Clusters: []api.ClusterNode{
			{
				Name:      "prod-us-central1",
				ProjectID: "test-proj",
				Location:  "us-central1",
				Namespaces: []api.NamespaceNode{
					{
						Name: "default",
						Pods: []api.PodNode{
							{
								ID:     "pod-api-123",
								Name:   "api-service",
								Status: api.StatusRunning,
							},
						},
					},
				},
			},
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID     int64  `json:"id"`
			Method string `json:"method"`
			Params struct {
				Name string `json:"name"`
			} `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)

		topologyBytes, _ := json.Marshal(mockTopology)
		resp := map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      req.ID,
			"result":  json.RawMessage(topologyBytes),
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

	provider := NewMCPProvider(client, "test-proj")
	topo, err := provider.GetTopology(ctx)
	if err != nil {
		t.Fatalf("GetTopology failed: %v", err)
	}

	if len(topo.Clusters) != 1 {
		t.Fatalf("expected 1 cluster, got %d", len(topo.Clusters))
	}
	if topo.Clusters[0].Name != "prod-us-central1" {
		t.Errorf("expected prod-us-central1, got %s", topo.Clusters[0].Name)
	}
	if len(topo.Clusters[0].Namespaces[0].Pods) != 1 {
		t.Fatalf("expected 1 pod, got %d", len(topo.Clusters[0].Namespaces[0].Pods))
	}
	if topo.Clusters[0].Namespaces[0].Pods[0].Name != "api-service" {
		t.Errorf("expected api-service, got %s", topo.Clusters[0].Namespaces[0].Pods[0].Name)
	}
}

func TestMCPProvider_GetPodDetails_Success(t *testing.T) {
	ctx := context.Background()

	mockPod := api.PodNode{
		ID:        "pod-payment-84f",
		Name:      "payment-service",
		Namespace: "production",
		Cluster:   "prod-us-central1",
		Status:    api.StatusError,
		Restarts:  14,
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID int64 `json:"id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)

		podBytes, _ := json.Marshal(mockPod)
		resp := map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      req.ID,
			"result":  json.RawMessage(podBytes),
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

	provider := NewMCPProvider(client, "test-proj")
	pod, err := provider.GetPodDetails(ctx, "gke://production/payment-service")
	if err != nil {
		t.Fatalf("GetPodDetails failed: %v", err)
	}

	if pod.Name != "payment-service" {
		t.Errorf("expected payment-service, got %s", pod.Name)
	}
	if pod.Status != api.StatusError {
		t.Errorf("expected CrashLoopBackOff status, got %s", pod.Status)
	}
	if pod.Restarts != 14 {
		t.Errorf("expected 14 restarts, got %d", pod.Restarts)
	}
}
