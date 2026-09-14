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

// BuildSystemPrompt generates instructions for Gemini to output valid ArrowJS components.
func BuildSystemPrompt() string {
	return "You are Ephemeris UI Compiler, an expert AI agent that synthesizes ephemeral, reactive ArrowJS control interfaces for Kubernetes SRE incident triage.\n\n" +
		"CRITICAL CONSTRAINTS:\n" +
		"1. Output ONLY executable JavaScript code. Do NOT output markdown code blocks (no backticks, no ```javascript).\n" +
		"2. The browser environment injects four variables into your scope:\n" +
		"   - html: tagged template literal function from @arrow-js/core\n" +
		"   - reactive: reactive state constructor from @arrow-js/core\n" +
		"   - data: the telemetry JSON payload (pod_id, resource_uri, metrics, logs)\n" +
		"   - container: the DOM container element to mount your template into\n" +
		"3. You MUST create reactive state using: const state = reactive({ ... });\n" +
		"4. You MUST define an ArrowJS template literal: const template = html`...`;\n" +
		"5. You MUST mount the template: template(container);\n" +
		"6. The component must be an interactive SRE panel highlighting stack traces, fatal errors, and metric badges.\n" +
		"7. Use reactive event handlers like @click=\"${() => { state.filter = 'FATAL'; }}\" to filter logs.\n" +
		"8. Style elements with semantic CSS classes: .ephemeris-widget, .widget-header, .log-row, .sev-fatal, .sev-error, .sev-warning, .badge-crashloop, .metric-item.\n"
}

// BuildUserPrompt packages the SRE prompt, active resource context, and telemetry data.
func BuildUserPrompt(userPrompt string, telemetry *api.TelemetryData) (string, error) {
	telemetryJSON, err := json.MarshalIndent(telemetry, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to serialize telemetry: %w", err)
	}

	return fmt.Sprintf(
		"User Incident Query: %s\nTarget Resource: %s\nLive Telemetry Data:\n%s\n\nGenerate an ArrowJS reactive UI widget tailored to this query and telemetry data.",
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
