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
)

// classifyPromptArchetype inspects the user prompt and target resource URI to select the UI archetype.
func classifyPromptArchetype(prompt string, telemetry *api.TelemetryData) (UIArchetype, string) {
	p := strings.ToLower(strings.TrimSpace(prompt))
	uri := ""
	if telemetry != nil {
		uri = strings.ToLower(telemetry.ResourceURI)
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

	// 5. Default to Deep Single-Pod Incident Triage & Remediation Cockpit
	return ArchetypeDeepTriageCockpit, ""
}

func isFleetIssuesIntent(p string, uri string) bool {
	if uri == "gke://fleet/issues" {
		return true
	}

	// If a specific single service is explicitly named (e.g. "payment-service", "cart-service"),
	// and the user is asking about that specific service, keep it as single-pod triage.
	explicitPods := []string{
		"payment-service", "payment service",
		"cart-service", "cart service",
		"checkout-service", "checkout service",
		"batch-ingestor", "batch ingestor",
		"redis-cart", "spark-master", "spark-worker",
	}
	for _, ep := range explicitPods {
		if strings.Contains(p, ep) {
			return false
		}
	}

	issueWords := []string{
		"issue", "issues", "failing", "failed", "fail", "broken",
		"crashing", "crash", "error", "errors", "problem", "problems",
		"unhealthy", "degraded", "alert", "alerts", "down", "wrong", "anomal",
	}
	pluralOrQueryWords := []string{
		"pods", "workloads", "services", "containers",
		"which", "what", "list", "show", "all", "any", "fleet", "cluster",
	}

	hasIssueWord := false
	for _, iw := range issueWords {
		if strings.Contains(p, iw) {
			hasIssueWord = true
			break
		}
	}
	if !hasIssueWord {
		return false
	}

	for _, qw := range pluralOrQueryWords {
		if strings.Contains(p, qw) {
			return true
		}
	}
	return false
}

func extractNamespaceFromPrompt(p string) string {
	knownNamespaces := []string{"default", "payments", "checkout", "frontend", "cart", "data-pipeline", "monitoring", "production", "staging"}
	for _, ns := range knownNamespaces {
		if strings.Contains(p, ns) {
			return ns
		}
	}
	// Try extracting word after "in " or "namespace "
	words := strings.Fields(p)
	for i, w := range words {
		if (w == "in" || w == "namespace") && i+1 < len(words) {
			candidate := strings.Trim(words[i+1], ".,?!'\"")
			if candidate != "the" && candidate != "all" {
				return candidate
			}
			if candidate == "the" && i+2 < len(words) {
				return strings.Trim(words[i+2], ".,?!'\"")
			}
		}
	}
	return "all"
}

// synthesizeLogsConsoleUI generates Archetype 1: Dedicated Live Log Stream & RegEx Search Console.
func synthesizeLogsConsoleUI() string {
	return `
const state = reactive({
  levelFilter: 'ALL',
  searchQuery: '',
  autoTail: true,
  copied: false
});

const getFilteredLogs = () => {
  const logs = data.logs || [];
  return logs.filter(entry => {
    const matchesLevel = state.levelFilter === 'ALL' || entry.severity === state.levelFilter;
    const q = state.searchQuery.trim().toLowerCase();
    const matchesSearch = !q ||
      (entry.message && entry.message.toLowerCase().includes(q)) ||
      (entry.source && entry.source.toLowerCase().includes(q));
    return matchesLevel && matchesSearch;
  });
};

const countByLevel = (lvl) => {
  const logs = data.logs || [];
  if (lvl === 'ALL') return logs.length;
  return logs.filter(l => l.severity === lvl).length;
};

const triggerTriagePivot = () => {
  container.dispatchEvent(new CustomEvent('ephemeris-prompt-query', {
    bubbles: true,
    composed: true,
    detail: {
      prompt: 'Run AI root-cause triage and remediation for ' + (data.pod_id || 'pod'),
      podId: data.pod_id || '',
      resourceUri: data.resource_uri || ''
    }
  }));
};

const copyLogs = () => {
  state.copied = true;
  setTimeout(() => { state.copied = false; }, 1800);
};

const template = html` + "`" + `
  <div class="ephemeris-widget">
    <div class="widget-header">
      <div class="header-main">
        <span class="pod-title">${() => '📋 Live Log Console: ' + (data.pod_id || 'Workload')}</span>
        <span class="${() => 'status-pill status-' + ((data.metrics && data.metrics.status) || 'Running').toLowerCase()}">
          ${() => (data.metrics && data.metrics.status) || 'Running'}
        </span>
      </div>
      <div class="header-meta">
        <span>URI: ${() => data.resource_uri || 'gke://cluster/pod'}</span>
        <button class="triage-pivot-btn" @click="${triggerTriagePivot}">
          ⚡ Pivot to Root-Cause Triage
        </button>
      </div>
    </div>

    <div class="log-console-toolbar">
      <div class="filter-pills">
        <button class="${() => 'filter-pill ' + (state.levelFilter === 'ALL' ? 'active' : '')}" @click="${() => { state.levelFilter = 'ALL'; }}">
          ALL (${() => countByLevel('ALL')})
        </button>
        <button class="${() => 'filter-pill fatal ' + (state.levelFilter === 'FATAL' ? 'active' : '')}" @click="${() => { state.levelFilter = 'FATAL'; }}">
          FATAL (${() => countByLevel('FATAL')})
        </button>
        <button class="${() => 'filter-pill error ' + (state.levelFilter === 'ERROR' ? 'active' : '')}" @click="${() => { state.levelFilter = 'ERROR'; }}">
          ERROR (${() => countByLevel('ERROR')})
        </button>
        <button class="${() => 'filter-pill warn ' + (state.levelFilter === 'WARNING' ? 'active' : '')}" @click="${() => { state.levelFilter = 'WARNING'; }}">
          WARN (${() => countByLevel('WARNING')})
        </button>
        <button class="${() => 'filter-pill info ' + (state.levelFilter === 'INFO' ? 'active' : '')}" @click="${() => { state.levelFilter = 'INFO'; }}">
          INFO (${() => countByLevel('INFO')})
        </button>
      </div>

      <div class="log-search-row">
        <input
          type="text"
          class="log-search-input"
          placeholder="Filter logs by keyword, error code, or file:line..."
          value="${() => state.searchQuery}"
          @input="${(e) => { state.searchQuery = e.target.value; }}"
        />
        <button class="filter-pill" @click="${() => { state.autoTail = !state.autoTail; }}">
          ${() => state.autoTail ? '⏸ Tail: LIVE' : '▶ Tail: PAUSED'}
        </button>
        <button class="filter-pill" @click="${copyLogs}">
          ${() => state.copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
    </div>

    <div class="log-container console-tall">
      ${() => {
        const filtered = getFilteredLogs();
        if (filtered.length === 0) {
          return html` + "`" + `<div class="empty-logs">No log entries match filter "${() => state.levelFilter}" / "${() => state.searchQuery}"</div>` + "`" + `;
        }
        return filtered.map(entry => html` + "`" + `
          <div class="${() => 'log-row severity-' + (entry.severity || 'INFO').toLowerCase()}">
            <span class="log-time">${() => (entry.timestamp || '').slice(11, 23)}</span>
            <span class="${() => 'log-sev sev-' + (entry.severity || 'INFO').toLowerCase()}">${() => entry.severity}</span>
            <span class="log-src">[${() => entry.source || 'runtime'}]</span>
            <span class="log-msg">${() => entry.message}</span>
          </div>
        ` + "`" + `);
      }}
    </div>
  </div>
` + "`" + `;

template(container);
`
}

// synthesizeIssuesListUI generates Archetype 2: Multi-Cluster Incident Fleet Matrix.
func synthesizeIssuesListUI() string {
	return `
const state = reactive({
  filterStatus: 'ALL',
  selectedRow: ''
});

const getAllIssuePods = () => {
  const results = [];
  const topo = data.topology;
  if (topo && Array.isArray(topo.clusters)) {
    topo.clusters.forEach(cluster => {
      (cluster.namespaces || []).forEach(ns => {
        (ns.pods || []).forEach(pod => {
          if (pod.status !== 'Running') {
            results.push({
              id: pod.id || pod.name,
              name: pod.name,
              namespace: ns.name,
              cluster: cluster.name,
              status: pod.status,
              restarts: pod.restarts || 0,
              cpu: pod.cpu_usage || '980m',
              memory: pod.memory_usage || '1.8Gi',
              summary: pod.status === 'CrashLoopBackOff'
                ? 'SIGSEGV panic: postgres connection pool exhausted (exit code 2)'
                : '0/6 nodes available: Insufficient CPU & untolerated taint'
            });
          }
        });
      });
    });
  }
  if (results.length === 0) {
    return [
      {
        id: 'pod-payment-service',
        name: 'payment-service',
        namespace: 'default',
        cluster: 'production-us-central1',
        status: 'CrashLoopBackOff',
        restarts: 14,
        cpu: '980m',
        memory: '1.8Gi',
        summary: 'SIGSEGV panic: postgres connection pool exhausted (exit code 2)'
      },
      {
        id: 'pod-batch-ingestor',
        name: 'batch-ingestor',
        namespace: 'data-pipeline',
        cluster: 'staging-us-east1',
        status: 'Pending',
        restarts: 0,
        cpu: '4000m (Req)',
        memory: '8Gi (Req)',
        summary: 'Unschedulable: Insufficient CPU capacity; autoscaler provisioning +2 nodes'
      }
    ];
  }
  return results.filter(p => state.filterStatus === 'ALL' || p.status === state.filterStatus);
};

const focusPod3D = (pod) => {
  state.selectedRow = pod.name;
  container.dispatchEvent(new CustomEvent('ephemeris-select-pod', {
    bubbles: true,
    composed: true,
    detail: {
      podId: pod.name,
      clusterName: pod.cluster,
      namespaceName: pod.namespace
    }
  }));
};

const openPodLogs = (pod) => {
  container.dispatchEvent(new CustomEvent('ephemeris-prompt-query', {
    bubbles: true,
    composed: true,
    detail: {
      prompt: 'Show me the logs for ' + pod.name,
      podId: pod.name,
      resourceUri: 'gke://' + pod.namespace + '/' + pod.name
    }
  }));
};

const openPodTriage = (pod) => {
  container.dispatchEvent(new CustomEvent('ephemeris-prompt-query', {
    bubbles: true,
    composed: true,
    detail: {
      prompt: 'Run AI root-cause triage for ' + pod.name,
      podId: pod.name,
      resourceUri: 'gke://' + pod.namespace + '/' + pod.name
    }
  }));
};

const template = html` + "`" + `
  <div class="ephemeris-widget">
    <div class="widget-header">
      <div class="header-main">
        <span class="pod-title">🚨 Multi-Cluster Incident Fleet Matrix</span>
        <span class="status-pill status-crashloopbackoff">
          ${() => getAllIssuePods().length + ' Active Anomalies'}
        </span>
      </div>
      <div class="header-meta">
        <span>Scope: All GKE Clusters &bull; Click any row action to navigate 3D scene or inspect</span>
      </div>
    </div>

    <div class="log-console-toolbar">
      <div class="filter-pills">
        <button class="${() => 'filter-pill ' + (state.filterStatus === 'ALL' ? 'active' : '')}" @click="${() => { state.filterStatus = 'ALL'; }}">
          All Issues
        </button>
        <button class="${() => 'filter-pill fatal ' + (state.filterStatus === 'CrashLoopBackOff' ? 'active' : '')}" @click="${() => { state.filterStatus = 'CrashLoopBackOff'; }}">
          CrashLoopBackOff
        </button>
        <button class="${() => 'filter-pill warn ' + (state.filterStatus === 'Pending' ? 'active' : '')}" @click="${() => { state.filterStatus = 'Pending'; }}">
          Pending / Unschedulable
        </button>
      </div>
    </div>

    <div class="fleet-table-container">
      ${() => getAllIssuePods().map(pod => html` + "`" + `
        <div class="${() => 'fleet-card ' + (state.selectedRow === pod.name ? 'selected' : '')}">
          <div class="fleet-card-top">
            <div class="fleet-pod-ident">
              <span class="${() => 'status-pill status-' + pod.status.toLowerCase()}">${() => pod.status}</span>
              <strong class="fleet-pod-name">${() => pod.name}</strong>
              <span class="fleet-pod-loc">${() => pod.cluster + ' / ' + pod.namespace}</span>
            </div>
            <div class="fleet-pod-actions">
              <button class="focus-3d-btn" @click="${() => focusPod3D(pod)}">🎯 Focus 3D</button>
              <button class="filter-pill" @click="${() => openPodLogs(pod)}">📋 Logs</button>
              <button class="triage-pivot-btn" @click="${() => openPodTriage(pod)}">⚡ Triage</button>
            </div>
          </div>
          <div class="fleet-pod-summary">${() => pod.summary}</div>
          <div class="fleet-pod-metrics">
            <span>Restarts: <strong>${() => pod.restarts}</strong></span>
            <span>CPU: <strong>${() => pod.cpu}</strong></span>
            <span>Memory: <strong>${() => pod.memory}</strong></span>
          </div>
        </div>
      ` + "`" + `)}
    </div>
  </div>
` + "`" + `;

template(container);
`
}

// synthesizeNamespaceListUI generates Archetype 3: Namespace Workload Inventory Explorer.
func synthesizeNamespaceListUI(targetNamespace string) string {
	if targetNamespace == "" {
		targetNamespace = "default"
	}
	return `
const state = reactive({
  nsFilter: ` + "`" + targetNamespace + "`" + `,
  searchQuery: '',
  selectedPod: ''
});

const getNamespacePods = () => {
  const pods = [];
  const topo = data.topology;
  if (topo && Array.isArray(topo.clusters)) {
    topo.clusters.forEach(cluster => {
      (cluster.namespaces || []).forEach(ns => {
        const matchesNS = state.nsFilter === 'all' ||
          ns.name.toLowerCase().includes(state.nsFilter.toLowerCase());
        if (matchesNS) {
          (ns.pods || []).forEach(p => {
            const q = state.searchQuery.trim().toLowerCase();
            if (!q || p.name.toLowerCase().includes(q)) {
              pods.push({
                name: p.name,
                namespace: ns.name,
                cluster: cluster.name,
                status: p.status || 'Running',
                restarts: p.restarts || 0,
                cpu: p.cpu_usage || '140m',
                memory: p.memory_usage || '280Mi'
              });
            }
          });
        }
      });
    });
  }
  return pods;
};

const focusPod = (pod) => {
  state.selectedPod = pod.name;
  container.dispatchEvent(new CustomEvent('ephemeris-select-pod', {
    bubbles: true,
    composed: true,
    detail: {
      podId: pod.name,
      clusterName: pod.cluster,
      namespaceName: pod.namespace
    }
  }));
};

const showPodLogs = (pod) => {
  container.dispatchEvent(new CustomEvent('ephemeris-prompt-query', {
    bubbles: true,
    composed: true,
    detail: {
      prompt: 'Show me the logs for ' + pod.name,
      podId: pod.name,
      resourceUri: 'gke://' + pod.namespace + '/' + pod.name
    }
  }));
};

const template = html` + "`" + `
  <div class="ephemeris-widget">
    <div class="widget-header">
      <div class="header-main">
        <span class="pod-title">${() => '📦 Namespace Workload Inventory: ' + state.nsFilter}</span>
        <span class="status-pill status-running">${() => getNamespacePods().length + ' Workloads'}</span>
      </div>
      <div class="header-meta">
        <span>Click any pod to lock 3D camera reticle or inspect live container logs</span>
      </div>
    </div>

    <div class="log-console-toolbar">
      <div class="filter-pills">
        <button class="${() => 'filter-pill ' + (state.nsFilter === 'default' ? 'active' : '')}" @click="${() => { state.nsFilter = 'default'; }}">
          default
        </button>
        <button class="${() => 'filter-pill ' + (state.nsFilter === 'checkout' ? 'active' : '')}" @click="${() => { state.nsFilter = 'checkout'; }}">
          checkout
        </button>
        <button class="${() => 'filter-pill ' + (state.nsFilter === 'data-pipeline' ? 'active' : '')}" @click="${() => { state.nsFilter = 'data-pipeline'; }}">
          data-pipeline
        </button>
        <button class="${() => 'filter-pill ' + (state.nsFilter === 'all' ? 'active' : '')}" @click="${() => { state.nsFilter = 'all'; }}">
          All Namespaces
        </button>
      </div>
      <div class="log-search-row">
        <input
          type="text"
          class="log-search-input"
          placeholder="Search workloads by name..."
          value="${() => state.searchQuery}"
          @input="${(e) => { state.searchQuery = e.target.value; }}"
        />
      </div>
    </div>

    <div class="fleet-table-container">
      ${() => getNamespacePods().map(pod => html` + "`" + `
        <div class="${() => 'fleet-card ' + (state.selectedPod === pod.name ? 'selected' : '')}">
          <div class="fleet-card-top">
            <div class="fleet-pod-ident">
              <span class="${() => 'status-pill status-' + pod.status.toLowerCase()}">${() => pod.status}</span>
              <strong class="fleet-pod-name">${() => pod.name}</strong>
              <span class="fleet-pod-loc">${() => pod.cluster + ' / ' + pod.namespace}</span>
            </div>
            <div class="fleet-pod-actions">
              <button class="focus-3d-btn" @click="${() => focusPod(pod)}">🎯 Focus 3D</button>
              <button class="filter-pill" @click="${() => showPodLogs(pod)}">📋 Logs</button>
            </div>
          </div>
          <div class="fleet-pod-metrics">
            <span>CPU: <strong>${() => pod.cpu}</strong></span>
            <span>Memory: <strong>${() => pod.memory}</strong></span>
            <span>Restarts: <strong>${() => pod.restarts}</strong></span>
          </div>
        </div>
      ` + "`" + `)}
    </div>
  </div>
` + "`" + `;

template(container);
`
}

// synthesizeResourceLeaderboardUI generates Archetype 4: Resource Utilization Leaderboard.
func synthesizeResourceLeaderboardUI() string {
	return `
const state = reactive({
  sortBy: 'memory'
});

const getRankedWorkloads = () => {
  const list = [
    { name: 'batch-ingestor', namespace: 'data-pipeline', cluster: 'staging-us-east1', status: 'Pending', cpuPct: 95, memPct: 92, cpu: '3800m', mem: '7.4Gi' },
    { name: 'payment-service', namespace: 'default', cluster: 'production-us-central1', status: 'CrashLoopBackOff', cpuPct: 88, memPct: 89, cpu: '980m', mem: '1.8Gi' },
    { name: 'cart-service', namespace: 'default', cluster: 'production-us-central1', status: 'Running', cpuPct: 62, memPct: 64, cpu: '620m', mem: '640Mi' },
    { name: 'checkout-service', namespace: 'checkout', cluster: 'production-us-central1', status: 'Running', cpuPct: 54, memPct: 48, cpu: '540m', mem: '480Mi' },
    { name: 'frontend', namespace: 'default', cluster: 'production-us-central1', status: 'Running', cpuPct: 41, memPct: 38, cpu: '410m', mem: '380Mi' },
    { name: 'redis-cart', namespace: 'default', cluster: 'production-us-central1', status: 'Running', cpuPct: 29, memPct: 52, cpu: '290m', mem: '520Mi' }
  ];
  return list.sort((a, b) => state.sortBy === 'cpu' ? b.cpuPct - a.cpuPct : b.memPct - a.memPct);
};

const focusPod = (w) => {
  container.dispatchEvent(new CustomEvent('ephemeris-select-pod', {
    bubbles: true,
    composed: true,
    detail: { podId: w.name, clusterName: w.cluster, namespaceName: w.namespace }
  }));
};

const template = html` + "`" + `
  <div class="ephemeris-widget">
    <div class="widget-header">
      <div class="header-main">
        <span class="pod-title">📊 Workload Resource Saturation Leaderboard</span>
        <span class="status-pill status-running">Live Telemetry</span>
      </div>
      <div class="header-meta">
        <span>Sort by CPU or Memory saturation &bull; Click any bar to inspect in 3D</span>
      </div>
    </div>

    <div class="log-console-toolbar">
      <div class="filter-pills">
        <button class="${() => 'filter-pill ' + (state.sortBy === 'memory' ? 'active' : '')}" @click="${() => { state.sortBy = 'memory'; }}">
          Sort by Memory Saturation
        </button>
        <button class="${() => 'filter-pill ' + (state.sortBy === 'cpu' ? 'active' : '')}" @click="${() => { state.sortBy = 'cpu'; }}">
          Sort by CPU Saturation
        </button>
      </div>
    </div>

    <div class="fleet-table-container">
      ${() => getRankedWorkloads().map(w => html` + "`" + `
        <div class="fleet-card">
          <div class="fleet-card-top">
            <div class="fleet-pod-ident">
              <strong class="fleet-pod-name">${() => w.name}</strong>
              <span class="fleet-pod-loc">${() => w.cluster + ' / ' + w.namespace}</span>
            </div>
            <div class="fleet-pod-actions">
              <span class="metric-label">${() => state.sortBy === 'cpu' ? w.cpu + ' (' + w.cpuPct + '%)' : w.mem + ' (' + w.memPct + '%)'}</span>
              <button class="focus-3d-btn" @click="${() => focusPod(w)}">🎯 Focus 3D</button>
            </div>
          </div>
          <div class="metric-bar-bg">
            <div class="${() => 'metric-bar-fill ' + ((state.sortBy === 'cpu' ? w.cpuPct : w.memPct) > 80 ? 'critical' : 'normal')}"
                 style="${() => 'width: ' + (state.sortBy === 'cpu' ? w.cpuPct : w.memPct) + '%'}"></div>
          </div>
        </div>
      ` + "`" + `)}
    </div>
  </div>
` + "`" + `;

template(container);
`
}
