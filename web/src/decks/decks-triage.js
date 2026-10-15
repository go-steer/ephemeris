/* Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Synthesizes an interactive @arrow-js/core triage component and telemetry
 * payload for any selected /decks resource (Pod, Controller/Workload, Node, Ingress).
 * Executes inside ArrowSandboxRuntime (isolated ShadowRoot with masked globals).
 *
 * @param {object} item - Selected item from /decks scene (`pod`, `controller`, `node`, `ingress`).
 * @param {string} promptText - User natural language triage prompt.
 * @param {object} cluster - Current active cluster model.
 * @returns {{ code: string, telemetry: object, title: string }}
 */
export function synthesizeDecksTriagePayload(item, promptText = '', cluster = null) {
  const cleanPrompt = (promptText || '').trim() || defaultPromptForItem(item);
  const raw = item?.data || item || {};
  const type = item?.type || raw.type || 'pod';

  if (type === 'controller') {
    return buildControllerTriagePayload(raw, cleanPrompt, cluster);
  }
  if (type === 'node') {
    return buildNodeTriagePayload(raw, cleanPrompt);
  }
  if (type === 'ingress') {
    return buildIngressTriagePayload(raw, cleanPrompt);
  }
  return buildPodTriagePayload(raw, cleanPrompt, cluster);
}

/**
 * Returns a contextual default prompt for a selected /decks item.
 *
 * @param {object} item
 * @returns {string}
 */
export function defaultPromptForItem(item) {
  if (!item) return 'Synthesize cluster incident triage control plane';
  const d = item.data || item;
  const type = item.type || d.type || 'pod';
  if (type === 'pod') {
    const crashed = d.visualClass === 'crashed' || d.state === 'crashed';
    return crashed
      ? `Diagnose CrashLoopBackOff on ${d.name} and synthesize rollback & remediation controls`
      : `Inspect container telemetry, resource limits, and live probes for ${d.name}`;
  }
  if (type === 'controller') {
    return `Analyze ${d.kind || 'Deployment'} ${d.name} replica health, rollout wave, and pod blast radius`;
  }
  if (type === 'node') {
    return `Analyze GKE node ${d.name} (${d.nodePool || d.pool || 'default-pool'}) CPU/memory pressure and scheduled pods`;
  }
  if (type === 'ingress') {
    return `Inspect ${d.kind || 'Gateway'} ${d.name} HTTPRoute traffic split and backend error rates`;
  }
  return `Synthesize triage controls for ${d.name || 'selected resource'}`;
}

function buildPodTriagePayload(pod, promptText, cluster) {
  const p =
    pod && pod.name
      ? pod
      : {
          key: 'payments/payment-service-7f8b9-x2k',
          name: 'payment-service-7f8b9-x2k',
          namespace: 'payments',
          controller: 'payments/payment-service',
          node: 'gke-pool-1-a8f2',
          nodeKey: 'gke-pool-1-a8f2',
          visualClass: 'crashed',
          status: 'CrashLoopBackOff',
          restarts: 7,
          cpuMillis: 640,
          cpuLimitMillis: 1000,
          memoryMi: 780,
          memoryLimitMi: 512,
        };

  const visualState = p.visualClass || p.state || 'running';
  const cpuMillis = p.cpuMillis ?? p.cpuMillicores ?? 210;
  const cpuLimit = p.cpuLimitMillis ?? 1000;
  const memoryMi = p.memoryMi ?? p.memoryMillicores ?? p.memoryMiB ?? 340;
  const memoryLimit = p.memoryLimitMi ?? 512;
  const ctrlKey = p.controller?.includes('/') ? p.controller : `${p.namespace}/${p.controller}`;
  const ctrlObj = cluster?.controllers?.find((c) => c.key === ctrlKey);

  const telemetry = {
    kind: 'Pod',
    key: p.key || `${p.namespace}/${p.name}`,
    name: p.name,
    namespace: p.namespace || 'default',
    controllerKey: ctrlKey,
    controllerName: ctrlObj?.name || (p.controller || '').split('/').pop() || 'app',
    controllerKind: ctrlObj?.kind || 'Deployment',
    nodeKey: p.nodeKey || p.node || 'gke-node-0',
    nodeName: p.node || 'gke-node-0',
    podState: visualState,
    status: p.status || 'Running',
    restarts: p.restarts || 0,
    cpuMillis,
    cpuLimit,
    memoryMi,
    memoryLimit,
    prompt: promptText,
    rootCause:
      visualState === 'crashed'
        ? 'OOMKilled (Exit Code 137) + Upstream Pool Timeout (10.44.0.9:5432)'
        : visualState === 'transition'
          ? 'RollingUpdate Surge Replica Readiness Probe Warming'
          : 'Healthy Container Runtime — All Liveness/Readiness Probes Passing',
  };

  const code = `
const state = reactive({
  status: data.status || 'Running',
  podState: data.podState || 'running',
  restarts: data.restarts || 0,
  memLimitMi: data.memoryLimit || 512,
  cpuPct: Math.min(100, Math.round((data.cpuMillis / Math.max(1, data.cpuLimit)) * 100)),
  memPct: Math.min(100, Math.round((data.memoryMi / Math.max(1, data.memoryLimit)) * 100)),
  remediated: false,
  actionLog: data.podState === 'crashed'
    ? 'Ready to apply hotfix: raise memory limit to 1024Mi & restart container.'
    : 'All probes nominal. Ready for live inspection or chaos validation.'
});

function remediatePod() {
  state.remediated = true;
  state.podState = 'running';
  state.status = 'Running (Remediated)';
  state.restarts = 0;
  state.memLimitMi = 1024;
  state.memPct = 42;
  state.actionLog = 'Applied memory limit 1024Mi & restarted pod ' + data.name + ' -> Running.';
  container.dispatchEvent(new CustomEvent('ephemeris-remediated', {
    detail: {
      targetKey: data.key,
      podId: data.name,
      namespace: data.namespace,
      controller: data.controllerKey,
      action: 'rollback_and_scale_mem'
    }
  }));
}

function focusOwner() {
  container.dispatchEvent(new CustomEvent('ephemeris-select-pod', {
    detail: { type: 'controller', key: data.controllerKey }
  }));
}

function focusNode() {
  container.dispatchEvent(new CustomEvent('ephemeris-select-pod', {
    detail: { type: 'node', key: data.nodeKey }
  }));
}

const template = html\`
  <div class="triage-card">
    <div class="triage-header">
      <div>
        <div class="triage-title">\${() => data.namespace} / \${() => data.name}</div>
        <div class="triage-subtitle">Prompt: "\${() => data.prompt}"</div>
      </div>
      <span class="\${() => state.podState === 'crashed' ? 'status-badge critical' : 'status-badge healthy'}">
        \${() => state.status}
      </span>
    </div>

    <div class="metrics-grid">
      <div class="metric-box">
        <div class="metric-label">CPU Usage</div>
        <div class="metric-value">\${() => data.cpuMillis}m / \${() => data.cpuLimit}m</div>
        <div class="metric-bar-bg">
          <div class="metric-bar-fill" style="\${() => 'width:' + state.cpuPct + '%'}"></div>
        </div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Memory / Limit</div>
        <div class="metric-value">\${() => data.memoryMi}Mi / \${() => state.memLimitMi}Mi</div>
        <div class="metric-bar-bg">
          <div class="\${() => state.podState === 'crashed' ? 'metric-bar-fill critical' : 'metric-bar-fill'}" style="\${() => 'width:' + state.memPct + '%'}"></div>
        </div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Restarts</div>
        <div class="\${() => state.restarts > 0 ? 'metric-value critical' : 'metric-value'}">\${() => state.restarts}</div>
      </div>
    </div>

    <div class="metric-box" style="margin-bottom: 12px;">
      <div class="metric-label">Gemini Root-Cause Synthesis</div>
      <div style="font-size: 12.5px; color: #e6edf3; margin-top: 4px; font-weight: 600;">
        \${() => state.remediated ? 'Resolved: Container stabilized after memory limit bump to 1024Mi.' : data.rootCause}
      </div>
      <div style="font-size: 11.5px; color: #8b949e; margin-top: 4px;">
        \${() => state.actionLog}
      </div>
    </div>

    <div class="action-bar" style="margin-top: 10px; flex-wrap: wrap;">
      <button class="btn btn-primary" @click="\${remediatePod}">
        \${() => state.remediated ? '✓ Pod Remediated (Running)' : '⚡ Remediate & Restart Pod'}
      </button>
      <button class="btn" @click="\${focusOwner}">
        ↑ \${() => data.controllerKind} (\${() => data.controllerName})
      </button>
      <button class="btn" @click="\${focusNode}">
        ⊞ Node (\${() => data.nodeName})
      </button>
    </div>
  </div>
\`;

template(container);
`;

  return {
    title: `Pod Triage · ${p.name}`,
    code,
    telemetry,
  };
}

function buildControllerTriagePayload(ctrl, promptText) {
  const ready = ctrl.readyReplicas ?? 0;
  const desired = ctrl.desiredReplicas ?? 1;
  const crashedCount = ctrl.crashedReplicas ?? Math.max(0, desired - ready);
  const targetKey = ctrl.key || `${ctrl.namespace}/${ctrl.name}`;

  const telemetry = {
    kind: ctrl.kind || 'Deployment',
    key: targetKey,
    name: ctrl.name,
    namespace: ctrl.namespace || 'default',
    readyReplicas: ready,
    desiredReplicas: desired,
    crashedReplicas: crashedCount,
    cpuPct: Math.round((ctrl.cpuPct ?? ctrl.cpuRatio ?? 0.35) * 100),
    memPct: Math.round((ctrl.memPct ?? ctrl.memRatio ?? 0.42) * 100),
    prompt: promptText,
  };

  const code = `
const state = reactive({
  ready: data.readyReplicas,
  desired: data.desiredReplicas,
  crashed: data.crashedReplicas,
  remediated: false,
  note: data.crashedReplicas > 0
    ? data.crashedReplicas + ' replica(s) failing readiness probes in ' + data.namespace + '/' + data.name
    : 'All ' + data.readyReplicas + '/' + data.desiredReplicas + ' replicas ready across GKE nodes.'
});

function healWorkload() {
  state.remediated = true;
  state.ready = state.desired;
  state.crashed = 0;
  state.note = 'Rolled back ' + data.kind + ' ' + data.name + ' — all ' + state.desired + '/' + state.desired + ' replicas Ready!';
  container.dispatchEvent(new CustomEvent('ephemeris-remediated', {
    detail: { targetKey: data.key, controller: data.name, namespace: data.namespace, action: 'rollback_workload' }
  }));
}

function scopePods() {
  container.dispatchEvent(new CustomEvent('ephemeris-select-pod', {
    detail: { type: 'drill-controller', key: data.key, label: data.namespace + '/' + data.name }
  }));
}

const template = html\`
  <div class="triage-card">
    <div class="triage-header">
      <div>
        <div class="triage-title">\${() => data.kind}: \${() => data.namespace}/\${() => data.name}</div>
        <div class="triage-subtitle">Prompt: "\${() => data.prompt}"</div>
      </div>
      <span class="\${() => state.crashed > 0 ? 'status-badge critical' : 'status-badge healthy'}">
        \${() => state.ready}/\${() => state.desired} READY
      </span>
    </div>

    <div class="metrics-grid">
      <div class="metric-box">
        <div class="metric-label">Replica Availability</div>
        <div class="metric-value">\${() => Math.round((state.ready / Math.max(1, state.desired)) * 100)}%</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Avg CPU</div>
        <div class="metric-value">\${() => data.cpuPct}%</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Avg Memory</div>
        <div class="metric-value">\${() => data.memPct}%</div>
      </div>
    </div>

    <div class="metric-box" style="margin-bottom: 12px;">
      <div class="metric-label">Workload Rollout & Blast Radius</div>
      <div style="font-size: 12px; color: #e6edf3; margin-top: 4px;">\${() => state.note}</div>
    </div>

    <div class="action-bar" style="flex-wrap: wrap;">
      <button class="btn btn-primary" @click="\${healWorkload}">
        \${() => state.remediated ? '✓ Workload Healthy' : '⚡ Rollback & Heal Replicas'}
      </button>
      <button class="btn" @click="\${scopePods}">
        🔍 Drill Down Pods on Deck 3
      </button>
    </div>
  </div>
\`;

template(container);
`;

  return {
    title: `${telemetry.kind} Triage · ${ctrl.name}`,
    code,
    telemetry,
  };
}

function buildNodeTriagePayload(node, promptText) {
  const degraded = node.status && node.status !== 'Ready';
  const telemetry = {
    kind: 'Node',
    key: node.key || node.name,
    name: node.name,
    pool: node.nodePool || node.pool || 'default-pool',
    zone: node.zone || 'us-central1-a',
    cpuRatio: Math.round((node.cpuPct ?? node.cpuRatio ?? 0.45) * 100),
    memRatio: Math.round((node.memPct ?? node.memRatio ?? 0.52) * 100),
    usedPods: node.usedPods ?? node.podCount ?? 0,
    maxPods: node.maxPods ?? 32,
    degraded: Boolean(degraded || (node.crashedCount ?? 0) > 0),
    prompt: promptText,
  };

  const code = `
const state = reactive({
  cordoned: false,
  degraded: data.degraded,
  statusText: data.degraded
    ? 'Node experiencing pressure / failing pods on ' + data.name
    : 'Kubelet Ready · No PID/Disk/Memory pressure events on ' + data.name
});

function cordonAndHeal() {
  state.cordoned = true;
  state.degraded = false;
  state.statusText = 'Drained failing pods from ' + data.name + ' & rescheduled across pool ' + data.pool + '.';
  container.dispatchEvent(new CustomEvent('ephemeris-remediated', {
    detail: { targetKey: data.key, node: data.name, action: 'drain_and_heal_node' }
  }));
}

const template = html\`
  <div class="triage-card">
    <div class="triage-header">
      <div>
        <div class="triage-title">GKE Node: \${() => data.name}</div>
        <div class="triage-subtitle">Pool: \${() => data.pool} · Zone: \${() => data.zone}</div>
      </div>
      <span class="\${() => state.degraded ? 'status-badge critical' : 'status-badge healthy'}">
        \${() => state.cordoned ? 'DRAINED & HEALED' : state.degraded ? 'NODE DEGRADED' : 'KUBELET READY'}
      </span>
    </div>

    <div class="metrics-grid">
      <div class="metric-box">
        <div class="metric-label">Scheduled Pods</div>
        <div class="metric-value">\${() => data.usedPods} / \${() => data.maxPods}</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Node CPU</div>
        <div class="metric-value">\${() => data.cpuRatio}%</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Node Memory</div>
        <div class="metric-value">\${() => data.memRatio}%</div>
      </div>
    </div>

    <div class="metric-box" style="margin-bottom: 12px;">
      <div class="metric-label">Node Diagnostics</div>
      <div style="font-size: 12px; color: #e6edf3; margin-top: 4px;">\${() => state.statusText}</div>
    </div>

    <div class="action-bar">
      <button class="btn btn-primary" @click="\${cordonAndHeal}">
        \${() => state.cordoned ? '✓ Node Failing Pods Evicted' : '⚡ Evict & Heal Failing Pods'}
      </button>
    </div>
  </div>
\`;

template(container);
`;

  return {
    title: `Node Triage · ${node.name}`,
    code,
    telemetry,
  };
}

function buildIngressTriagePayload(ing, promptText) {
  const telemetry = {
    kind: ing.kind || 'Gateway',
    key: ing.key || ing.name,
    name: ing.name,
    route: ing.gatewayName || ing.route || 'checkout-httproute',
    serviceName: ing.serviceName || 'api-gateway',
    rps: ing.rps || 940,
    errPct: ing.errPct ?? 0,
    prompt: promptText,
  };

  const code = `
const state = reactive({
  stableWeight: 90,
  canaryWeight: 10,
  drained: false,
  statusMsg: 'Gateway ' + data.route + ' routing ' + data.rps + ' req/s to ' + data.serviceName
});

function drainCanary() {
  state.stableWeight = 100;
  state.canaryWeight = 0;
  state.drained = true;
  state.statusMsg = 'Shifted 100% traffic to stable backend on ' + data.name + ' (0% 5xx error leakage).';
  container.dispatchEvent(new CustomEvent('ephemeris-traffic-drain', {
    detail: { targetKey: data.key, gateway: data.name, route: data.route, stableWeight: 100, canaryWeight: 0 }
  }));
  container.dispatchEvent(new CustomEvent('ephemeris-remediated', {
    detail: { targetKey: data.key, gateway: data.name, action: 'heal_ingress_backends' }
  }));
}

const template = html\`
  <div class="triage-card">
    <div class="triage-header">
      <div>
        <div class="triage-title">\${() => data.kind}: \${() => data.name}</div>
        <div class="triage-subtitle">Gateway: \${() => data.route} · \${() => data.rps} req/s</div>
      </div>
      <span class="\${() => state.drained ? 'status-badge healthy' : 'status-badge warning'}">
        \${() => state.stableWeight}% / \${() => state.canaryWeight}% SPLIT
      </span>
    </div>

    <div class="metric-box" style="margin-bottom: 12px;">
      <div class="metric-label">Gateway Traffic Split Control</div>
      <div style="font-size: 12px; color: #e6edf3; margin-top: 4px;">\${() => state.statusMsg}</div>
    </div>

    <div class="action-bar">
      <button class="btn btn-primary" @click="\${drainCanary}">
        \${() => state.drained ? '✓ 100% Traffic on Stable Backend' : '⚡ Drain Canary & Heal Backends'}
      </button>
    </div>
  </div>
\`;

template(container);
`;

  return {
    title: `Gateway Triage · ${ing.name}`,
    code,
    telemetry,
  };
}

/**
 * Generates a realistic live container log entry with current UTC millisecond timestamp
 * for mock/mega-scale pod log streaming (`Follow: true`).
 *
 * @param {object} pod
 * @param {number} seq
 * @returns {{ timestamp: string, severity: string, message: string }}
 */
export function generateSimulatedLogEntry(pod, seq = 0) {
  const timestamp = new Date().toISOString();
  if (!pod) {
    return { timestamp, severity: 'INFO', message: 'container healthcheck probe OK (200)' };
  }
  const visualState = pod.visualClass || pod.state || 'running';
  if (visualState === 'crashed') {
    const crashedMsgs = [
      {
        severity: 'ERROR',
        message: `panic: upstream connection pool exhausted (10.44.0.9:5432) retry=${seq + 1}`,
      },
      {
        severity: 'ERROR',
        message: `memory cgroup limit exceeded (${pod.memoryMi || 780}MiB) — OOMKilled signal 9`,
      },
      {
        severity: 'WARNING',
        message: `kubelet BackOff restarting failed container in pod ${pod.name}`,
      },
    ];
    return { timestamp, ...crashedMsgs[seq % crashedMsgs.length] };
  }
  if (visualState === 'transition') {
    return {
      timestamp,
      severity: 'INFO',
      message: `Rollout surge replica warming cache (${Math.min(99, 55 + (seq % 40))}% complete) on ${pod.node}`,
    };
  }
  const healthyMsgs = [
    {
      severity: 'INFO',
      message: `GET /healthz 200 OK (${2 + (seq % 5)}ms) node=${pod.node} cpu=${pod.cpuMillis || 120}m`,
    },
    {
      severity: 'INFO',
      message: `gRPC stream batch committed (${48 + ((seq * 13) % 90)} msgs, p99=${6 + (seq % 7)}ms)`,
    },
  ];
  return { timestamp, ...healthyMsgs[seq % healthyMsgs.length] };
}
