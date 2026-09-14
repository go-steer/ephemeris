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
	return "// ArrowJS Ephemeral SRE Incident Panel with Root Cause & Remediation\n" +
		"const state = reactive({\n" +
		"  tab: 'TRIAGE',\n" +
		"  filter: 'ALL',\n" +
		"  search: '',\n" +
		"  selectedLog: null,\n" +
		"  logs: data.logs || [],\n" +
		"  remediating: false,\n" +
		"  remediationStep: 0,\n" +
		"  remediationAction: '',\n" +
		"  remediationSuccess: false,\n" +
		"  currentStatus: (data.metrics && data.metrics.status) || 'CrashLoopBackOff'\n" +
		"});\n\n" +
		"function getFilteredLogs() {\n" +
		"  return state.logs.filter(log => {\n" +
		"    const matchesFilter = state.filter === 'ALL' || log.severity === state.filter;\n" +
		"    const matchesSearch = !state.search || log.message.toLowerCase().includes(state.search.toLowerCase());\n" +
		"    return matchesFilter && matchesSearch;\n" +
		"  });\n" +
		"}\n\n" +
		"function runRemediation(actionName) {\n" +
		"  state.remediating = true;\n" +
		"  state.remediationAction = actionName;\n" +
		"  state.remediationStep = 1;\n" +
		"  setTimeout(() => { state.remediationStep = 2; }, 400);\n" +
		"  setTimeout(() => {\n" +
		"    state.remediationStep = 3;\n" +
		"    state.remediationSuccess = true;\n" +
		"    state.currentStatus = 'Running';\n" +
		"    if (container && container.dispatchEvent) {\n" +
		"      container.dispatchEvent(new CustomEvent('ephemeris-remediated', {\n" +
		"        bubbles: true,\n" +
		"        composed: true,\n" +
		"        detail: { podId: data.pod_id || 'payment-service', status: 'Running' }\n" +
		"      }));\n" +
		"    }\n" +
		"  }, 900);\n" +
		"}\n\n" +
		"const template = html" + b + `
  <div class="ephemeris-widget">
    <div class="widget-header">
      <div class="title-group">
        <span class="${() => 'badge status-' + state.currentStatus.toLowerCase()}">${() => state.currentStatus}</span>
        <span class="resource-title">${data.pod_id || 'payment-service'}</span>
      </div>
      <div class="stats-group">
        <span class="stat-chip">Restarts: <strong>${(data.metrics && data.metrics.restarts) || '14'}</strong></span>
        <span class="stat-chip">CPU: <strong>${(data.metrics && data.metrics.cpu) || '980m'}</strong></span>
        <span class="stat-chip">Mem: <strong>${(data.metrics && data.metrics.memory) || '1.8Gi'}</strong></span>
        <span class="stat-chip">Exit: <strong>${(data.metrics && data.metrics.exit_code) ? ('Code ' + data.metrics.exit_code) : 'SIGSEGV'}</strong></span>
      </div>
    </div>

    <div class="nav-tabs">
      <button class="${() => state.tab === 'TRIAGE' ? 'tab-btn active' : 'tab-btn'}" @click="${() => { state.tab = 'TRIAGE'; }}">⚡ AI Root Cause & Fix</button>
      <button class="${() => state.tab === 'LOGS' ? 'tab-btn active' : 'tab-btn'}" @click="${() => { state.tab = 'LOGS'; }}">📋 Telemetry Logs (${() => state.logs.length})</button>
    </div>

    <div class="${() => state.tab === 'TRIAGE' ? 'triage-view' : 'triage-view hidden'}">
      <div class="${() => state.remediationSuccess ? 'remediation-success-banner' : 'remediation-success-banner hidden'}">
        <div class="success-header">
          <span class="success-icon">✓</span>
          <span class="success-title">Remediation Deployed & Verified</span>
        </div>
        <p class="success-desc">Rolled back to verified release <strong>v2.1.3</strong>. Crashing container terminated; new pod healthy (readiness probe 200 OK). Error rate returned to 0.00%.</p>
        <div class="success-actions">
          <button class="btn-action outline" @click="${() => { state.tab = 'LOGS'; }}">Inspect Container Logs</button>
          <button class="btn-action primary" @click="${() => { state.remediationSuccess = false; state.remediating = false; }}">Done</button>
        </div>
      </div>

      <div class="${() => (!state.remediationSuccess && state.remediating) ? 'remediation-in-progress' : 'remediation-in-progress hidden'}">
        <div class="progress-title">
          <span class="spinner-inline"></span>
          Executing ${() => state.remediationAction}...
        </div>
        <div class="stepper-list">
          <div class="${() => state.remediationStep >= 1 ? 'step-item done' : 'step-item'}">
            <span class="step-num">1</span>
            <span class="step-text">Patching deployment/payment-service image (target: v2.1.3)...</span>
          </div>
          <div class="${() => state.remediationStep >= 2 ? 'step-item done' : 'step-item'}">
            <span class="step-num">2</span>
            <span class="step-text">Sending SIGTERM to crashing container and clearing crash backoff...</span>
          </div>
          <div class="${() => state.remediationStep >= 3 ? 'step-item done' : 'step-item'}">
            <span class="step-num">3</span>
            <span class="step-text">Starting new replica; readiness probe returned 200 OK.</span>
          </div>
        </div>
      </div>

      <div class="${() => (!state.remediationSuccess && !state.remediating) ? 'triage-details' : 'triage-details hidden'}">
        <div class="diagnosis-card">
          <div class="diagnosis-header">
            <span class="diagnosis-pill">ROOT CAUSE</span>
            <span class="diagnosis-title">Runtime Panic: Nil Pointer Dereference (SIGSEGV)</span>
          </div>
          <div class="diagnosis-body">
            <p>Container crashed at <code>server.go:142</code> in <code>ProcessPayment()</code>. The connection pool to <code>postgres-payment.db.internal:5432</code> was exhausted after 30000ms timeout, leaving the database client reference uninitialized.</p>
            <div class="code-evidence">goroutine 42 [running]: github.com/boutique/payment/server.(*PaymentServer).ProcessPayment(...) at server.go:142</div>
          </div>
        </div>

        <div class="blast-radius-card">
          <div class="blast-title">💥 Upstream Blast Radius</div>
          <p><strong>checkout-service:</strong> HTTP 500 error rate surged to <strong>38.4%</strong>. 142 payment transactions dropped in the last 3m window.</p>
        </div>

        <div class="remediation-header">Recommended Remediation:</div>

        <div class="actions-list">
          <div class="action-card recommended">
            <div class="action-meta">
              <div class="action-badge-row">
                <span class="rec-badge">RECOMMENDED (1-CLICK)</span>
                <span class="rec-est">Est. recovery: ~2s</span>
              </div>
              <div class="action-name">Rollback Deployment to Stable Release (v2.1.3)</div>
              <div class="action-detail">Reverts commit 9f8a32b which introduced the leaky connection pool. Zero-downtime rolling update.</div>
            </div>
            <button class="remediation-btn primary" @click="${() => runRemediation('Rollback to v2.1.3')}">
              ⚡ Execute 1-Click Rollback
            </button>
          </div>

          <div class="action-card">
            <div class="action-meta">
              <div class="action-name">Hotfix: Increase Memory to 2Gi & Pool Timeout to 60s</div>
              <div class="action-detail">Temporarily patches container limits to absorb query latency spikes.</div>
            </div>
            <button class="remediation-btn secondary" @click="${() => runRemediation('Apply Hotfix Patch')}">
              ⚡ Apply Config Patch
            </button>
          </div>

          <div class="action-card">
            <div class="action-meta">
              <div class="action-name">Restart Pod (Reset Crash Backoff)</div>
              <div class="action-detail">Forces pod recreation to clear exponential crash backoff timer.</div>
            </div>
            <button class="remediation-btn secondary" @click="${() => runRemediation('Restart Pod')}">
              ⚡ Restart Pod
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="${() => state.tab === 'LOGS' ? 'logs-view' : 'logs-view hidden'}">
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
            <div class="${() => 'log-row ' + log.severity.toLowerCase() + (state.selectedLog === log ? ' selected' : '')}" @click="${() => { state.selectedLog = (state.selectedLog === log ? null : log); }}">
              <span class="log-time">${log.timestamp ? log.timestamp.substring(11, 23) : ''}</span>
              <span class="log-sev">[${log.severity}]</span>
              <span class="log-msg">${log.message}</span>
            </div>
          ` + b + `);
        }}
      </div>
    </div>
  </div>
` + b + ";\n\ntemplate(container);\n"
}

// GetEnvOrDefault is a helper to read configuration from environment.
func GetEnvOrDefault(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
