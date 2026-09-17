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
	"sort"
	"strconv"
	"strings"

	"github.com/go-steer/ephemeris/pkg/api"
)

// UIArchetype represents the polymorphic Generative UI layout type.
type UIArchetype string

const (
	ArchetypeLogsConsole         UIArchetype = "logs_console"
	ArchetypeIssuesFleetMatrix   UIArchetype = "issues_matrix"
	ArchetypeNamespaceInventory  UIArchetype = "namespace_inventory"
	ArchetypeResourceLeaderboard UIArchetype = "resource_leaderboard"
	ArchetypeDeepTriageCockpit   UIArchetype = "deep_triage"
	ArchetypeChaosScenario       UIArchetype = "chaos_scenario"
)

// classifyPromptArchetype inspects the user prompt and target resource URI to select the UI archetype.
func classifyPromptArchetype(prompt string, telemetry *api.TelemetryData) (UIArchetype, string) {
	p := strings.ToLower(strings.TrimSpace(prompt))
	uri := ""
	if telemetry != nil {
		uri = strings.ToLower(telemetry.ResourceURI)
	}

	// 0. Chaos Scenario Injection requests ("inject redis oom", "simulate traffic spike", "reset all clusters to healthy")
	if strings.Contains(p, "inject ") || strings.Contains(p, "simulate ") || strings.Contains(p, "redis oom") || strings.Contains(p, "oom cascade") || strings.Contains(p, "black friday") || strings.Contains(p, "traffic spike") || strings.Contains(p, "reset to healthy") || strings.Contains(p, "all healthy") {
		if strings.Contains(p, "redis") || strings.Contains(p, "oom") {
			return ArchetypeChaosScenario, "redis-oom"
		}
		if strings.Contains(p, "traffic") || strings.Contains(p, "black friday") || strings.Contains(p, "spike") {
			return ArchetypeChaosScenario, "traffic-spike"
		}
		if strings.Contains(p, "healthy") || strings.Contains(p, "clear") || strings.Contains(p, "nominal") {
			return ArchetypeChaosScenario, "healthy"
		}
		return ArchetypeChaosScenario, "default"
	}

	// 1. Explicit Log Console requests ("show me the logs for XXX", "tail logs", "error logs")
	if strings.Contains(p, "log") || strings.Contains(p, "tail") || strings.Contains(p, "stdout") || strings.Contains(p, "stderr") {
		return ArchetypeLogsConsole, ""
	}

	// 2. Resource / Capacity Leaderboard ("compare memory", "top cpu pods", "resource usage")
	if strings.Contains(p, "compare") || strings.Contains(p, "leaderboard") || strings.Contains(p, "top cpu") || strings.Contains(p, "top memory") || strings.Contains(p, "most cpu") || strings.Contains(p, "most memory") || strings.Contains(p, "utilization") || strings.Contains(p, "saturation") {
		return ArchetypeResourceLeaderboard, ""
	}

	// 3. Multi-Cluster Incident Fleet Matrix ("which pods have issues", "show me the list of pods with issues", "what is failing")
	if isFleetIssuesIntent(p, uri) {
		return ArchetypeIssuesFleetMatrix, ""
	}

	// 4. Namespace Workload Inventory ("show me all the pods in the default namespace", "pods in payments")
	if strings.HasPrefix(uri, "gke://namespace/") {
		ns := strings.TrimPrefix(uri, "gke://namespace/")
		return ArchetypeNamespaceInventory, ns
	}
	if strings.Contains(p, "namespace") || strings.Contains(p, "pods in ") || strings.Contains(p, "workloads in ") || strings.Contains(p, "all pods") || strings.Contains(p, "list pods") {
		ns := extractNamespaceFromPrompt(p)
		return ArchetypeNamespaceInventory, ns
	}

	return ArchetypeDeepTriageCockpit, ""
}

func isFleetIssuesIntent(p string, uri string) bool {
	if uri == "gke://fleet/issues" {
		return true
	}
	specificWorkloads := []string{"payment", "batch", "frontend", "cart", "checkout", "redis"}
	for _, w := range specificWorkloads {
		if strings.Contains(p, w) {
			return false
		}
	}

	phrases := []string{
		"pods with issues",
		"pods have issues",
		"which pods have",
		"what pods have",
		"which pods are",
		"what pods are",
		"failing pods",
		"broken pods",
		"unhealthy pods",
		"crashing pods",
		"active alerts",
		"cluster issues",
		"fleet issues",
		"all issues",
		"any issues",
		"what is failing",
		"what's failing",
		"what is broken",
		"what's broken",
		"have issues",
		"having issues",
		"with errors",
		"have errors",
		"in error",
		"anomalies",
		"down right now",
	}
	for _, phrase := range phrases {
		if strings.Contains(p, phrase) {
			return true
		}
	}
	if (strings.Contains(p, "pod") || strings.Contains(p, "service") || strings.Contains(p, "workload")) &&
		(strings.Contains(p, "issue") || strings.Contains(p, "error") || strings.Contains(p, "fail") || strings.Contains(p, "crash") || strings.Contains(p, "problem") || strings.Contains(p, "down")) {
		return true
	}
	return false
}

func extractNamespaceFromPrompt(p string) string {
	namespaces := []string{"default", "production", "staging", "spark-jobs", "kube-system", "checkout", "data-pipeline", "payments", "monitoring"}
	for _, ns := range namespaces {
		if strings.Contains(p, ns) {
			return ns
		}
	}
	return "production"
}

type uiLogLine struct {
	TS    string `json:"ts"`
	Level string `json:"level"`
	Msg   string `json:"msg"`
}

// synthesizeLogsConsoleUI generates a reactive ArrowJS Live Container Log Console bound to real telemetry logs.
func synthesizeLogsConsoleUI(telemetry *api.TelemetryData) string {
	podName := "payment-service"
	var lines []uiLogLine

	if telemetry != nil {
		if telemetry.PodID != "" {
			podName = telemetry.PodID
		}
		for _, entry := range telemetry.Logs {
			ts := entry.Timestamp
			if len(ts) >= 19 {
				ts = ts[11:19] + ".000"
			}
			lvl := entry.Severity
			if lvl == "WARNING" {
				lvl = "WARN"
			}
			lines = append(lines, uiLogLine{
				TS:    ts,
				Level: lvl,
				Msg:   entry.Message,
			})
		}
	}

	if len(lines) == 0 {
		lines = []uiLogLine{
			{TS: "15:04:01.112", Level: "INFO", Msg: "Container runtime initialized; listening on service port"},
			{TS: "15:04:02.405", Level: "INFO", Msg: "Health check probe /healthz -> 200 OK"},
		}
	}

	logsJSON, _ := json.Marshal(lines)

	return fmt.Sprintf(`const state = reactive({
  podName: %q,
  filterLevel: 'ALL',
  searchQuery: '',
  isPaused: false,
  copiedIndex: -1,
  logs: %s
});

function setLevel(lvl) {
  state.filterLevel = lvl;
}

function togglePause() {
  state.isPaused = !state.isPaused;
}

function focusWorkload() {
  container.dispatchEvent(new CustomEvent('ephemeris-select-pod', {
    detail: { podId: state.podName },
    bubbles: true,
    composed: true
  }));
}

function copyLog(idx, msg) {
  state.copiedIndex = idx;
  setTimeout(() => { state.copiedIndex = -1; }, 1500);
}

const template = html`+"`"+`
  <div style="display: flex; flex-direction: column; gap: 12px; font-family: 'Inter', system-ui, sans-serif; color: #f8fafc;">
    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.85); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.3);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">Live Log Console</span>
        <span style="font-size: 13px; font-weight: 600; color: #e2e8f0; font-family: 'JetBrains Mono', monospace;">${() => state.podName}</span>
      </div>
      <div style="display: flex; gap: 6px;">
        <button @click="${togglePause}" style="background: rgba(30, 41, 59, 0.9); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; font-weight: 600;">
          ${() => state.isPaused ? '▶ Resume Stream' : '⏸ Pause Tail'}
        </button>
        <button @click="${focusWorkload}" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; font-weight: 600;">
          🎯 Focus 3D Pod
        </button>
      </div>
    </div>

    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
      <div style="display: flex; gap: 4px; background: rgba(15, 23, 42, 0.6); padding: 4px; border-radius: 6px; border: 1px solid rgba(148, 163, 184, 0.18);">
        <button @click="${() => setLevel('ALL')}" style="background: rgba(56, 189, 248, 0.18); color: #f8fafc; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">ALL</button>
        <button @click="${() => setLevel('FATAL')}" style="background: rgba(239, 68, 68, 0.18); color: #fca5a5; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">FATAL</button>
        <button @click="${() => setLevel('ERROR')}" style="background: rgba(248, 113, 113, 0.15); color: #f87171; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">ERROR</button>
        <button @click="${() => setLevel('WARN')}" style="background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">WARN</button>
        <button @click="${() => setLevel('INFO')}" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">INFO</button>
      </div>
      <span style="font-size: 11px; color: #94a3b8; font-family: 'JetBrains Mono', monospace;">Filter: ${() => state.filterLevel}</span>
    </div>

    <div style="background: #050811; border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 8px; padding: 10px; max-height: 260px; overflow-y: auto; font-family: 'JetBrains Mono', monospace; font-size: 11px; display: flex; flex-direction: column; gap: 6px;">
      ${() => state.logs
        .filter(l => state.filterLevel === 'ALL' || l.level === state.filterLevel)
        .map((l, idx) => html`+"`"+`
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 5px 8px; border-radius: 4px; background: rgba(15, 23, 42, 0.75); border-left: 3px solid #38bdf8;">
            <div style="display: flex; gap: 8px; word-break: break-all;">
              <span style="color: #64748b; flex-shrink: 0;">${l.ts}</span>
              <span style="font-weight: 700; flex-shrink: 0; color: #e2e8f0;">[${l.level}]</span>
              <span style="color: #f1f5f9;">${l.msg}</span>
            </div>
            <button @click="${() => copyLog(idx, l.msg)}" style="background: transparent; color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer; flex-shrink: 0;">
              ${() => state.copiedIndex === idx ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        `+"`"+`)}
    </div>
  </div>
`+"`"+`;

template(container);
`, podName, string(logsJSON))
}

type uiIssuePod struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	Status    string `json:"status"`
	Restarts  int    `json:"restarts"`
	Reason    string `json:"reason"`
	Impact    string `json:"impact"`
}

// synthesizeIssuesListUI generates a reactive ArrowJS Multi-Cluster Incident Fleet Matrix bound to live topology and k8s-lookout findings.
func synthesizeIssuesListUI(topology *api.TopologyData, findings []api.LookoutFinding, envelope string) string {
	issues := make([]uiIssuePod, 0)
	if findings == nil {
		findings = make([]api.LookoutFinding, 0)
	}

	if topology != nil {
		for _, cluster := range topology.Clusters {
			for _, ns := range cluster.Namespaces {
				for _, pod := range ns.Pods {
					if pod.Status != api.StatusRunning {
						reason := fmt.Sprintf("Pod in %s state (cpu=%s, mem=%s)", pod.Status, pod.CPUUsage, pod.MemoryUsage)
						impact := "HIGH — Service Degradation"
						switch {
						case strings.Contains(pod.Name, "redis"):
							reason = "OOMKilled (Exit Code 137) — Container memory exceeded 4.0Gi limit"
							impact = "CRITICAL — Upstream Cache Cascade"
						case strings.Contains(pod.Name, "cart"):
							reason = "Downstream redis-cart:6379 connection refused (circuit breaker OPEN)"
							impact = "CRITICAL — Cart Checkout Blocked"
						case strings.Contains(pod.Name, "payment"):
							reason = "SIGSEGV (Nil pointer dereference at server.go:142)"
							impact = "CRITICAL — Payment Processing Down"
						case pod.Status == api.StatusPending:
							reason = "0/6 nodes available: Insufficient CPU; ClusterAutoscaler scaling up node pool"
							impact = "WARNING — Scheduling Backlogged"
						}
						issues = append(issues, uiIssuePod{
							ID:        pod.ID,
							Name:      pod.Name,
							Namespace: ns.Name,
							Cluster:   cluster.Name,
							Status:    string(pod.Status),
							Restarts:  pod.Restarts,
							Reason:    reason,
							Impact:    impact,
						})
					}
				}
			}
		}
	}

	if envelope == "" {
		envelope = fmt.Sprintf("scanned=12 findings=%d elapsed=9ms", len(findings))
	}

	issuesJSON, _ := json.Marshal(issues)
	findingsJSON, _ := json.Marshal(findings)

	return fmt.Sprintf(`const state = reactive({
  selectedFilter: 'ALL',
  lookoutEnvelope: %q,
  lookoutFindings: %s || [],
  issues: %s || []
});

function focusPod(podName) {
  container.dispatchEvent(new CustomEvent('ephemeris-select-pod', {
    detail: { podId: podName },
    bubbles: true,
    composed: true
  }));
}

function triagePod(podName) {
  container.dispatchEvent(new CustomEvent('ephemeris-prompt-query', {
    detail: { podId: podName, prompt: 'Investigate crash in ' + podName + ' and synthesize triage UI' },
    bubbles: true,
    composed: true
  }));
}

function viewLogs(podName) {
  container.dispatchEvent(new CustomEvent('ephemeris-prompt-query', {
    detail: { podId: podName, prompt: 'show me the logs for ' + podName },
    bubbles: true,
    composed: true
  }));
}

function fixNow(podName) {
  state.issues = (state.issues || []).filter(p => p.name !== podName);
  state.lookoutFindings = (state.lookoutFindings || []).filter(f => !f.resource || !f.resource.includes(podName));
  container.dispatchEvent(new CustomEvent('ephemeris-remediated', {
    detail: { podId: podName, status: 'Running', action: 'rollback' },
    bubbles: true,
    composed: true
  }));
}

function triggerScenario(scenarioId) {
  container.dispatchEvent(new CustomEvent('ephemeris-scenario-select', {
    detail: { scenarioId: scenarioId },
    bubbles: true,
    composed: true
  }));
}

const template = html`+"`"+`
  <div style="display: flex; flex-direction: column; gap: 14px; font-family: 'Inter', system-ui, sans-serif; color: #f8fafc;">
    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.85); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.35);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.45); padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">Multi-Cluster Incident Fleet Matrix</span>
        <span style="font-size: 12px; color: #cbd5e1;">${() => (state.issues || []).length} Active Anomalies Across Clusters</span>
      </div>
      <span style="font-size: 11px; color: #38bdf8; font-family: 'JetBrains Mono', monospace;">lookout: ${() => state.lookoutEnvelope}</span>
    </div>

    ${() => state.lookoutFindings && state.lookoutFindings.length > 0 ? html`+"`"+`
      <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 10px; font-weight: 700; color: #38bdf8; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.05em;">🔍 GO-STEER/K8S-LOOKOUT MCP FINDINGS (${() => state.lookoutEnvelope})</span>
        </div>
        ${() => (state.lookoutFindings || []).map(f => html`+"`"+`
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(2, 6, 23, 0.65); padding: 6px 10px; border-radius: 6px; border-left: 3px solid #f87171; font-size: 11px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #fca5a5; font-weight: 700; font-family: 'JetBrains Mono', monospace;">[${f.kind}]</span>
                <span style="color: #94a3b8; font-family: 'JetBrains Mono', monospace; font-size: 10px;">${f.fingerprint} • ${f.check_source}</span>
              </div>
              <span style="color: #e2e8f0;">${f.summary}</span>
            </div>
          </div>
        `+"`"+`)}
      </div>
    `+"`"+` : ''}

    ${() => (state.issues || []).length === 0 ? html`+"`"+`
      <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 10px; padding: 18px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px;">
        <div style="font-size: 24px;">✨</div>
        <div style="font-size: 15px; font-weight: 700; color: #34d399;">ALL CLUSTERS HEALTHY — 0 ACTIVE INCIDENTS</div>
        <div style="font-size: 12px; color: #cbd5e1; max-width: 420px;">All Kubernetes workloads across production, staging, and analytics clusters are Running nominally.</div>
        <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 6px;">
          <button @click="${() => triggerScenario('redis-oom')}" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.45); border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: 700; cursor: pointer;">
            🔥 Inject Redis OOM Cascade
          </button>
          <button @click="${() => triggerScenario('traffic-spike')}" style="background: rgba(251, 191, 36, 0.2); color: #fde68a; border: 1px solid rgba(251, 191, 36, 0.45); border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: 700; cursor: pointer;">
            📈 Simulate Traffic Spike
          </button>
          <button @click="${() => triggerScenario('default')}" style="background: rgba(56, 189, 248, 0.2); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.45); border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: 700; cursor: pointer;">
            💥 Restore Payment Crash
          </button>
        </div>
      </div>
    `+"`"+` : html`+"`"+`
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${() => (state.issues || []).map(pod => html`+"`"+`
          <div style="background: rgba(15, 23, 42, 0.78); border: 1px solid rgba(239, 68, 68, 0.32); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 14px; font-weight: 700; color: #f8fafc; font-family: 'JetBrains Mono', monospace;">${pod.name}</span>
                <span style="background: rgba(148, 163, 184, 0.15); color: #cbd5e1; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-family: 'JetBrains Mono', monospace;">ns: ${pod.namespace}</span>
                <span style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-family: 'JetBrains Mono', monospace;">${pod.cluster}</span>
              </div>
              <span style="background: rgba(239, 68, 68, 0.22); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.45); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">
                ${pod.status} (${pod.restarts} restarts)
              </span>
            </div>

            <div style="font-size: 12px; color: #e2e8f0; background: rgba(2, 6, 23, 0.6); padding: 8px 10px; border-radius: 6px; border-left: 3px solid #f87171;">
              ${pod.reason}
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 2px;">
              <span style="font-size: 11px; color: #fbbf24; font-weight: 600;">Impact: ${pod.impact}</span>
              <div style="display: flex; gap: 6px;">
                <button @click="${() => focusPod(pod.name)}" style="background: rgba(30, 41, 59, 0.9); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 6px; padding: 5px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">
                  🎯 Focus 3D
                </button>
                <button @click="${() => viewLogs(pod.name)}" style="background: rgba(30, 41, 59, 0.9); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 6px; padding: 5px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">
                  📜 Logs
                </button>
                <button @click="${() => fixNow(pod.name)}" style="background: linear-gradient(135deg, #059669, #10b981); color: #ffffff; border: none; border-radius: 6px; padding: 5px 11px; font-size: 11px; font-weight: 700; cursor: pointer;">
                  🛠️ Fix Now
                </button>
                <button @click="${() => triagePod(pod.name)}" style="background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; border: none; border-radius: 6px; padding: 5px 12px; font-size: 11px; font-weight: 700; cursor: pointer;">
                  ⚡ Deep Triage
                </button>
              </div>
            </div>
          </div>
        `+"`"+`)}
      </div>
    `+"`"+`}
  </div>
`+"`"+`;

template(container);
`, envelope, string(findingsJSON), string(issuesJSON))
}

type uiNamespacePod struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	CPU    string `json:"cpu"`
	Mem    string `json:"mem"`
}

// synthesizeNamespaceListUI generates a reactive ArrowJS Namespace Workload Inventory table bound to live topology.
func synthesizeNamespaceListUI(namespace string, topology *api.TopologyData) string {
	if namespace == "" {
		namespace = "production"
	}
	pods := make([]uiNamespacePod, 0)
	if topology != nil {
		for _, cluster := range topology.Clusters {
			for _, ns := range cluster.Namespaces {
				if strings.EqualFold(ns.Name, namespace) || namespace == "all" {
					for _, p := range ns.Pods {
						pods = append(pods, uiNamespacePod{
							Name:   p.Name,
							Status: string(p.Status),
							CPU:    p.CPUUsage,
							Mem:    p.MemoryUsage,
						})
					}
				}
			}
		}
	}
	if len(pods) == 0 && topology != nil {
		for _, cluster := range topology.Clusters {
			for _, ns := range cluster.Namespaces {
				for _, p := range ns.Pods {
					pods = append(pods, uiNamespacePod{
						Name:   p.Name,
						Status: string(p.Status),
						CPU:    p.CPUUsage,
						Mem:    p.MemoryUsage,
					})
				}
			}
		}
	}

	podsJSON, _ := json.Marshal(pods)

	return fmt.Sprintf(`const state = reactive({
  namespace: %q,
  pods: %s || []
});

function focusPod(name) {
  container.dispatchEvent(new CustomEvent('ephemeris-select-pod', {
    detail: { podId: name },
    bubbles: true,
    composed: true
  }));
}

function inspectLogs(name) {
  container.dispatchEvent(new CustomEvent('ephemeris-prompt-query', {
    detail: { podId: name, prompt: 'show me the logs for ' + name },
    bubbles: true,
    composed: true
  }));
}

const template = html`+"`"+`
  <div style="display: flex; flex-direction: column; gap: 12px; font-family: 'Inter', system-ui, sans-serif; color: #f8fafc;">
    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.85); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.35);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">Namespace Workload Inventory</span>
        <span style="font-size: 13px; font-weight: 700; color: #f8fafc; font-family: 'JetBrains Mono', monospace;">namespace/${() => state.namespace} (${() => state.pods.length} pods)</span>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${() => state.pods.map(pod => html`+"`"+`
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.72); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 10px 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 13px; font-weight: 700; color: #f8fafc; font-family: 'JetBrains Mono', monospace;">${pod.name}</span>
            <span style="background: rgba(56, 189, 248, 0.12); color: #cbd5e1; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-family: 'JetBrains Mono', monospace;">${pod.status}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 11px; color: #94a3b8; font-family: 'JetBrains Mono', monospace;">CPU: ${pod.cpu} | MEM: ${pod.mem}</span>
            <div style="display: flex; gap: 6px;">
              <button @click="${() => focusPod(pod.name)}" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">
                🎯 Focus 3D
              </button>
              <button @click="${() => inspectLogs(pod.name)}" style="background: rgba(30, 41, 59, 0.9); color: #e2e8f0; border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">
                📜 Logs
              </button>
            </div>
          </div>
        </div>
      `+"`"+`)}
    </div>
  </div>
`+"`"+`;

template(container);
`, namespace, string(podsJSON))
}

type uiLeaderPod struct {
	Name   string `json:"name"`
	NS     string `json:"ns"`
	CPU    string `json:"cpu"`
	Mem    string `json:"mem"`
	Status string `json:"status"`
	Score  int    `json:"score"`
}

func parseMillicores(cpu string) int {
	clean := strings.TrimSuffix(strings.TrimSpace(cpu), "m")
	val, _ := strconv.Atoi(clean)
	return val
}

// synthesizeResourceLeaderboardUI generates a reactive ArrowJS Cluster Resource Saturation Leaderboard bound to live topology.
func synthesizeResourceLeaderboardUI(topology *api.TopologyData) string {
	list := make([]uiLeaderPod, 0)
	if topology != nil {
		for _, cluster := range topology.Clusters {
			for _, ns := range cluster.Namespaces {
				for _, p := range ns.Pods {
					mc := parseMillicores(p.CPUUsage)
					score := mc / 10
					if score > 99 {
						score = 99
					}
					if score < 5 {
						score = 8
					}
					list = append(list, uiLeaderPod{
						Name:   p.Name,
						NS:     ns.Name,
						CPU:    p.CPUUsage,
						Mem:    p.MemoryUsage,
						Status: string(p.Status),
						Score:  score,
					})
				}
			}
		}
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].Score > list[j].Score
	})
	if len(list) > 6 {
		list = list[:6]
	}

	listJSON, _ := json.Marshal(list)

	return fmt.Sprintf(`const state = reactive({
  sortBy: 'CPU',
  workloads: %s || []
});

function focusWorkload(name) {
  container.dispatchEvent(new CustomEvent('ephemeris-select-pod', {
    detail: { podId: name },
    bubbles: true,
    composed: true
  }));
}

const template = html`+"`"+`
  <div style="display: flex; flex-direction: column; gap: 12px; font-family: 'Inter', system-ui, sans-serif; color: #f8fafc;">
    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.85); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(251, 191, 36, 0.35);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: rgba(251, 191, 36, 0.18); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.4); padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace;">Workload Resource Saturation Leaderboard</span>
      </div>
      <span style="font-size: 11px; color: #94a3b8; font-family: 'JetBrains Mono', monospace;">Sorted by: Peak Saturation</span>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${() => state.workloads.map(w => html`+"`"+`
        <div style="background: rgba(15, 23, 42, 0.78); border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 13px; font-weight: 700; color: #f8fafc; font-family: 'JetBrains Mono', monospace;">${w.name}</span>
              <span style="font-size: 10px; color: #94a3b8; font-family: 'JetBrains Mono', monospace;">ns/${w.ns}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; color: #38bdf8; font-family: 'JetBrains Mono', monospace;">CPU: ${w.cpu} | MEM: ${w.mem}</span>
              <button @click="${() => focusWorkload(w.name)}" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 5px; padding: 3px 8px; font-size: 10px; font-weight: 600; cursor: pointer;">
                🎯 Focus 3D
              </button>
            </div>
          </div>
          <div style="width: 100%%; height: 7px; background: rgba(30, 41, 59, 0.9); border-radius: 4px; overflow: hidden;">
            <div style="${() => 'width: ' + w.score + '%%; height: 100%%; background: linear-gradient(90deg, #38bdf8, #f43f5e);'}"></div>
          </div>
        </div>
      `+"`"+`)}
    </div>
  </div>
`+"`"+`;

template(container);
`, string(listJSON))
}
