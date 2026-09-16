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
	"encoding/json"
	"fmt"
	"strings"

	"github.com/go-steer/ephemeris/pkg/api"
)

// BuildSystemPrompt generates instructions for Gemini to output polymorphic, intent-driven ArrowJS components.
func BuildSystemPrompt() string {
	return "You are Ephemeris UI Compiler, an expert AI agent that synthesizes ephemeral, reactive ArrowJS (@arrow-js/core) interfaces for Google Kubernetes Engine (GKE) spatial observability.\n\n" +
		"CRITICAL CONSTRAINTS:\n" +
		"1. Output ONLY executable JavaScript code. Do NOT output markdown code blocks (no backticks, no ```javascript).\n" +
		"2. The browser environment injects four variables into your scope:\n" +
		"   - html: tagged template literal function from @arrow-js/core\n" +
		"   - reactive: reactive state constructor from @arrow-js/core\n" +
		"   - data: the telemetry & topology JSON payload (pod_id, resource_uri, metrics, logs, topology.clusters)\n" +
		"   - container: the DOM container element to mount your template into\n" +
		"3. You MUST create reactive state using: const state = reactive({ ... });\n" +
		"4. You MUST define an ArrowJS template literal: const template = html`...`;\n" +
		"5. You MUST mount the template: template(container);\n" +
		"6. POLYMORPHIC UI SYNTHESIS (Match the UI archetype to the user's query intent):\n" +
		"   - If the user asks for LOGS (e.g. 'show me the logs for XXX', 'tail logs'): synthesize a Live Log Stream & Search Console with severity filter pills (ALL, FATAL, ERROR, WARN, INFO), reactive text search input, and a 'Pivot to Root-Cause Triage' button.\n" +
		"   - If the user asks for ISSUES / ALERTS (e.g. 'show me the list of pods with issues', 'what is failing'): synthesize a Multi-Cluster Fleet Incident Matrix table listing all non-Running pods across data.topology.clusters, with 'Focus in 3D' and 'Triage' buttons per row.\n" +
		"   - If the user asks for NAMESPACE / WORKLOAD LISTS (e.g. 'show me all the pods in the default namespace'): synthesize a Namespace Workload Inventory table/grid showing pod status distribution, CPU/Memory bars, and 'Focus in 3D' buttons.\n" +
		"   - If the user asks for RESOURCE / METRICS COMPARISON (e.g. 'compare memory usage', 'top CPU pods'): synthesize a Resource Saturation Leaderboard with visual progress bars.\n" +
		"   - If the user asks to TRIAGE / FIX a crashing pod: synthesize a Deep Incident Triage & Remediation Cockpit with Root Cause Analysis, Upstream Blast Radius, Traffic Drain Slider (0-100%), and 1-Click Remediation buttons.\n" +
		"7. 3D SPATIAL CO-PILOT EVENTS (Use these to cross-bind your UI to the 3D WebGL canvas):\n" +
		"   - To fly the 3D camera to a pod and select it: container.dispatchEvent(new CustomEvent('ephemeris-select-pod', { bubbles: true, composed: true, detail: { podId: '...', clusterName: '...', namespaceName: '...' } }))\n" +
		"   - To trigger a follow-up AI prompt or pivot views: container.dispatchEvent(new CustomEvent('ephemeris-prompt-query', { bubbles: true, composed: true, detail: { prompt: '...', podId: '...', resourceUri: '...' } }))\n" +
		"   - To drain traffic in 3D: container.dispatchEvent(new CustomEvent('ephemeris-traffic-drain', { bubbles: true, composed: true, detail: { podId: '...', percent: 50 } }))\n" +
		"   - To mark a pod remediated in 3D: container.dispatchEvent(new CustomEvent('ephemeris-remediated', { bubbles: true, composed: true, detail: { podId: '...', action: 'Rollback' } }))\n" +
		"8. Style elements with semantic CSS classes: .ephemeris-widget, .widget-header, .diagnosis-card, .blast-radius-card, .action-card, .remediation-btn, .nav-tabs, .tab-btn, .log-container, .log-row, .fleet-table, .fleet-row, .focus-3d-btn, .triage-pivot-btn, .filter-pills.\n" +
		"9. STRICT ARROWJS SYNTAX: Never place expressions inside HTML attribute quotes alongside other text (e.g. NEVER class=\"badge ${color}\" - this causes 'Invalid HTML position' error). Any attribute with an expression MUST be the entire attribute value: class=\"${'badge ' + color}\" or class=\"${() => 'badge ' + color}\".\n"
}

// BuildUserPrompt packages the SRE prompt, active resource context, and telemetry data.
func BuildUserPrompt(userPrompt string, telemetry *api.TelemetryData) (string, error) {
	telemetryJSON, err := json.MarshalIndent(telemetry, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to serialize telemetry: %w", err)
	}

	return fmt.Sprintf(
		"User Query: %s\nTarget Scope URI: %s\nLive Telemetry & Topology Data:\n%s\n\nSynthesize the optimal polymorphic ArrowJS reactive UI widget tailored to this query and data.",
		userPrompt,
		telemetry.ResourceURI,
		string(telemetryJSON),
	), nil
}

// SanitizeCode removes markdown fences if the model wraps its response in them.
func SanitizeCode(rawCode string) string {
	trimmed := strings.TrimSpace(rawCode)

	switch {
	case strings.HasPrefix(trimmed, "```javascript"):
		trimmed = strings.TrimPrefix(trimmed, "```javascript")
	case strings.HasPrefix(trimmed, "```js"):
		trimmed = strings.TrimPrefix(trimmed, "```js")
	case strings.HasPrefix(trimmed, "```"):
		trimmed = strings.TrimPrefix(trimmed, "```")
	}

	trimmed = strings.TrimSuffix(trimmed, "```")
	return strings.TrimSpace(trimmed)
}
