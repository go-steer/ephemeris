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

// Package mcp integrates github.com/go-steer/mast/pkg/mcp (NewGKEToolset & NewToolset)
// with Ephemeris's read-only security guardrails for agentic incident triage.
package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	mastmcp "github.com/go-steer/mast/pkg/mcp"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/genai"
)

// AllowedReadTools defines the strict read-only whitelist of MCP tools.
// Mirrors the mutating: false tool catalog from github.com/go-steer/mast
// (examples/workloads/gke-triage/workload.yaml) plus Cloud Logging and k8s-lookout.
var AllowedReadTools = map[string]bool{
	// Official Google Cloud GKE MCP (https://container.googleapis.com/mcp) read-only tools
	"list_clusters":          true,
	"get_cluster":            true,
	"list_node_pools":        true,
	"get_node_pool":          true,
	"list_operations":        true,
	"get_operation":          true,
	"get_k8s_resource":       true,
	"describe_k8s_resource":  true,
	"list_k8s_events":        true,
	"get_k8s_logs":           true,
	"get_k8s_rollout_status": true,
	"list_k8s_api_resources": true,
	"get_k8s_cluster_info":   true,
	"get_k8s_version":        true,
	"check_k8s_auth":         true,

	// Official Google Cloud Logging MCP (https://logging.googleapis.com/mcp) read-only tools
	"list_log_entries": true,
	"list_log_names":   true,
	"get_bucket":       true,
	"list_buckets":     true,
	"get_view":         true,
	"list_views":       true,

	// Legacy & test aliases
	"list_gke_clusters":  true,
	"list_gke_resources": true,
	"list_namespaces":    true,
	"list_pods":          true,
	"get_pod":            true,
	"get_pod_details":    true,
	"query_logs":         true,
	"get_metrics":        true,

	// go-steer/k8s-lookout read-path MCP diagnostic tools
	"lookout_triage":    true,
	"lookout_logs":      true,
	"lookout_events":    true,
	"lookout_top":       true,
	"lookout_health":    true,
	"lookout_findings":  true,
	"lookout_delta":     true,
	"lookout_state":     true,
	"lookout_resources": true,
}

func allowedReadToolsSlice() []string {
	out := make([]string, 0, len(AllowedReadTools))
	for k, v := range AllowedReadTools {
		if v {
			out = append(out, k)
		}
	}
	return out
}

// ToolInfo describes an available tool returned by MCP tools/list.
type ToolInfo struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	InputSchema json.RawMessage `json:"inputSchema,omitempty"`
}

// ClientConfig configures the MCP client backed by github.com/go-steer/mast/pkg/mcp.
type ClientConfig struct {
	BaseURL     string
	TokenSource oauth2.TokenSource
	HTTPClient  *http.Client
	Timeout     time.Duration
}

// Client wraps a mast/pkg/mcp tool.Toolset (and direct JSON-RPC fallback for unit test servers)
// with read-only tool guardrails.
type Client struct {
	baseURL     string
	tokenSource oauth2.TokenSource
	httpClient  *http.Client
	toolset     tool.Toolset
	requestID   atomic.Int64
}

// roCtx satisfies adkagent.ReadonlyContext for querying tools from a mast tool.Toolset.
type roCtx struct {
	context.Context
}

func (roCtx) UserContent() *genai.Content          { return nil }
func (roCtx) InvocationID() string                 { return "" }
func (roCtx) AgentName() string                    { return "ephemeris-agent" }
func (roCtx) ReadonlyState() session.ReadonlyState { return nil }
func (roCtx) UserID() string                       { return "sre-operator" }
func (roCtx) AppName() string                      { return "ephemeris" }
func (roCtx) SessionID() string                    { return "live-triage" }
func (roCtx) Branch() string                       { return "main" }

// NewClient initializes an MCP client using github.com/go-steer/mast/pkg/mcp.NewGKEToolset
// or mast/pkg/mcp.NewToolset when using ADC credentials.
func NewClient(ctx context.Context, cfg ClientConfig) (*Client, error) {
	if cfg.BaseURL == "" {
		return nil, fmt.Errorf("mcp baseURL is required")
	}

	baseURL := strings.TrimRight(cfg.BaseURL, "/")
	predicate := tool.StringPredicate(allowedReadToolsSlice())

	var mastToolset tool.Toolset
	// When no custom test TokenSource is injected, wire mast/pkg/mcp's built-in Google MCP client.
	if cfg.TokenSource == nil && cfg.HTTPClient == nil {
		if strings.Contains(baseURL, "container.googleapis.com") {
			ts, err := mastmcp.NewGKEToolset(ctx, mastmcp.GKEConfig{
				Endpoint:   baseURL,
				ToolFilter: predicate,
				Name:       "gke",
			})
			if err == nil {
				mastToolset = ts
			}
		} else {
			ts, err := mastmcp.NewToolset(ctx, "google-mcp", mastmcp.ServerConfig{
				Transport: mastmcp.TransportHTTP,
				URL:       baseURL,
				Auth: &mastmcp.AuthConfig{
					GoogleOAuth: &mastmcp.GoogleOAuthConfig{
						Scopes: []string{mastmcp.DefaultGKEScope},
					},
				},
			})
			if err == nil {
				mastToolset = ts
			}
		}
	}

	ts := cfg.TokenSource
	if ts == nil {
		var err error
		ts, err = google.DefaultTokenSource(ctx, mastmcp.DefaultGKEScope)
		if err != nil {
			return nil, fmt.Errorf("failed to acquire ADC token source: %w", err)
		}
	}

	httpClient := cfg.HTTPClient
	if httpClient == nil {
		timeout := cfg.Timeout
		if timeout <= 0 {
			timeout = 15 * time.Second
		}
		httpClient = &http.Client{Timeout: timeout}
	}

	return &Client{
		baseURL:     baseURL,
		tokenSource: ts,
		httpClient:  httpClient,
		toolset:     mastToolset,
	}, nil
}

// Toolset returns the underlying github.com/go-steer/mast/pkg/mcp ADK Toolset for agent use.
func (c *Client) Toolset() tool.Toolset {
	return c.toolset
}

type jsonRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      int64       `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

type jsonRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *jsonRPCError   `json:"error,omitempty"`
}

type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// CallTool executes an MCP tool on the remote server with read-only validation,
// using mast/pkg/mcp's toolset when available and unwrapping MCP text content blocks.
func (c *Client) CallTool(ctx context.Context, toolName string, arguments map[string]interface{}) (json.RawMessage, error) {
	if !AllowedReadTools[toolName] {
		return nil, fmt.Errorf("security guardrail: tool %q is not in the read-only whitelist", toolName)
	}

	reqID := c.requestID.Add(1)
	rpcReq := jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      reqID,
		Method:  "tools/call",
		Params: map[string]interface{}{
			"name":      toolName,
			"arguments": arguments,
		},
	}

	raw, err := c.doRPC(ctx, rpcReq)
	if err != nil {
		return nil, err
	}
	return unwrapMCPContent(raw), nil
}

// unwrapMCPContent extracts the inner JSON payload when an MCP server returns the
// standard {"content": [{"type": "text", "text": "..."}]} envelope.
func unwrapMCPContent(raw json.RawMessage) json.RawMessage {
	var env struct {
		IsError bool `json:"isError"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(raw, &env); err == nil && len(env.Content) > 0 {
		for _, item := range env.Content {
			if (item.Type == "text" || item.Type == "") && strings.TrimSpace(item.Text) != "" {
				trimmed := strings.TrimSpace(item.Text)
				if json.Valid([]byte(trimmed)) {
					return json.RawMessage(trimmed)
				}
				b, _ := json.Marshal(map[string]string{"output": trimmed})
				return json.RawMessage(b)
			}
		}
	}
	return raw
}

// ListTools retrieves the available tools from the MCP endpoint via mast/pkg/mcp or JSON-RPC.
func (c *Client) ListTools(ctx context.Context) ([]ToolInfo, error) {
	if c.toolset != nil {
		adkTools, err := c.toolset.Tools(roCtx{Context: ctx})
		if err == nil && len(adkTools) > 0 {
			out := make([]ToolInfo, 0, len(adkTools))
			for _, t := range adkTools {
				if !AllowedReadTools[t.Name()] {
					continue
				}
				out = append(out, ToolInfo{
					Name:        t.Name(),
					Description: t.Description(),
				})
			}
			return out, nil
		}
	}

	reqID := c.requestID.Add(1)
	rpcReq := jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      reqID,
		Method:  "tools/list",
	}

	raw, err := c.doRPC(ctx, rpcReq)
	if err != nil {
		return nil, err
	}

	var listResp struct {
		Tools []ToolInfo `json:"tools"`
	}
	if err := json.Unmarshal(raw, &listResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal tools/list response: %w", err)
	}

	return listResp.Tools, nil
}

func (c *Client) doRPC(ctx context.Context, rpcReq jsonRPCRequest) (json.RawMessage, error) {
	token, err := c.tokenSource.Token()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve ADC bearer token: %w", err)
	}

	bodyBytes, err := json.Marshal(rpcReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal JSON-RPC request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to construct HTTP request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+token.AccessToken)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("mcp HTTP transport error: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read MCP response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("mcp server returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(respBytes)))
	}

	var rpcResp jsonRPCResponse
	if err := json.Unmarshal(respBytes, &rpcResp); err != nil {
		return nil, fmt.Errorf("invalid JSON-RPC response from MCP server: %w", err)
	}

	if rpcResp.Error != nil {
		return nil, fmt.Errorf("mcp RPC error (%d): %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	return rpcResp.Result, nil
}
