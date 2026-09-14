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
	"fmt"
	"log"
	"os"

	"google.golang.org/genai"

	"github.com/go-steer/ephemeris/pkg/api"
)

// AgentConfig configures the Vertex AI client and model target.
type AgentConfig struct {
	Model     string
	Location  string
	ProjectID string
	ForceMock bool
}

// Agent coordinates prompt synthesis and ArrowJS code generation via Gemini.
type Agent struct {
	cfg         AgentConfig
	genaiClient *genai.Client
}

// NewAgent creates a new Agent configured for Vertex AI with ADC.
func NewAgent(ctx context.Context, cfg AgentConfig) *Agent {
	if cfg.Model == "" {
		cfg.Model = "gemini-3.8-flash"
	}
	if cfg.Location == "" {
		cfg.Location = "global"
	}

	agent := &Agent{cfg: cfg}

	if cfg.ForceMock {
		log.Printf("Agent initialized in mock fallback mode (ForceMock=true)")
		return agent
	}

	// Attempt to initialize GenAI Vertex client with ADC
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		Project:  cfg.ProjectID,
		Location: cfg.Location,
		Backend:  genai.BackendVertexAI,
	})
	if err != nil {
		log.Printf("Vertex AI client initialization skipped (%v); falling back to mock generator", err)
	} else {
		agent.genaiClient = client
		log.Printf("Vertex AI client initialized (model: %s, location: %s)", cfg.Model, cfg.Location)
	}

	return agent
}

// GenerateUI compiles an ephemeral ArrowJS component for the given incident context.
func (a *Agent) GenerateUI(ctx context.Context, userPrompt string, telemetry *api.TelemetryData) (string, error) {
	if a.genaiClient != nil && !a.cfg.ForceMock {
		code, err := a.generateWithVertex(ctx, userPrompt, telemetry)
		if err == nil && len(code) > 0 {
			return SanitizeCode(code), nil
		}
		log.Printf("Vertex AI generation failed or unavailable (%v); using deterministic fallback", err)
	}

	return a.generateFallback(userPrompt, telemetry), nil
}

func (a *Agent) generateWithVertex(ctx context.Context, userPrompt string, telemetry *api.TelemetryData) (string, error) {
	contentPrompt, err := BuildUserPrompt(userPrompt, telemetry)
	if err != nil {
		return "", err
	}

	systemInstruction := &genai.Content{
		Parts: []*genai.Part{
			{Text: BuildSystemPrompt()},
		},
	}

	resp, err := a.genaiClient.Models.GenerateContent(ctx, a.cfg.Model, genai.Text(contentPrompt), &genai.GenerateContentConfig{
		SystemInstruction: systemInstruction,
	})
	if err != nil {
		return "", fmt.Errorf("gemini generate content failed: %w", err)
	}

	if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil || len(resp.Candidates[0].Content.Parts) == 0 {
		return "", fmt.Errorf("empty response from model")
	}

	return resp.Candidates[0].Content.Parts[0].Text, nil
}

func (a *Agent) generateFallback(_ string, _ *api.TelemetryData) string {
	b := "`"
	return "// ArrowJS Ephemeral SRE Incident Panel\n" +
		"const state = reactive({\n" +
		"  filter: 'ALL',\n" +
		"  search: '',\n" +
		"  selectedLog: null,\n" +
		"  logs: data.logs || []\n" +
		"});\n\n" +
		"function getFilteredLogs() {\n" +
		"  return state.logs.filter(log => {\n" +
		"    const matchesFilter = state.filter === 'ALL' || log.severity === state.filter;\n" +
		"    const matchesSearch = !state.search || log.message.toLowerCase().includes(state.search.toLowerCase());\n" +
		"    return matchesFilter && matchesSearch;\n" +
		"  });\n" +
		"}\n\n" +
		"const template = html" + b + `
  <div class="ephemeris-widget">
    <div class="widget-header">
      <div class="title-group">
        <span class="badge status-${(data.metrics.status || 'running').toLowerCase()}">${data.metrics.status || 'Running'}</span>
        <span class="resource-title">${data.pod_id || 'Pod'}</span>
      </div>
      <div class="stats-group">
        <span class="stat-chip">Restarts: <strong>${data.metrics.restarts || '0'}</strong></span>
        <span class="stat-chip">CPU: <strong>${data.metrics.cpu || 'N/A'}</strong></span>
        <span class="stat-chip">Mem: <strong>${data.metrics.memory || 'N/A'}</strong></span>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-buttons">
        <button class="${() => state.filter === 'ALL' ? 'btn active' : 'btn'}" @click="${() => { state.filter = 'ALL'; }}">ALL</button>
        <button class="${() => state.filter === 'FATAL' ? 'btn active fatal' : 'btn'}" @click="${() => { state.filter = 'FATAL'; }}">FATAL</button>
        <button class="${() => state.filter === 'ERROR' ? 'btn active error' : 'btn'}" @click="${() => { state.filter = 'ERROR'; }}">ERROR</button>
        <button class="${() => state.filter === 'WARNING' ? 'btn active warning' : 'btn'}" @click="${() => { state.filter = 'WARNING'; }}">WARN</button>
        <button class="${() => state.filter === 'INFO' ? 'btn active info' : 'btn'}" @click="${() => { state.filter = 'INFO'; }}">INFO</button>
      </div>
      <input
        type="text"
        placeholder="Filter logs (regex or string)..."
        class="search-input"
        @input="${(e) => { state.search = e.target.value; }}"
      />
    </div>

    <div class="log-container">
      ${() => {
        const filtered = getFilteredLogs();
        if (filtered.length === 0) {
          return html` + b + `<div class="empty-state">No log entries match the selected filter.</div>` + b + `;
        }
        return filtered.map(log => html` + b + `
          <div class="log-row ${log.severity.toLowerCase()} ${() => state.selectedLog === log ? 'selected' : ''}" @click="${() => { state.selectedLog = (state.selectedLog === log ? null : log); }}">
            <span class="log-time">${log.timestamp.substring(11, 23)}</span>
            <span class="log-sev">[${log.severity}]</span>
            <span class="log-msg">${log.message}</span>
          </div>
        ` + b + `);
      }}
    </div>
  </div>
` + b + `;\n\ntemplate(container);\n`
}

// GetEnvOrDefault is a helper to read configuration from environment.
func GetEnvOrDefault(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
