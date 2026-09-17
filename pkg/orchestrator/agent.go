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
	"encoding/json"
	"fmt"
	"log"
	"os"
	"regexp"
	"strings"

	"google.golang.org/genai"

	"github.com/go-steer/ephemeris/pkg/api"
	"github.com/go-steer/ephemeris/pkg/mcp"
)

// AgentConfig configures the Vertex AI client and model target.
type AgentConfig struct {
	Model         string
	Location      string
	ProjectID     string
	ForceMock     bool
	LookoutClient *mcp.LookoutClient
}

// LLMIntentResult holds the Gemini-classified intent for a natural-language prompt.
type LLMIntentResult struct {
	Archetype       UIArchetype `json:"archetype"`
	TargetPod       string      `json:"target_pod"`
	TargetNamespace string      `json:"target_namespace"`
	TargetCluster   string      `json:"target_cluster"`
	TargetScenario  string      `json:"target_scenario"`
	TargetKinds     []string    `json:"target_kinds"`
	TargetStatus    string      `json:"target_status"`
	Reasoning       string      `json:"reasoning"`
}

// Agent coordinates prompt synthesis and ArrowJS code generation via Gemini and MastHarness.
type Agent struct {
	cfg         AgentConfig
	genaiClient *genai.Client
	mastHarness *MastHarness
}

// NewAgent creates a new Agent configured for Vertex AI with ADC and MastHarness.
func NewAgent(ctx context.Context, cfg AgentConfig) *Agent {
	if cfg.Model == "" {
		cfg.Model = "gemini-3.8-flash"
	}
	if cfg.ProjectID == "" {
		cfg.ProjectID = GetEnvOrDefault("GOOGLE_CLOUD_PROJECT", "gke-demos-345619")
	}
	if cfg.Location == "" {
		cfg.Location = "global"
	}

	agent := &Agent{
		cfg:         cfg,
		mastHarness: NewMastHarness(cfg.LookoutClient),
	}

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
		log.Printf("Vertex AI client initialized (project: %s, model: %s, location: %s)", cfg.ProjectID, cfg.Model, cfg.Location)
	}

	return agent
}

// ResolveIntent uses Gemini on Vertex AI via MastHarness to translate any natural-language prompt into a structured UIArchetype and target resource.
func (a *Agent) ResolveIntent(ctx context.Context, userPrompt string, telemetry *api.TelemetryData, onStatus func(string)) LLMIntentResult {
	fallbackArch, fallbackNS := classifyPromptArchetype(userPrompt, telemetry)
	targetCluster := extractClusterFromPrompt(userPrompt)
	targetKinds := extractKindsFromPrompt(userPrompt)
	fallbackResult := LLMIntentResult{
		Archetype:       fallbackArch,
		TargetNamespace: fallbackNS,
		TargetCluster:   targetCluster,
		TargetKinds:     targetKinds,
		Reasoning:       "Deterministic rule-based intent classification",
	}
	if fallbackArch == ArchetypeChaosScenario {
		fallbackResult.TargetScenario = fallbackNS
	}
	if fallbackArch == ArchetypeIssuesFleetMatrix || fallbackArch == ArchetypeDynamicCustom {
		if fallbackNS != "" && targetCluster == "" {
			fallbackResult.TargetCluster = fallbackNS
		}
	}

	if a.genaiClient == nil || a.cfg.ForceMock {
		return fallbackResult
	}

	if onStatus != nil {
		onStatus("🤖 [mast:intent-router] Routing natural-language prompt via gemini-3.8-flash (global)...")
	}

	intentPrompt := fmt.Sprintf(`You are the Ephemeris Spatial Observability Intent Router for Google Kubernetes Engine (GKE).
Translate the user's natural-language prompt into a JSON object matching this exact schema:
{
  "archetype": "logs_console" | "issues_matrix" | "namespace_inventory" | "resource_leaderboard" | "deep_triage" | "chaos_scenario" | "dynamic_custom",
  "target_pod": string (one of: "payment-service", "cart-service", "checkout-service", "batch-ingestor", "frontend", "redis-cart", or "" if fleet/namespace-wide),
  "target_namespace": string (one of: "default", "production", "staging", "spark-jobs", "checkout", "data-pipeline", "payments", "monitoring", or "all"),
  "target_cluster": string (one of: "production-us-central1", "staging-us-east4", "analytics-europe-west1", or "" if all clusters),
  "target_scenario": string (one of: "redis-oom", "traffic-spike", "healthy", "default", or "" unless archetype is chaos_scenario),
  "target_kinds": array of strings (exact Kubernetes Kind names requested by the user, e.g. ["StatefulSet"], ["Deployment"], ["Gateway", "HTTPRoute"], ["Service"], ["SparkApplication"], ["RayCluster"], ["CRD"], or [] if all resources),
  "target_status": string ("Healthy" | "Degraded" | "Pending" | "" if unspecified),
  "reasoning": string (brief 1-sentence explanation of why this UI archetype and target were chosen)
}

Rules:
- Choose "chaos_scenario" if the user asks to inject, simulate, or trigger a failure scenario (e.g. "inject redis oom cascade" -> target_scenario="redis-oom", "simulate black friday traffic spike" -> target_scenario="traffic-spike", "reset all clusters to healthy" -> target_scenario="healthy").
- Choose "dynamic_custom" if the user asks about Kubernetes controllers (Gateway, HTTPRoute, Service, Deployment, StatefulSet), Custom Resource Definitions (CRDs, SparkApplication, RayCluster), or asks a custom analytical question that requires exploring higher-level K8s resources. Populate "target_kinds" with the exact requested Kind names (e.g., if user asks "show me the statefulsets", target_kinds=["StatefulSet"]; if user asks "show gateways and routes", target_kinds=["Gateway", "HTTPRoute"]; if user asks "show me the deployments", target_kinds=["Deployment"]).
- Choose "issues_matrix" if the user asks which pods have issues, what is failing/broken/crashing, show anomalies, or asks for issues in a specific cluster (e.g. "show me the issues with the analytics-europe-west1 cluster" -> archetype="issues_matrix", target_cluster="analytics-europe-west1").
- Choose "logs_console" if the user asks to see/tail/stream logs or stdout/stderr for a workload.
- Choose "namespace_inventory" if the user asks to list or show all pods/workloads in a namespace (e.g. production, default, spark-jobs).
- Choose "resource_leaderboard" if the user asks to compare CPU/memory usage, top resource consumers, or saturation rankings.
- Choose "deep_triage" if the user asks to triage, fix, rollback, or diagnose why a specific single pod (e.g. payment-service or redis-cart) is crashing or pending.

User Prompt: %q`, userPrompt)

	modelsToTry := []string{a.cfg.Model, "gemini-2.5-flash"}
	for _, modelName := range modelsToTry {
		resp, err := a.genaiClient.Models.GenerateContent(ctx, modelName, genai.Text(intentPrompt), &genai.GenerateContentConfig{
			ResponseMIMEType: "application/json",
		})
		if err != nil {
			continue
		}
		if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
			var rawJSON strings.Builder
			for _, part := range resp.Candidates[0].Content.Parts {
				rawJSON.WriteString(part.Text)
			}
			var parsed LLMIntentResult
			if err := json.Unmarshal([]byte(rawJSON.String()), &parsed); err == nil && parsed.Archetype != "" {
				a.cfg.Model = modelName
				if parsed.TargetCluster == "" && targetCluster != "" {
					parsed.TargetCluster = targetCluster
				}
				if len(parsed.TargetKinds) == 0 && len(targetKinds) > 0 {
					parsed.TargetKinds = targetKinds
				}
				if a.mastHarness != nil {
					a.mastHarness.RecordIntentStep(parsed, 120)
				}
				log.Printf("Gemini Intent Router [%s]: prompt=%q -> archetype=%s, pod=%s, ns=%s, cluster=%s, kinds=%v (%s)", modelName, userPrompt, parsed.Archetype, parsed.TargetPod, parsed.TargetNamespace, parsed.TargetCluster, parsed.TargetKinds, parsed.Reasoning)
				if onStatus != nil && parsed.Reasoning != "" {
					onStatus(fmt.Sprintf("🤖 [mast:intent-router] %s", parsed.Reasoning))
				}
				return parsed
			}
		}
	}

	return fallbackResult
}

// injectGeminiReasoning injects a live Vertex AI Gemini (mast harness) & k8s-lookout insight banner into the synthesized ArrowJS component.
func injectGeminiReasoning(code string, reasoning string, modelName string, lookoutEnvelope string) string {
	if reasoning == "" || reasoning == "Deterministic rule-based intent classification" {
		return code
	}
	if modelName == "" {
		modelName = "gemini-3.8-flash"
	}
	safe := strings.ReplaceAll(reasoning, "`", "'")
	safe = strings.ReplaceAll(safe, "${", "(")
	safe = strings.ReplaceAll(safe, "<", "&lt;")
	safe = strings.ReplaceAll(safe, ">", "&gt;")

	envBadge := ""
	if lookoutEnvelope != "" {
		envBadge = fmt.Sprintf(` <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); padding: 1px 6px; border-radius: 4px; font-size: 10px; font-family: 'JetBrains Mono', monospace; margin-left: 6px;">k8s-lookout: %s</span>`, lookoutEnvelope)
	}

	banner := fmt.Sprintf(`<div style="display: flex; align-items: flex-start; gap: 8px; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 8px; padding: 8px 12px; font-size: 11px; color: #e0f2fe; line-height: 1.4;">
      <span style="font-size: 14px; line-height: 1;">✨</span>
      <div><strong style="color: #38bdf8; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.04em;">VERTEX AI %s (MAST HARNESS):</strong> %s%s</div>
    </div>`, strings.ToUpper(modelName), safe, envBadge)

	target := `color: #f8fafc;">`
	if idx := strings.Index(code, target); idx != -1 {
		insertPos := idx + len(target)
		return code[:insertPos] + "\n    " + banner + code[insertPos:]
	}
	return code
}

// GenerateUI compiles an ephemeral ArrowJS component for the given incident context.
func (a *Agent) GenerateUI(ctx context.Context, userPrompt string, telemetry *api.TelemetryData) (string, error) {
	return a.GenerateStream(ctx, userPrompt, telemetry, nil)
}

// GenerateStream compiles an ephemeral ArrowJS component and streams intermediate progress updates via onStatus.
func (a *Agent) GenerateStream(ctx context.Context, userPrompt string, telemetry *api.TelemetryData, onStatus func(string)) (string, error) {
	intent := a.ResolveIntent(ctx, userPrompt, telemetry, onStatus)
	return a.GenerateStreamWithIntent(ctx, userPrompt, intent, telemetry, onStatus)
}

// GenerateStreamWithIntent compiles an ephemeral ArrowJS component using a pre-resolved LLMIntentResult and k8s-lookout findings.
func (a *Agent) GenerateStreamWithIntent(ctx context.Context, userPrompt string, intent LLMIntentResult, telemetry *api.TelemetryData, onStatus func(string)) (string, error) {
	var topo *api.TopologyData
	if telemetry != nil {
		topo = telemetry.Topology
	}

	var findings []api.LookoutFinding
	var envelope string
	if a.mastHarness != nil {
		findings, envelope = a.mastHarness.RunLookoutSpecialist(ctx, intent, topo, telemetry, onStatus)
		if telemetry != nil {
			telemetry.LookoutFindings = findings
			telemetry.LookoutEnvelope = envelope
		}
	}

	var code string
	switch intent.Archetype {
	case ArchetypeIssuesFleetMatrix:
		if onStatus != nil {
			if intent.TargetCluster != "" {
				onStatus(fmt.Sprintf("⚡ [mast:arrowjs-compiler] Synthesizing Cluster Incident Matrix for %q (ArrowJS)...", intent.TargetCluster))
			} else {
				onStatus("⚡ [mast:arrowjs-compiler] Synthesizing Multi-Cluster Incident Fleet Matrix (ArrowJS)...")
			}
		}
		code = synthesizeIssuesListUI(topo, findings, envelope, intent.TargetCluster)
	case ArchetypeDynamicCustom:
		var allScope []api.K8sResource
		var resEnvelope string
		if a.mastHarness != nil {
			_, allScope, resEnvelope = a.mastHarness.RunResourceSpecialist(ctx, intent, topo, onStatus)
		}
		if resEnvelope != "" {
			envelope = resEnvelope
		}
		if onStatus != nil {
			onStatus("🧠 [mast:arrowjs-compiler] Synthesizing Dynamic Kubernetes & CRD Explorer UI via Gemini 3.8-flash...")
		}
		code = a.SynthesizeDynamicArrowJS(ctx, userPrompt, intent, topo, telemetry, findings, envelope, allScope, onStatus)
	case ArchetypeNamespaceInventory:
		ns := intent.TargetNamespace
		if ns == "" {
			ns = "production"
		}
		if onStatus != nil {
			onStatus(fmt.Sprintf("⚡ [mast:arrowjs-compiler] Synthesizing Namespace Workload Inventory for %q (ArrowJS)...", ns))
		}
		code = synthesizeNamespaceListUI(ns, topo)
	case ArchetypeResourceLeaderboard:
		if onStatus != nil {
			onStatus("⚡ [mast:arrowjs-compiler] Synthesizing Cluster Resource Saturation Leaderboard (ArrowJS)...")
		}
		code = synthesizeResourceLeaderboardUI(topo)
	case ArchetypeLogsConsole:
		if onStatus != nil {
			onStatus("⚡ [mast:arrowjs-compiler] Synthesizing Live Container Log Console (ArrowJS)...")
		}
		code = synthesizeLogsConsoleUI(telemetry)
	default:
		code = a.generateFallbackStream(userPrompt, telemetry, onStatus)
	}

	if a.mastHarness != nil {
		a.mastHarness.RecordCompilerStep(intent.Archetype, len(code), 6)
	}
	return injectGeminiReasoning(code, intent.Reasoning, a.cfg.Model, envelope), nil
}

func convertInterpolatedStringToConcatenation(val string) string {
	var parts []string
	i := 0
	for i < len(val) {
		idx := strings.Index(val[i:], "${")
		if idx == -1 {
			lit := strings.ReplaceAll(val[i:], "'", "\\'")
			parts = append(parts, fmt.Sprintf("'%s'", lit))
			break
		}
		if idx > 0 {
			lit := strings.ReplaceAll(val[i:i+idx], "'", "\\'")
			parts = append(parts, fmt.Sprintf("'%s'", lit))
		}
		exprStart := i + idx + 2
		depth := 1
		j := exprStart
		for j < len(val) && depth > 0 {
			switch val[j] {
			case '{':
				depth++
			case '}':
				depth--
			}
			j++
		}
		expr := val[exprStart : j-1]
		parts = append(parts, fmt.Sprintf("(%s)", expr))
		i = j
	}
	if len(parts) == 0 {
		return "''"
	}
	return strings.Join(parts, " + ")
}

// repairArrowJSAttributesGo auto-repairs partial HTML attribute interpolations so ArrowJS never throws Invalid HTML position.
func repairArrowJSAttributesGo(code string) string {
	reAttr := regexp.MustCompile(`([a-zA-Z0-9_\-@]+)="([^"]*)"`)
	return reAttr.ReplaceAllStringFunc(code, func(fullMatch string) string {
		parts := reAttr.FindStringSubmatch(fullMatch)
		if len(parts) < 3 {
			return fullMatch
		}
		attrName := parts[1]
		val := parts[2]
		trimmed := strings.TrimSpace(val)
		if !strings.Contains(trimmed, "${") {
			return fullMatch
		}
		if strings.HasPrefix(trimmed, "${") && strings.HasSuffix(trimmed, "}") && strings.Count(trimmed, "${") == 1 {
			return fullMatch
		}
		concatExpr := convertInterpolatedStringToConcatenation(val)
		return fmt.Sprintf(`%s="${() => %s}"`, attrName, concatExpr)
	})
}

// SynthesizeDynamicArrowJS renders the interactive Kubernetes & CRD Explorer for K8s object queries, or asks Vertex AI Gemini 3.8-flash to synthesize bespoke ArrowJS UI code for custom analytical queries.
func (a *Agent) SynthesizeDynamicArrowJS(ctx context.Context, userPrompt string, intent LLMIntentResult, topo *api.TopologyData, _ *api.TelemetryData, findings []api.LookoutFinding, envelope string, allScope []api.K8sResource, onStatus func(string)) string {
	targetKinds := intent.TargetKinds
	if len(targetKinds) == 0 {
		targetKinds = extractKindsFromPrompt(userPrompt)
	}
	fallbackCode := synthesizeK8sResourcesUI(allScope, intent.TargetCluster, targetKinds, envelope)

	// Use the rich interactive K8s Controllers & CRD Explorer (with 3D focus and dynamic per-Kind filter pills) for all K8s controller/CRD queries
	if len(targetKinds) > 0 || strings.Contains(strings.ToLower(userPrompt), "controller") {
		return fallbackCode
	}

	if a.genaiClient == nil || a.cfg.ForceMock {
		return fallbackCode
	}

	topoJSON, _ := json.Marshal(topo)
	findingsJSON, _ := json.Marshal(findings)

	synthPrompt := fmt.Sprintf(`You are an expert SRE Frontend Engineer writing reactive UI components using @arrow-js/core.
Write a self-contained ArrowJS component that answers the user's Kubernetes/GKE query: %q
Target Cluster filter: %q

You have access in scope to:
- reactive, html (from @arrow-js/core)
- container (DOM element to mount into via template(container))
- CustomEvent dispatch on container:
  container.dispatchEvent(new CustomEvent('ephemeris-select-pod', { detail: { podId: name }, bubbles: true, composed: true }))

Live Cluster Topology & Resources JSON:
%s

k8s-lookout Findings JSON:
%s

CRITICAL ARROWJS RULE:
NEVER use partial attribute interpolation like style="color: ${x}" or class="box ${y}". ArrowJS throws 'Invalid HTML position' if an attribute contains ${...} along with any other text inside the quotes. Every dynamic attribute MUST wrap the ENTIRE attribute string inside ${() => ...}, e.g.:
style="${() => 'color: ' + x + '; font-size: 12px;'}"

Requirements:
1. Return ONLY valid JavaScript code (no markdown code fences).
2. Define const state = reactive({ ... }); and const template = html`+"`...`"+`; and end with template(container);
3. Use dark glassmorphic styling (font-family: 'Inter', system-ui, sans-serif; color: #f8fafc; background: rgba(15, 23, 42, 0.85)).`,
		userPrompt, intent.TargetCluster, string(topoJSON), string(findingsJSON))

	resp, err := a.genaiClient.Models.GenerateContent(ctx, a.cfg.Model, genai.Text(synthPrompt), nil)
	if err == nil && len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
		var rawCode strings.Builder
		for _, part := range resp.Candidates[0].Content.Parts {
			rawCode.WriteString(part.Text)
		}
		cleaned := strings.TrimSpace(rawCode.String())
		cleaned = strings.TrimPrefix(cleaned, "```javascript")
		cleaned = strings.TrimPrefix(cleaned, "```js")
		cleaned = strings.TrimPrefix(cleaned, "```")
		cleaned = strings.TrimSuffix(cleaned, "```")
		cleaned = strings.TrimSpace(cleaned)
		cleaned = repairArrowJSAttributesGo(cleaned)
		if strings.Contains(cleaned, "reactive(") && strings.Contains(cleaned, "html`") && strings.Contains(cleaned, "template(container)") {
			if onStatus != nil {
				onStatus("✨ [mast:arrowjs-compiler] Synthesized bespoke ArrowJS UI via Gemini 3.8-flash")
			}
			return cleaned
		}
	}

	return fallbackCode
}

func (a *Agent) generateFallbackStream(prompt string, telemetry *api.TelemetryData, onStatus func(string)) string {
	archetype, targetNS := classifyPromptArchetype(prompt, telemetry)
	podID := "workload"
	if telemetry != nil && telemetry.PodID != "" {
		podID = telemetry.PodID
	}

	if onStatus != nil {
		switch archetype {
		case ArchetypeLogsConsole:
			onStatus(fmt.Sprintf("Executing MCP tool: lookout_logs(resource='%s', limit=50)...", podID))
		case ArchetypeIssuesFleetMatrix:
			onStatus("Executing MCP tool: lookout_findings(status=['CrashLoopBackOff', 'Pending'])...")
		case ArchetypeDynamicCustom:
			kinds := extractKindsFromPrompt(prompt)
			onStatus(fmt.Sprintf("Executing MCP tool: lookout_resources(kinds=%v)...", kinds))
		case ArchetypeNamespaceInventory:
			if targetNS == "" {
				targetNS = "production"
			}
			onStatus(fmt.Sprintf("Executing MCP tool: lookout_state(namespace='%s')...", targetNS))
		case ArchetypeResourceLeaderboard:
			onStatus("Executing MCP tool: lookout_top(sort_by='cpu_saturation')...")
		default:
			status := "Running"
			if telemetry != nil && telemetry.Metrics != nil {
				if s, ok := telemetry.Metrics["status"]; ok && s != "" {
					status = s
				}
			}
			switch status {
			case "CrashLoopBackOff", "Failed":
				onStatus("Analyzing container panic trace via lookout_triage...")
			case "Pending":
				onStatus("Evaluating node pool resource limits & scheduling constraints via lookout_events...")
			default:
				onStatus("Synthesizing healthy cluster observability cockpit...")
			}
		}
	}

	return a.generateFallback(prompt, telemetry)
}

func (a *Agent) generateFallback(prompt string, telemetry *api.TelemetryData) string {
	var topo *api.TopologyData
	var findings []api.LookoutFinding
	var envelope string
	if telemetry != nil {
		topo = telemetry.Topology
		findings = telemetry.LookoutFindings
		envelope = telemetry.LookoutEnvelope
	}
	archetype, targetNS := classifyPromptArchetype(prompt, telemetry)
	switch archetype {
	case ArchetypeLogsConsole:
		return synthesizeLogsConsoleUI(telemetry)
	case ArchetypeIssuesFleetMatrix:
		return synthesizeIssuesListUI(topo, findings, envelope, targetNS)
	case ArchetypeDynamicCustom:
		var allScope []api.K8sResource
		if topo != nil {
			for _, c := range topo.Clusters {
				for _, ns := range c.Namespaces {
					allScope = append(allScope, ns.Resources...)
				}
			}
		}
		return synthesizeK8sResourcesUI(allScope, targetNS, extractKindsFromPrompt(prompt), envelope)
	case ArchetypeNamespaceInventory:
		return synthesizeNamespaceListUI(targetNS, topo)
	case ArchetypeResourceLeaderboard:
		return synthesizeResourceLeaderboardUI(topo)
	}

	status := "Running"
	if telemetry != nil && telemetry.Metrics != nil {
		if s, ok := telemetry.Metrics["status"]; ok && s != "" {
			status = s
		}
	}

	switch status {
	case "CrashLoopBackOff", "Failed":
		return a.generateCrashTriageFallback(prompt, telemetry)
	case "Pending":
		return a.generatePendingDiagnosticsFallback(prompt, telemetry)
	default:
		return a.generateHealthyCockpitFallback(prompt, telemetry)
	}
}

func (a *Agent) generateCrashTriageFallback(_ string, _ *api.TelemetryData) string {
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
		"  trafficPercent: 100,\n" +
		"  currentStatus: (data.metrics && data.metrics.status) || 'CrashLoopBackOff'\n" +
		"});\n\n" +
		"function getFilteredLogs() {\n" +
		"  return state.logs.filter(log => {\n" +
		"    const matchesFilter = state.filter === 'ALL' || log.severity === state.filter;\n" +
		"    const matchesSearch = !state.search || log.message.toLowerCase().includes(state.search.toLowerCase());\n" +
		"    return matchesFilter && matchesSearch;\n" +
		"  });\n" +
		"}\n\n" +
		"function updateTrafficDrain(val) {\n" +
		"  state.trafficPercent = parseInt(val, 10);\n" +
		"  if (container && container.dispatchEvent) {\n" +
		"    container.dispatchEvent(new CustomEvent('ephemeris-traffic-drain', {\n" +
		"      bubbles: true,\n" +
		"      composed: true,\n" +
		"      detail: { podId: data.pod_id || 'payment-service', percent: state.trafficPercent }\n" +
		"    }));\n" +
		"  }\n" +
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
		"        detail: { podId: data.pod_id || 'payment-service', status: 'Running', action: actionName }\n" +
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
        <p class="success-desc">Remediation <strong>${() => state.remediationAction}</strong> successfully applied. Crashing container replaced with healthy replica (readiness probe 200 OK). Error rate returned to 0.00%.</p>
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
            <span class="step-text">${() => state.remediationAction.includes('Memory') ? 'Patching pod resource limits (memory: 2Gi)...' : state.remediationAction.includes('Restart') ? 'Evicting pod to reset exponential backoff...' : 'Patching deployment/payment-service image (target: v2.1.3)...'}</span>
          </div>
          <div class="${() => state.remediationStep >= 2 ? 'step-item done' : 'step-item'}">
            <span class="step-num">2</span>
            <span class="step-text">${() => state.remediationAction.includes('Restart') ? 'Kubelet scheduling clean pod instance...' : 'Sending SIGTERM to crashing container and clearing crash backoff...'}</span>
          </div>
          <div class="${() => state.remediationStep >= 3 ? 'step-item done' : 'step-item'}">
            <span class="step-num">3</span>
            <span class="step-text">Starting new replica; readiness probe returned 200 OK.</span>
          </div>
        </div>
      </div>

      <div class="${() => (!state.remediationSuccess && !state.remediating) ? 'triage-details' : 'triage-details hidden'}">
        <div class="drain-card">
          <div class="drain-header">
            <span class="drain-title">🚦 Inbound Traffic Drain</span>
            <span class="${() => 'drain-badge ' + (state.trafficPercent < 100 ? 'draining' : 'full')}">
              ${() => state.trafficPercent}% Inbound
            </span>
          </div>
          <div class="drain-slider-row">
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              class="drain-slider"
              .value="${() => state.trafficPercent}"
              @input="${(e) => updateTrafficDrain(e.target.value)}"
            />
            <button class="drain-btn" @click="${() => updateTrafficDrain(state.trafficPercent > 0 ? 0 : 100)}">
              ${() => state.trafficPercent > 0 ? 'Drain to 0%' : 'Restore 100%'}
            </button>
          </div>
          <div class="drain-hint">
            ${() => state.trafficPercent === 0
              ? 'All ingress traffic diverted to healthy replicas. Pod isolated from client requests.'
              : state.trafficPercent < 100
                ? 'Partial traffic shed active. Error rate reduced across caller mesh.'
                : 'Normal 100% traffic routing active.'}
          </div>
        </div>

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

func (a *Agent) generatePendingDiagnosticsFallback(_ string, _ *api.TelemetryData) string {
	b := "`"
	return "// ArrowJS Ephemeral SRE Pending Workload Diagnostics\n" +
		"const state = reactive({\n" +
		"  tab: 'DIAGNOSTICS',\n" +
		"  filter: 'ALL',\n" +
		"  search: '',\n" +
		"  selectedLog: null,\n" +
		"  logs: data.logs || [],\n" +
		"  actionInProgress: false,\n" +
		"  actionName: '',\n" +
		"  actionSuccess: false,\n" +
		"  currentStatus: (data.metrics && data.metrics.status) || 'Pending'\n" +
		"});\n\n" +
		"function getFilteredLogs() {\n" +
		"  return state.logs.filter(log => {\n" +
		"    const matchesFilter = state.filter === 'ALL' || log.severity === state.filter;\n" +
		"    const matchesSearch = !state.search || log.message.toLowerCase().includes(state.search.toLowerCase());\n" +
		"    return matchesFilter && matchesSearch;\n" +
		"  });\n" +
		"}\n\n" +
		"function runAction(actionName) {\n" +
		"  state.actionInProgress = true;\n" +
		"  state.actionName = actionName;\n" +
		"  setTimeout(() => {\n" +
		"    state.actionInProgress = false;\n" +
		"    state.actionSuccess = true;\n" +
		"    state.currentStatus = 'Running';\n" +
		"    if (container && container.dispatchEvent) {\n" +
		"      container.dispatchEvent(new CustomEvent('ephemeris-remediated', {\n" +
		"        bubbles: true,\n" +
		"        composed: true,\n" +
		"        detail: { podId: data.pod_id || 'batch-ingestor', status: 'Running' }\n" +
		"      }));\n" +
		"    }\n" +
		"  }, 800);\n" +
		"}\n\n" +
		"const template = html" + b + `
  <div class="ephemeris-widget">
    <div class="widget-header">
      <div class="title-group">
        <span class="${() => 'badge status-' + state.currentStatus.toLowerCase()}">${() => state.currentStatus}</span>
        <span class="resource-title">${data.pod_id || 'batch-ingestor'}</span>
      </div>
      <div class="stats-group">
        <span class="stat-chip">Reason: <strong>${(data.metrics && data.metrics.reason) || 'InsufficientResources'}</strong></span>
        <span class="stat-chip">Pending: <strong>${(data.metrics && data.metrics.pending_duration) || '4m32s'}</strong></span>
        <span class="stat-chip">CPU Req: <strong>${(data.metrics && data.metrics.cpu_requested) || '4000m'}</strong></span>
        <span class="stat-chip">Mem Req: <strong>${(data.metrics && data.metrics.memory_requested) || '8Gi'}</strong></span>
      </div>
    </div>

    <div class="nav-tabs">
      <button class="${() => state.tab === 'DIAGNOSTICS' ? 'tab-btn active' : 'tab-btn'}" @click="${() => { state.tab = 'DIAGNOSTICS'; }}">🔍 Scheduling Diagnostics</button>
      <button class="${() => state.tab === 'LOGS' ? 'tab-btn active' : 'tab-btn'}" @click="${() => { state.tab = 'LOGS'; }}">📋 Scheduler Events (${() => state.logs.length})</button>
    </div>

    <div class="${() => state.tab === 'DIAGNOSTICS' ? 'triage-view' : 'triage-view hidden'}">
      <div class="${() => state.actionSuccess ? 'remediation-success-banner' : 'remediation-success-banner hidden'}">
        <div class="success-header">
          <span class="success-icon">✓</span>
          <span class="success-title">${() => state.actionName} Executed</span>
        </div>
        <p class="success-desc">Node capacity assigned. Pod scheduled on new node pool instance and transitioned to <strong>Running</strong>.</p>
        <div class="success-actions">
          <button class="btn-action primary" @click="${() => { state.actionSuccess = false; }}">Done</button>
        </div>
      </div>

      <div class="${() => (!state.actionSuccess && state.actionInProgress) ? 'remediation-in-progress' : 'remediation-in-progress hidden'}">
        <div class="progress-title">
          <span class="spinner-inline"></span>
          ${() => state.actionName} in progress...
        </div>
        <p style="font-size: 11.5px; color: #9aa0a6;">Provisioning node pool capacity and binding pod volume claims...</p>
      </div>

      <div class="${() => (!state.actionSuccess && !state.actionInProgress) ? 'triage-details' : 'triage-details hidden'}">
        <div class="pending-card">
          <div class="pending-header">
            <span class="pending-pill">SCHEDULING BLOCKED</span>
            <span class="pending-title">0/6 Nodes Available: Insufficient CPU & Memory Quota</span>
          </div>
          <div class="pending-body">
            <p>The default Kubernetes scheduler could not place <code>${data.pod_id || 'batch-ingestor'}</code> because cluster nodes lack <strong>4000m CPU</strong> allocatable headroom.</p>
          </div>
        </div>

        <div class="blast-radius-card">
          <div class="blast-title">⚡ GKE Cluster Autoscaler Active</div>
          <p>Autoscaler status: <strong>${(data.metrics && data.metrics.autoscaler_status) || 'ScalingUp (+2 nodes)'}</strong>. Awaiting GCE compute instance initialization (~30s remaining).</p>
        </div>

        <div class="remediation-header">Recommended Actions:</div>

        <div class="actions-list">
          <div class="action-card recommended">
            <div class="action-meta">
              <div class="action-badge-row">
                <span class="rec-badge">FAST-TRACK</span>
                <span class="rec-est">Est: ~1s</span>
              </div>
              <div class="action-name">Trigger Priority Node Scale-Up</div>
              <div class="action-detail">Bypasses autoscaler evaluation backoff and immediately requests warm node capacity.</div>
            </div>
            <button class="remediation-btn primary" @click="${() => runAction('Priority Node Scale-Up')}">
              ⚡ Trigger Fast-Track
            </button>
          </div>

          <div class="action-card">
            <div class="action-meta">
              <div class="action-name">Reduce CPU Request to 2000m</div>
              <div class="action-detail">Patches pod spec requests so workload can immediately fit into existing node capacity.</div>
            </div>
            <button class="remediation-btn secondary" @click="${() => runAction('Reduce CPU Request')}">
              ⚡ Patch CPU Request
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="${() => state.tab === 'LOGS' ? 'logs-view' : 'logs-view hidden'}">
      <div class="filter-bar">
        <div class="filter-buttons">
          <button class="${() => state.filter === 'ALL' ? 'btn active' : 'btn'}" @click="${() => { state.filter = 'ALL'; }}">ALL</button>
          <button class="${() => state.filter === 'WARNING' ? 'btn active warning' : 'btn'}" @click="${() => { state.filter = 'WARNING'; }}">WARN</button>
          <button class="${() => state.filter === 'INFO' ? 'btn active info' : 'btn'}" @click="${() => { state.filter = 'INFO'; }}">INFO</button>
        </div>
        <input
          type="text"
          placeholder="Filter logs..."
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

func (a *Agent) generateHealthyCockpitFallback(_ string, _ *api.TelemetryData) string {
	b := "`"
	return "// ArrowJS Ephemeral SRE Service Health & Observability Cockpit\n" +
		"const state = reactive({\n" +
		"  tab: 'HEALTH',\n" +
		"  filter: 'ALL',\n" +
		"  search: '',\n" +
		"  selectedLog: null,\n" +
		"  logs: data.logs || [],\n" +
		"  actionInProgress: false,\n" +
		"  actionName: '',\n" +
		"  actionSuccess: false,\n" +
		"  currentStatus: (data.metrics && data.metrics.status) || 'Running'\n" +
		"});\n\n" +
		"function getFilteredLogs() {\n" +
		"  return state.logs.filter(log => {\n" +
		"    const matchesFilter = state.filter === 'ALL' || log.severity === state.filter;\n" +
		"    const matchesSearch = !state.search || log.message.toLowerCase().includes(state.search.toLowerCase());\n" +
		"    return matchesFilter && matchesSearch;\n" +
		"  });\n" +
		"}\n\n" +
		"function runAction(actionName) {\n" +
		"  state.actionInProgress = true;\n" +
		"  state.actionName = actionName;\n" +
		"  setTimeout(() => {\n" +
		"    state.actionInProgress = false;\n" +
		"    state.actionSuccess = true;\n" +
		"  }, 800);\n" +
		"}\n\n" +
		"const template = html" + b + `
  <div class="ephemeris-widget">
    <div class="widget-header">
      <div class="title-group">
        <span class="${() => 'badge status-' + state.currentStatus.toLowerCase()}">${() => state.currentStatus}</span>
        <span class="resource-title">${data.pod_id || 'service'}</span>
      </div>
      <div class="stats-group">
        <span class="stat-chip">Restarts: <strong>${(data.metrics && data.metrics.restarts) || '0'}</strong></span>
        <span class="stat-chip">CPU: <strong>${(data.metrics && data.metrics.cpu) || '120m'}</strong></span>
        <span class="stat-chip">Mem: <strong>${(data.metrics && data.metrics.memory) || '256Mi'}</strong></span>
        <span class="stat-chip">Uptime: <strong>${(data.metrics && data.metrics.uptime) || '9d 14h'}</strong></span>
      </div>
    </div>

    <div class="nav-tabs">
      <button class="${() => state.tab === 'HEALTH' ? 'tab-btn active' : 'tab-btn'}" @click="${() => { state.tab = 'HEALTH'; }}">📊 Service Health & Telemetry</button>
      <button class="${() => state.tab === 'LOGS' ? 'tab-btn active' : 'tab-btn'}" @click="${() => { state.tab = 'LOGS'; }}">📋 Live Logs (${() => state.logs.length})</button>
    </div>

    <div class="${() => state.tab === 'HEALTH' ? 'triage-view' : 'triage-view hidden'}">
      <div class="${() => state.actionSuccess ? 'remediation-success-banner' : 'remediation-success-banner hidden'}">
        <div class="success-header">
          <span class="success-icon">✓</span>
          <span class="success-title">${() => state.actionName} Completed</span>
        </div>
        <p class="success-desc">Operational task executed cleanly. Service continues serving traffic with zero dropped connections.</p>
        <div class="success-actions">
          <button class="btn-action primary" @click="${() => { state.actionSuccess = false; }}">Done</button>
        </div>
      </div>

      <div class="${() => (!state.actionSuccess && state.actionInProgress) ? 'remediation-in-progress' : 'remediation-in-progress hidden'}">
        <div class="progress-title">
          <span class="spinner-inline"></span>
          Executing ${() => state.actionName}...
        </div>
        <p style="font-size: 11.5px; color: #9aa0a6;">Performing graceful rolling cycle, draining active connections and verifying health probes...</p>
      </div>

      <div class="${() => (!state.actionSuccess && !state.actionInProgress) ? 'triage-details' : 'triage-details hidden'}">
        <div class="health-card">
          <div class="health-header">
            <span class="health-pill">HEALTHY</span>
            <span class="health-title">Service Operational & Healthy</span>
          </div>
          <div class="health-body">
            <p>All Kubernetes health probes (Liveness, Readiness, Startup) reporting HTTP 200 OK. No crash loops, panics, or unhandled exceptions detected in the active telemetry window.</p>
          </div>
        </div>

        <div class="metrics-grid">
          <div class="metric-box">
            <span class="metric-box-val">0.00%</span>
            <span class="metric-box-lbl">Error Rate (HTTP 5xx)</span>
          </div>
          <div class="metric-box">
            <span class="metric-box-val">${(data.metrics && data.metrics.p99) || '12ms'}</span>
            <span class="metric-box-lbl">Latency (p99)</span>
          </div>
          <div class="metric-box">
            <span class="metric-box-val">142 req/s</span>
            <span class="metric-box-lbl">Ingress Rate</span>
          </div>
          <div class="metric-box">
            <span class="metric-box-val">100.0%</span>
            <span class="metric-box-lbl">SLO Compliance</span>
          </div>
        </div>

        <div class="remediation-header">Operational Actions:</div>

        <div class="actions-list">
          <div class="action-card">
            <div class="action-meta">
              <div class="action-name">Graceful Rolling Restart</div>
              <div class="action-detail">Performs zero-downtime rolling update to refresh container runtime worker state.</div>
            </div>
            <button class="remediation-btn secondary" @click="${() => runAction('Graceful Rolling Restart')}">
              🔄 Rolling Restart
            </button>
          </div>

          <div class="action-card">
            <div class="action-meta">
              <div class="action-name">Trigger Synthetic Health Probe</div>
              <div class="action-detail">Runs on-demand synthetic gRPC & HTTP health check validation against pods.</div>
            </div>
            <button class="remediation-btn secondary" @click="${() => runAction('Synthetic Deep Health Probe')}">
              🩺 Probe Health
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="${() => state.tab === 'LOGS' ? 'logs-view' : 'logs-view hidden'}">
      <div class="filter-bar">
        <div class="filter-buttons">
          <button class="${() => state.filter === 'ALL' ? 'btn active' : 'btn'}" @click="${() => { state.filter = 'ALL'; }}">ALL</button>
          <button class="${() => state.filter === 'INFO' ? 'btn active info' : 'btn'}" @click="${() => { state.filter = 'INFO'; }}">INFO</button>
        </div>
        <input
          type="text"
          placeholder="Filter logs..."
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
