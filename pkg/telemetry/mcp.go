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
	"fmt"
	"strings"

	"github.com/go-steer/ephemeris/pkg/api"
	"github.com/go-steer/ephemeris/pkg/mcp"
)

// MCPProvider queries live container logs via Google Cloud Managed Logging MCP (logging.googleapis.com/mcp).
type MCPProvider struct {
	client    *mcp.Client
	projectID string
}

// NewMCPProvider creates a new MCP telemetry provider.
func NewMCPProvider(client *mcp.Client, projectID string) *MCPProvider {
	return &MCPProvider{
		client:    client,
		projectID: projectID,
	}
}

// QueryLogs retrieves log lines and telemetry for a given Kubernetes resource via MCP.
func (p *MCPProvider) QueryLogs(ctx context.Context, resourceURI string, limit int) (*api.TelemetryData, error) {
	if p.client == nil {
		return nil, fmt.Errorf("mcp client is not initialized")
	}

	if limit <= 0 {
		limit = 50
	}

	podName := extractPodName(resourceURI)

	args := map[string]interface{}{
		"resource_uri": resourceURI,
		"pod_name":     podName,
		"limit":        limit,
	}
	if p.projectID != "" {
		args["project"] = p.projectID
	}

	raw, err := p.client.CallTool(ctx, "query_logs", args)
	if err != nil {
		return nil, fmt.Errorf("failed to query logs via mcp: %w", err)
	}

	// 1. Try direct parsing as api.TelemetryData
	var telem api.TelemetryData
	if err := json.Unmarshal(raw, &telem); err == nil && (len(telem.Logs) > 0 || len(telem.Metrics) > 0) {
		if telem.ResourceURI == "" {
			telem.ResourceURI = resourceURI
		}
		if telem.PodID == "" {
			telem.PodID = podName
		}
		return &telem, nil
	}

	// 2. Try parsing wrapped response { "logs": [...], "metrics": {...} }
	var wrapped struct {
		Logs    []api.LogEntry    `json:"logs"`
		Metrics map[string]string `json:"metrics"`
		PodID   string            `json:"pod_id"`
	}
	if err := json.Unmarshal(raw, &wrapped); err == nil {
		return &api.TelemetryData{
			ResourceURI: resourceURI,
			PodID:       chooseNonEmpty(wrapped.PodID, podName),
			Logs:        wrapped.Logs,
			Metrics:     wrapped.Metrics,
		}, nil
	}

	return nil, fmt.Errorf("mcp returned unparseable log payload: %s", string(raw))
}

func extractPodName(uri string) string {
	parts := strings.Split(uri, "/")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return uri
}

func chooseNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
