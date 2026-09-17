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

// Package mcp implements an Application Default Credentials (ADC) authenticated
// HTTP transport for Google Cloud Managed Model Context Protocol (MCP) endpoints.
package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// AllowedReadTools defines the strict read-only whitelist of MCP tools.
// Any tool call attempting to invoke a tool outside this whitelist is
// rejected by the security guardrail.
var AllowedReadTools = map[string]bool{
	"list_gke_clusters":  true,
	"list_gke_resources": true,
	"list_namespaces":    true,
	"list_pods":          true,
	"get_cluster":        true,
	"get_pod":            true,
	"get_pod_details":    true,
	"query_logs":         true,
	"get_metrics":        true,
	// go-steer/k8s-lookout read-path MCP diagnostic tools
	"lookout_triage":   true,
	"lookout_logs":     true,
	"lookout_events":   true,
	"lookout_top":      true,
	"lookout_health":   true,
	"lookout_findings": true,
	"lookout_delta":    true,
	"lookout_state":    true,
}

// ToolInfo describes an available tool returned by MCP tools/list.
type ToolInfo struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	InputSchema json.RawMessage `json:"inputSchema,omitempty"`
}

// ClientConfig configures the MCP HTTP client.
type ClientConfig struct {
	BaseURL     string
	TokenSource oauth2.TokenSource
	HTTPClient  *http.Client
	Timeout     time.Duration
}

// Client interacts with Google Cloud Managed MCP servers over HTTP JSON-RPC.
type Client struct {
	baseURL     string
	tokenSource oauth2.TokenSource
	httpClient  *http.Client
	requestID   atomic.Int64
}

// NewClient initializes an MCP client for a specific GCP service endpoint.
func NewClient(ctx context.Context, cfg ClientConfig) (*Client, error) {
	if cfg.BaseURL == "" {
		return nil, fmt.Errorf("mcp baseURL is required")
	}

	ts := cfg.TokenSource
	if ts == nil {
		var err error
		ts, err = google.DefaultTokenSource(ctx, "https://www.googleapis.com/auth/cloud-platform")
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
		baseURL:     strings.TrimRight(cfg.BaseURL, "/"),
		tokenSource: ts,
		httpClient:  httpClient,
	}, nil
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

// CallTool executes an MCP tool on the remote server with read-only validation.
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

	return c.doRPC(ctx, rpcReq)
}

// ListTools retrieves the available tools from the MCP endpoint.
func (c *Client) ListTools(ctx context.Context) ([]ToolInfo, error) {
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

	var result struct {
		Tools []ToolInfo `json:"tools"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("failed to parse tools/list result: %w", err)
	}

	return result.Tools, nil
}

func (c *Client) doRPC(ctx context.Context, rpcReq jsonRPCRequest) (json.RawMessage, error) {
	token, err := c.tokenSource.Token()
	if err != nil {
		return nil, fmt.Errorf("failed to obtain bearer token: %w", err)
	}

	bodyBytes, err := json.Marshal(rpcReq)
	if err != nil {
		return nil, fmt.Errorf("failed to encode rpc request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/tools/call", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "ephemeris-mcp-client/1.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mcp request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mcp http error %d: %s", resp.StatusCode, resp.Status)
	}

	var rpcResp jsonRPCResponse
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return nil, fmt.Errorf("failed to decode mcp response: %w", err)
	}

	if rpcResp.Error != nil {
		return nil, fmt.Errorf("mcp error (%d): %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	return rpcResp.Result, nil
}
