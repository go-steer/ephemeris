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
	"fmt"
	"strings"

	"github.com/go-steer/ephemeris/pkg/api"
	"github.com/go-steer/ephemeris/pkg/mcp"
)

// MCPProvider discovers live GKE topology via Google Cloud Managed MCP (container.googleapis.com/mcp).
type MCPProvider struct {
	client    *mcp.Client
	projectID string
	fallback  *MockProvider
}

// NewMCPProvider creates a new MCP GKE topology provider.
func NewMCPProvider(client *mcp.Client, projectID string) *MCPProvider {
	return &MCPProvider{
		client:    client,
		projectID: projectID,
		fallback:  NewMockProvider(),
	}
}

// GetTopology queries the GKE Managed MCP server for the multi-cluster topology.
func (p *MCPProvider) GetTopology(ctx context.Context) (*api.TopologyData, error) {
	if p.client == nil {
		return nil, fmt.Errorf("mcp client is not initialized")
	}

	args := map[string]interface{}{}
	if p.projectID != "" {
		args["project"] = p.projectID
	}

	raw, err := p.client.CallTool(ctx, "list_gke_resources", args)
	if err != nil {
		// Fallback to list_gke_clusters if list_gke_resources is not supported
		raw, err = p.client.CallTool(ctx, "list_gke_clusters", args)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch GKE topology via mcp: %w", err)
		}
	}

	// 1. Try parsing directly as api.TopologyData or wrapped clusters
	var topology api.TopologyData
	if err := json.Unmarshal(raw, &topology); err == nil && len(topology.Clusters) > 0 {
		return &topology, nil
	}

	// 2. Try parsing wrapped response { "clusters": [...] }
	var wrapped struct {
		Clusters []api.ClusterNode `json:"clusters"`
	}
	if err := json.Unmarshal(raw, &wrapped); err == nil && len(wrapped.Clusters) > 0 {
		return &api.TopologyData{Clusters: wrapped.Clusters}, nil
	}

	// 3. Try parsing list of cluster objects [ { "name": ..., "namespaces": ... } ]
	var clusterList []api.ClusterNode
	if err := json.Unmarshal(raw, &clusterList); err == nil && len(clusterList) > 0 {
		return &api.TopologyData{Clusters: clusterList}, nil
	}

	return nil, fmt.Errorf("mcp returned unparseable or empty GKE topology: %s", string(raw))
}

// GetPodDetails retrieves details for a single pod by its resource URI via MCP.
func (p *MCPProvider) GetPodDetails(ctx context.Context, resourceURI string) (*api.PodNode, error) {
	if p.client == nil {
		return nil, fmt.Errorf("mcp client is not initialized")
	}

	args := map[string]interface{}{
		"resource_uri": resourceURI,
	}
	if p.projectID != "" {
		args["project"] = p.projectID
	}

	raw, err := p.client.CallTool(ctx, "get_pod_details", args)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch pod details for %q via mcp: %w", resourceURI, err)
	}

	var pod api.PodNode
	if err := json.Unmarshal(raw, &pod); err != nil {
		return nil, fmt.Errorf("failed to parse pod details from mcp: %w", err)
	}

	if pod.Name == "" && pod.ID == "" {
		// Try extracting from wrapped { "pod": {...} }
		var wrapped struct {
			Pod api.PodNode `json:"pod"`
		}
		if err := json.Unmarshal(raw, &wrapped); err == nil && (wrapped.Pod.Name != "" || wrapped.Pod.ID != "") {
			return &wrapped.Pod, nil
		}
		return nil, fmt.Errorf("mcp returned invalid pod structure: %s", string(raw))
	}

	// Ensure Name is populated
	if pod.Name == "" {
		pod.Name = strings.TrimPrefix(pod.ID, "pod-")
	}

	return &pod, nil
}

// RemediatePod delegates remediation state tracking to the stateful fallback provider.
func (p *MCPProvider) RemediatePod(ctx context.Context, podIDOrName string, action string) (*api.PodNode, error) {
	return p.fallback.RemediatePod(ctx, podIDOrName, action)
}

// ApplyScenario delegates chaos scenario injection to the stateful fallback provider.
func (p *MCPProvider) ApplyScenario(ctx context.Context, scenarioID string) (*api.TopologyData, error) {
	return p.fallback.ApplyScenario(ctx, scenarioID)
}

// ApplyScaleTest delegates synthetic scale test generation to the fallback provider.
func (p *MCPProvider) ApplyScaleTest(ctx context.Context, cfg api.ScaleTestConfig) (*api.TopologyData, error) {
	return p.fallback.ApplyScaleTest(ctx, cfg)
}
