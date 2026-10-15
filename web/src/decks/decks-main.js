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

import { ThemePicker, themeById } from './themes.js';
import {
  SCENARIOS,
  buildMockFleet,
  adaptLiveTopologyToFleet,
  remediateTarget,
  nextMockEvent,
  materializePodAt,
} from './mock-data.js';
import { DecksScene } from './decks-scene.js';
import { ArrowSandboxRuntime } from '../sandbox/runtime.js';
import { WebSocketClient } from '../ws/client.js';
import {
  synthesizeDecksTriagePayload,
  defaultPromptForItem,
  generateSimulatedLogEntry,
} from './decks-triage.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initDecksApp() {
  const params = new URLSearchParams(window.location.search);
  const initialScenario = params.get('scenario') || 'default';
  const syntheticCount = Number(params.get('synthetic')) || 0;
  const initialLayout = params.get('layout') || '3-deck';
  const initialBottom = params.get('bottom') === 'nodes' ? 'nodes' : 'namespaces';
  const initialView = params.get('view') === 'fleet' ? 'fleet' : 'cluster';

  let fleet = buildMockFleet({ scenario: initialScenario, synthetic: syntheticCount });
  let liveWsTopology = null;
  let activeClusterName = params.get('cluster') || fleet.clusters[0].name;
  let feedPaused = false;
  let eventSeq = 1;

  const topbarEl = document.getElementById('topbar');
  const canvas = document.getElementById('scene');
  const labelsRoot = document.getElementById('labels');
  const fleetBtn = document.getElementById('fleet-btn');
  const fleetCountEl = document.getElementById('fleet-count');
  const clusterSelect = document.getElementById('cluster-select');
  const scenarioSelect = document.getElementById('scenario-select');
  const nsSelect = document.getElementById('ns');
  const searchInput = document.getElementById('search');
  const drillPillBtn = document.getElementById('drill-pill');
  const drillPillText = document.getElementById('drill-pill-text');
  const connText = document.getElementById('conn-text');
  const panelEl = document.getElementById('panel');
  const panelContent = document.getElementById('panel-content');
  const feedPanel = document.getElementById('feedpanel');
  const feedList = document.getElementById('feed-list');
  const feedPauseBtn = document.getElementById('feed-pause');
  const feedToggleBtn = document.getElementById('feed-toggle');
  const deckLinkBtn = document.getElementById('deck-link');
  const deckResetBtn = document.getElementById('deck-reset');
  const statusModeEl = document.getElementById('status-mode');
  const statusSummaryEl = document.getElementById('status-summary');
  const clockEl = document.getElementById('clock');
  const helpEl = document.getElementById('help');
  const promptForm = document.getElementById('decks-prompt-form');
  const promptChip = document.getElementById('decks-prompt-chip');
  const promptInput = document.getElementById('decks-prompt-input');
  const triageDrawer = document.getElementById('triage-drawer');
  const triageTitleEl = document.getElementById('triage-drawer-title');
  const triageStatusEl = document.getElementById('triage-status');
  const triageStatusTextEl = document.getElementById('triage-status-text');
  const triageCancelBtn = document.getElementById('triage-cancel');
  const triageCloseBtn = document.getElementById('triage-close');
  const triageSandboxHost = document.getElementById('triage-sandbox-host');
  const sandboxRuntime = triageSandboxHost ? new ArrowSandboxRuntime(triageSandboxHost) : null;

  let activeRequestId = null;
  let activeSynthesisTimer = null;
  let activeFallbackPayload = null;
  let logStreamPodKey = null;
  let logStreamTimer = null;
  let logStreamSeq = 0;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsClient = new WebSocketClient(`${proto}//${window.location.host}/ws`);

  // Dynamically track #topbar bottom edge so #feedpanel and #panel are never covered when #topbar wraps
  function syncTopbarOffset() {
    if (!topbarEl) return;
    const rect = topbarEl.getBoundingClientRect();
    const offsetPx = Math.max(66, Math.ceil(rect.bottom + 10));
    document.documentElement.style.setProperty('--topbar-bottom', `${offsetPx}px`);
  }
  syncTopbarOffset();
  window.addEventListener('resize', syncTopbarOffset);
  if (typeof ResizeObserver !== 'undefined' && topbarEl) {
    const ro = new ResizeObserver(() => syncTopbarOffset());
    ro.observe(topbarEl);
  }

  let scene = null;

  const themePicker = new ThemePicker(document.getElementById('theme'), (newTheme) => {
    if (scene) scene.setTheme(newTheme);
  });

  scene = new DecksScene(canvas, labelsRoot, themePicker.theme || themeById(), {
    onSelect: (item) => renderInspector(item),
    onHover: (item) => {
      if (item) {
        statusSummaryEl.textContent = `${item.type.toUpperCase()}: ${item.key}`;
      } else {
        updateStatusBar();
      }
    },
    onClusterDive: (clusterName) => {
      diveIntoCluster(clusterName);
    },
    onOffsetsChanged: (hasCustom) => {
      deckResetBtn.hidden = !hasCustom;
    },
    onDrillChanged: (drill) => {
      if (drill) {
        drillPillBtn.hidden = false;
        drillPillText.textContent = `🔍 Deck 3 Scoped: ${drill.label || drill.key}`;
      } else {
        drillPillBtn.hidden = true;
      }
      syncTopbarOffset();
      updateStatusBar();
    },
    onBottomModeChanged: (mode) => {
      document.querySelectorAll('#bottom-mode button').forEach((b) => {
        b.classList.toggle('active', b.dataset.bottom === mode);
      });
      updateStatusBar();
    },
  });

  scene.layoutMode = initialLayout;
  scene.bottomMode = initialBottom;
  scene.viewMode = initialView;
  document.querySelectorAll('#bottom-mode button').forEach((b) => {
    b.classList.toggle('active', b.dataset.bottom === initialBottom);
  });

  drillPillBtn.addEventListener('click', () => {
    scene.setDrillFilter(null);
  });

  function populateScenarioSelect() {
    scenarioSelect.innerHTML =
      SCENARIOS.map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('') +
      `<option value="live-ws">Live /ws Backend Sync</option>`;
    scenarioSelect.value = SCENARIOS.some((s) => s.id === initialScenario)
      ? initialScenario
      : 'default';
  }

  function getActiveCluster() {
    return fleet.clusters.find((c) => c.name === activeClusterName) || fleet.clusters[0];
  }

  function getClusterPodCount(c) {
    return c.podCount ?? c.pods.length;
  }

  function updateClusterAndNamespaceSelectors() {
    fleetCountEl.textContent = `(${fleet.clusters.length})`;
    clusterSelect.innerHTML = fleet.clusters
      .map((c) => {
        const crash = c.counts?.crashed || 0;
        const pCount = getClusterPodCount(c);
        const badge = crash > 0 ? `⚠ ${crash} err` : `● ${pCount.toLocaleString()} pods`;
        return `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${escapeHtml(c.location)} · ${badge})</option>`;
      })
      .join('');
    clusterSelect.value = getActiveCluster().name;

    const cluster = getActiveCluster();
    const namespaces = cluster.namespaces
      ? [...cluster.namespaces]
      : [...new Set(cluster.pods.map((p) => p.namespace))].sort();
    const prevNs = nsSelect.value;
    // Cap option rendering at 200 in dropdown if 500 namespaces so DOM stays snappy, or render all 500
    nsSelect.innerHTML =
      `<option value="">All namespaces (${namespaces.length})</option>` +
      namespaces.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    if (namespaces.includes(prevNs)) {
      nsSelect.value = prevNs;
    } else {
      nsSelect.value = '';
    }
  }

  function updateLegendCounts() {
    const counts = { running: 0, transition: 0, crashed: 0, pending: 0, suspended: 0 };
    if (scene.viewMode === 'fleet') {
      for (const c of fleet.clusters) {
        for (const k of Object.keys(counts)) counts[k] += c.counts?.[k] || 0;
      }
    } else {
      const c = getActiveCluster();
      for (const k of Object.keys(counts)) counts[k] = c.counts?.[k] || 0;
    }
    for (const k of Object.keys(counts)) {
      const el = document.getElementById(`c-${k}`);
      if (el) el.textContent = counts[k].toLocaleString();
    }
  }

  function updateStatusBar() {
    const barLegendEl = document.getElementById('bar-legend');
    const blBar1El = document.getElementById('bl-bar1');

    if (scene.viewMode === 'fleet') {
      if (barLegendEl) barLegendEl.style.display = 'none';
      statusModeEl.textContent = `Level 1 · Fleet Overview Deck (${fleet.clusters.length} GKE Clusters)`;
      const totalPods = fleet.clusters.reduce((s, c) => s + getClusterPodCount(c), 0);
      const crashed = fleet.clusters.reduce((s, c) => s + (c.counts?.crashed || 0), 0);
      statusSummaryEl.textContent = `${totalPods.toLocaleString()} fleet pods · ${crashed.toLocaleString()} active crash alerts — click any cluster platform to dive in`;
      fleetBtn.classList.add('active');
    } else {
      if (barLegendEl) barLegendEl.style.display = '';
      if (blBar1El) {
        blBar1El.textContent =
          scene.bottomMode === 'nodes'
            ? 'Ready Replicas (Deck 2) / Pod Slots (Deck 3 Nodes)'
            : 'Ready Replicas (Deck 2 Workloads)';
      }
      const c = getActiveCluster();
      const nsCount = c.namespaces
        ? c.namespaces.length
        : new Set(c.pods.map((p) => p.namespace)).size;
      const pCount = getClusterPodCount(c);
      const shownPods = scene.currentPlan?.podLayout?.count ?? pCount;
      const scopeSuffix = scene.drillFilter ? ` [Scoped: ${shownPods.toLocaleString()} pods]` : '';
      statusModeEl.textContent = `Level 2 · ${c.name} (${c.location}) · ${scene.layoutMode} (Deck 3: ${scene.bottomMode})`;
      statusSummaryEl.textContent = `${nsCount} namespaces · ${c.controllers.length} workloads · ${pCount.toLocaleString()} pods · ${(c.nodes || []).length} nodes${scopeSuffix}`;
      fleetBtn.classList.remove('active');
    }
  }

  function syncSceneFromState(resetCam = false) {
    const c = getActiveCluster();
    activeClusterName = c.name;
    updateClusterAndNamespaceSelectors();
    updateLegendCounts();
    scene.setData(fleet, activeClusterName);
    updateStatusBar();
    syncTopbarOffset();
    if (resetCam) scene.homeCamera();
  }

  function diveIntoCluster(clusterName) {
    activeClusterName = clusterName;
    scene.viewMode = 'cluster';
    syncSceneFromState(true);
    pushFeedEvent({
      seq: eventSeq++,
      time: new Date().toISOString().slice(11, 23),
      kind: 'Dive',
      badgeClass: 'ev-woke',
      glyph: '↳',
      cluster: clusterName,
      namespace: 'all',
      podKey: null,
      podName: clusterName,
      summary: `Focused single-cluster decks view for ${clusterName}`,
    });
  }

  function getSamplePodsForController(c, ctrlKey, limit = 24) {
    if (!c.podTable) {
      return c.pods.filter((p) => p.controller === ctrlKey).slice(0, limit);
    }
    const ctrlIdx = c.controllers.findIndex((ct) => ct.key === ctrlKey);
    if (ctrlIdx < 0) return [];
    const out = [];
    const { podCount, ctrlIdx: cArr } = c.podTable;
    for (let i = 0; i < podCount && out.length < limit; i++) {
      if (cArr[i] === ctrlIdx) {
        out.push(materializePodAt(c, i));
      }
    }
    return out;
  }

  function getSamplePodsForNode(c, nodeKey, nodeName, limit = 24) {
    if (!c.podTable) {
      return c.pods.filter((p) => p.nodeKey === nodeKey || p.node === nodeName).slice(0, limit);
    }
    const nIdx = (c.nodes || []).findIndex((n) => n.key === nodeKey || n.name === nodeName);
    if (nIdx < 0) return [];
    const out = [];
    const { podCount, nodeIdx: nArr } = c.podTable;
    for (let i = 0; i < podCount && out.length < limit; i++) {
      if (nArr[i] === nIdx) {
        out.push(materializePodAt(c, i));
      }
    }
    return out;
  }

  function stopPodLogStream() {
    if (logStreamTimer) {
      clearInterval(logStreamTimer);
      logStreamTimer = null;
    }
    if (logStreamPodKey) {
      wsClient.sendStopLogStream();
      logStreamPodKey = null;
    }
  }

  function appendLogLineToInspector(entry) {
    const logBox = panelContent.querySelector('.log-box');
    if (!logBox || !entry) return;
    const div = document.createElement('div');
    const sev = entry.severity || 'INFO';
    const ts = (entry.timestamp || new Date().toISOString()).slice(11, 23);
    div.className = `log-line ${escapeHtml(sev)}`;
    div.innerHTML = `<span class="ts">${escapeHtml(ts)}</span>${escapeHtml(entry.message)}`;
    logBox.appendChild(div);
    while (logBox.children.length > 80) {
      logBox.removeChild(logBox.firstChild);
    }
    logBox.scrollTop = logBox.scrollHeight;
  }

  function togglePodLogStream(pod) {
    if (!pod) return;
    if (logStreamPodKey === pod.key) {
      stopPodLogStream();
      if (scene.selectedItem?.type === 'pod') {
        renderInspector(scene.selectedItem);
      }
      return;
    }
    stopPodLogStream();
    logStreamPodKey = pod.key;
    logStreamSeq = 0;

    // Request live /ws log stream if backend connected
    const activeCluster = getActiveCluster();
    wsClient.selectNode(
      pod.name,
      `gke://${activeCluster.name}/${pod.namespace || 'default'}/${pod.name}`
    );

    // Only run simulated container log stream when in offline / client-side mock scenarios
    if (scenarioSelect.value !== 'live-ws' || !wsClient.isConnected) {
      logStreamTimer = setInterval(() => {
        if (
          scene.selectedItem?.type !== 'pod' ||
          scene.selectedItem?.data?.key !== logStreamPodKey
        ) {
          stopPodLogStream();
          return;
        }
        const entry = generateSimulatedLogEntry(scene.selectedItem.data, logStreamSeq++);
        if (Array.isArray(scene.selectedItem.data.logs)) {
          scene.selectedItem.data.logs.push(entry);
          if (scene.selectedItem.data.logs.length > 40) {
            scene.selectedItem.data.logs.shift();
          }
        }
        appendLogLineToInspector(entry);
      }, 1100);
    }

    renderInspector(scene.selectedItem);
  }

  function launchArrowTriage(item, customPrompt = '') {
    const c = getActiveCluster();
    const targetItem =
      item ||
      scene.selectedItem ||
      (c.controllers[0]
        ? { type: 'controller', key: c.controllers[0].key, data: c.controllers[0] }
        : null);

    const payload = synthesizeDecksTriagePayload(targetItem, customPrompt, c);
    activeFallbackPayload = payload;
    if (triageDrawer) {
      triageDrawer.classList.remove('hidden');
    }
    if (triageTitleEl) {
      triageTitleEl.textContent = payload.title;
    }

    const useLiveBackend =
      wsClient.isConnected &&
      (scenarioSelect.value === 'live-ws' ||
        (syntheticCount === 0 && scenarioSelect.value !== 'mega-scale'));

    if (useLiveBackend && sandboxRuntime) {
      sandboxRuntime.clear();
    }

    if (triageStatusEl && triageStatusTextEl) {
      triageStatusEl.hidden = false;
      triageStatusTextEl.textContent = useLiveBackend
        ? '🤖 Connecting to Vertex AI Gemini & GCP MCP via /ws...'
        : 'Gemini 3.8 Flash · Compiling ArrowJS ShadowRoot component...';
    }
    if (triageCancelBtn) {
      triageCancelBtn.hidden = false;
    }

    const reqId = `decks-req-${Date.now()}`;
    activeRequestId = reqId;

    // Send over /ws with gke:// resource URI and active cluster context
    const rawData = targetItem?.data || {};
    const nodeId = rawData.name || c.name || 'cluster';
    const resourceUri = rawData.namespace
      ? `gke://${c.name}/${rawData.namespace}/${nodeId}`
      : `gke://${c.name}/default/${nodeId}`;
    const basePrompt = customPrompt || defaultPromptForItem(targetItem);
    const contextualPrompt =
      rawData.name && !basePrompt.includes(rawData.name)
        ? `${basePrompt} (cluster: ${c.name}, ${targetItem?.type || 'resource'}: ${rawData.namespace ? rawData.namespace + '/' : ''}${rawData.name}, status: ${rawData.status || 'Running'})`
        : !basePrompt.includes(c.name)
          ? `${basePrompt} (cluster: ${c.name})`
          : basePrompt;

    wsClient.sendPrompt(nodeId, resourceUri, contextualPrompt, reqId);

    if (activeSynthesisTimer) {
      clearTimeout(activeSynthesisTimer);
    }
    const timeoutMs = useLiveBackend ? 25000 : 320;
    activeSynthesisTimer = setTimeout(() => {
      if (activeRequestId !== reqId) return;
      if (sandboxRuntime) {
        sandboxRuntime.execute(payload.code, payload.telemetry);
      }
      if (triageStatusEl) {
        triageStatusEl.hidden = true;
      }
      if (triageCancelBtn) {
        triageCancelBtn.hidden = true;
      }
      activeRequestId = null;
    }, timeoutMs);
  }

  function renderInspector(item) {
    if (!item) {
      stopPodLogStream();
      panelEl.classList.add('hidden');
      if (promptChip) promptChip.textContent = 'Cluster Scope';
      return;
    }
    if (item.type !== 'pod' || item.data?.key !== logStreamPodKey) {
      stopPodLogStream();
    }
    panelEl.classList.remove('hidden');
    const c = getActiveCluster();
    if (promptChip) {
      promptChip.textContent = `${item.type}: ${item.data?.name || item.key}`;
    }

    if (item.type === 'pod') {
      const pod = item.data;
      const ctrl = c.controllers.find((ct) => ct.key === pod.controller);
      const nodeObj = (c.nodes || []).find((n) => n.key === pod.nodeKey || n.name === pod.node);
      const ingList = c.ingresses.filter((ig) => (pod.ingresses || []).includes(ig.key));
      const isStreaming = logStreamPodKey === pod.key;

      panelContent.innerHTML = `
        <div class="panel-head">
          <div class="panel-ns">Pod · Deck 3 (Compute Container) · ${escapeHtml(pod.cluster)} / ${escapeHtml(pod.namespace)}</div>
          <h2>${escapeHtml(pod.name)}</h2>
          <span class="state-badge ${escapeHtml(pod.visualClass)}">● ${escapeHtml(pod.status)}</span>
        </div>

        <div class="panel-actions">
          <button class="act-btn primary" data-triage="1">⚡ Synthesize ArrowJS Triage</button>
          ${
            pod.visualClass !== 'running'
              ? `<button class="act-btn" data-remediate="${escapeHtml(pod.key)}" data-pod-idx="${pod._podIdx ?? ''}">🛠️ Remediate / Restart Pod</button>`
              : ''
          }
          ${
            ctrl
              ? `<button class="act-btn" data-jump-type="controller" data-jump-key="${escapeHtml(ctrl.key)}">↑ Workload (${escapeHtml(ctrl.name)})</button>`
              : ''
          }
          ${
            nodeObj
              ? `<button class="act-btn" data-jump-type="node" data-jump-key="${escapeHtml(nodeObj.key)}">⊞ Node (${escapeHtml(nodeObj.name.replace(/^gke-[^-]+-/, ''))})</button>`
              : ''
          }
          <button class="act-btn" data-drill-ns="${escapeHtml(pod.namespace)}">🔍 Scope Deck 3 to ${escapeHtml(pod.namespace)}</button>
        </div>

        <h3>Spatial 3-Deck Lineage</h3>
        <dl class="kv-grid">
          <dt>Deck 1 (Top)</dt>
          <dd>${
            ingList.length
              ? ingList
                  .map(
                    (ig) =>
                      `<button class="jump-link" data-jump-type="ingress" data-jump-key="${escapeHtml(ig.key)}">↑ ${escapeHtml(ig.kind)}/${escapeHtml(ig.name)}</button>`
                  )
                  .join(' ')
              : 'Cluster-internal'
          }</dd>
          <dt>Deck 2 (Mid)</dt>
          <dd>${
            ctrl
              ? `<button class="jump-link" data-jump-type="controller" data-jump-key="${escapeHtml(ctrl.key)}">↑ ${escapeHtml(ctrl.kind)}/${escapeHtml(ctrl.name)}</button>`
              : escapeHtml(pod.controller)
          }</dd>
          <dt>Deck 3 (Bot)</dt>
          <dd>${
            nodeObj
              ? `<button class="jump-link" data-jump-type="node" data-jump-key="${escapeHtml(nodeObj.key)}">⊞ ${escapeHtml(nodeObj.nodePool)}/${escapeHtml(nodeObj.name)}</button>`
              : escapeHtml(pod.node)
          }</dd>
        </dl>

        <h3>Runtime Telemetry</h3>
        <dl class="kv-grid">
          <dt>Reason</dt>
          <dd>${escapeHtml(pod.reason)}</dd>
          <dt>Restarts</dt>
          <dd>${pod.restarts}</dd>
          <dt>CPU Usage</dt>
          <dd>${pod.cpuMillis}m / ${pod.cpuLimitMillis}m</dd>
          <dt>Memory</dt>
          <dd>${pod.memoryMi}Mi / ${pod.memoryLimitMi}Mi</dd>
          <dt>Node Pool</dt>
          <dd>${escapeHtml(pod.nodePool || 'default-pool')}</dd>
          <dt>Pod IP</dt>
          <dd>${escapeHtml(pod.ip)} (${escapeHtml(pod.age)})</dd>
        </dl>

        <div class="log-head-row">
          <h3>Live Container Logs (UTC RFC3339)</h3>
          <button class="stream-btn ${isStreaming ? 'streaming' : ''}" data-stream-logs="1">
            ${isStreaming ? '⏹ Stop Stream' : '▶ Stream Live Logs'}
          </button>
        </div>
        <div class="log-box">
          ${(pod.logs || [])
            .map(
              (l) =>
                `<div class="log-line ${escapeHtml(l.severity)}"><span class="ts">${escapeHtml(l.timestamp.slice(11, 23))}</span>${escapeHtml(l.message)}</div>`
            )
            .join('')}
        </div>
      `;
    } else if (item.type === 'controller') {
      const ctrl = item.data;
      const childPods = getSamplePodsForController(c, ctrl.key, 25);
      const ing = ctrl.ingressKey ? c.ingresses.find((i) => i.key === ctrl.ingressKey) : null;
      const degraded = ctrl.readyReplicas < ctrl.desiredReplicas;
      const repPct =
        ctrl.desiredReplicas > 0
          ? Math.round((ctrl.readyReplicas / ctrl.desiredReplicas) * 100)
          : 100;
      const cpuPct = Math.round(ctrl.cpuPct * 100);
      const memPct = Math.round(ctrl.memPct * 100);
      const isDrilled =
        scene.drillFilter?.type === 'controller' && scene.drillFilter.key === ctrl.key;

      panelContent.innerHTML = `
        <div class="panel-head">
          <div class="panel-ns">${escapeHtml(ctrl.kind)} · Deck 2 (Workloads & Namespaces) · ${escapeHtml(ctrl.namespace)}</div>
          <h2>${escapeHtml(ctrl.name)}</h2>
          <span class="state-badge ${degraded ? 'crashed' : 'running'}">
            ● ${ctrl.readyReplicas}/${ctrl.desiredReplicas} Replicas Ready
          </span>
        </div>

        <div class="panel-actions">
          <button class="act-btn primary" data-triage="1">⚡ Synthesize ArrowJS Triage</button>
          ${
            degraded
              ? `<button class="act-btn" data-remediate="${escapeHtml(ctrl.key)}">🛠️ Rollout Restart ${escapeHtml(ctrl.kind)}</button>`
              : ''
          }
          <button class="act-btn ${isDrilled ? 'primary' : ''}" data-drill-ctrl="${escapeHtml(ctrl.key)}" data-drill-label="${escapeHtml(ctrl.namespace + '/' + ctrl.name)}">
            ${isDrilled ? '✕ Clear Deck 3 Pod Scope' : '🔍 Drill Down Pods on Deck 3'}
          </button>
          ${
            ing
              ? `<button class="act-btn" data-jump-type="ingress" data-jump-key="${escapeHtml(ing.key)}">↑ View Ingress (${escapeHtml(ing.name)})</button>`
              : ''
          }
        </div>

        <h3>3D Pad Bars Breakdown (Back → Front on Pad)</h3>
        <div class="bar-gauge-list">
          <div class="bar-gauge-row">
            <div class="bar-gauge-head">
              <span class="bg-title">Bar 1 (Back/Top) · Ready Replicas</span>
              <span class="bg-val">${ctrl.readyReplicas} / ${ctrl.desiredReplicas} (${repPct}%)</span>
            </div>
            <div class="bar-gauge-track">
              <div class="bar-gauge-fill" style="width:${repPct}%;background:${degraded ? 'var(--crashed)' : 'var(--running)'}"></div>
            </div>
          </div>
          <div class="bar-gauge-row">
            <div class="bar-gauge-head">
              <span class="bg-title">Bar 2 (Middle) · CPU Load</span>
              <span class="bg-val">${ctrl.cpuMillis}m / ${ctrl.cpuCapMillis}m (${cpuPct}%)</span>
            </div>
            <div class="bar-gauge-track">
              <div class="bar-gauge-fill" style="width:${cpuPct}%;background:${cpuPct > 80 ? 'var(--pending)' : '#3d9be0'}"></div>
            </div>
          </div>
          <div class="bar-gauge-row">
            <div class="bar-gauge-head">
              <span class="bg-title">Bar 3 (Front) · Memory Allocation</span>
              <span class="bg-val">${ctrl.memoryMi}Mi / ${ctrl.memoryCapMi}Mi (${memPct}%)</span>
            </div>
            <div class="bar-gauge-track">
              <div class="bar-gauge-fill" style="width:${memPct}%;background:${memPct > 85 ? 'var(--crashed)' : 'var(--transition)'}"></div>
            </div>
          </div>
        </div>

        <h3>Workload Spec</h3>
        <dl class="kv-grid">
          <dt>Kind</dt>
          <dd>${escapeHtml(ctrl.kind)}</dd>
          <dt>Strategy</dt>
          <dd>${escapeHtml(ctrl.strategy)}</dd>
          <dt>Image</dt>
          <dd>${escapeHtml(ctrl.image)}</dd>
        </dl>

        <h3>Managed Pods on Deck 3 (${ctrl.desiredReplicas.toLocaleString()})</h3>
        <div style="display:flex;flex-direction:column;gap:5px;">
          ${childPods
            .map(
              (p) => `
              <button class="jump-link" data-jump-type="pod" data-jump-key="${escapeHtml(p.key)}" style="justify-content:space-between;">
                <span>↓ ${escapeHtml(p.name)}</span>
                <span>${escapeHtml(p.status)} (${p.cpuMillis}m)</span>
              </button>`
            )
            .join('')}
        </div>
      `;
    } else if (item.type === 'node') {
      const node = item.data;
      const scheduledPods = getSamplePodsForNode(c, node.key, node.name, 25);
      const degraded = node.status !== 'Ready' || node.memPct > 0.88;
      const podPct = Math.round(node.podPct * 100);
      const cpuPct = Math.round(node.cpuPct * 100);
      const memPct = Math.round(node.memPct * 100);

      panelContent.innerHTML = `
        <div class="panel-head">
          <div class="panel-ns">GKE Compute Node · Deck 3 (Pool: ${escapeHtml(node.nodePool)}) · ${escapeHtml(node.zone)}</div>
          <h2>${escapeHtml(node.name)}</h2>
          <span class="state-badge ${degraded ? 'crashed' : 'running'}">
            ● ${escapeHtml(node.status)} · ${node.usedPods}/${node.maxPods} Pod Slots
          </span>
        </div>

        <div class="panel-actions">
          <button class="act-btn primary" data-triage="1">⚡ Synthesize ArrowJS Triage</button>
          ${
            degraded
              ? `<button class="act-btn" data-remediate="${escapeHtml(node.key)}">🛠️ Drain & Remediate Crashing Pods</button>`
              : ''
          }
        </div>

        <h3>3D Node Pad Bars Breakdown (Front 3 Bars on Pad)</h3>
        <div class="bar-gauge-list">
          <div class="bar-gauge-row">
            <div class="bar-gauge-head">
              <span class="bg-title">Bar 1 (Top) · Pod Slot Capacity</span>
              <span class="bg-val">${node.usedPods} / ${node.maxPods} pods (${podPct}%)</span>
            </div>
            <div class="bar-gauge-track">
              <div class="bar-gauge-fill" style="width:${podPct}%;background:${podPct > 85 ? 'var(--pending)' : 'var(--running)'}"></div>
            </div>
          </div>
          <div class="bar-gauge-row">
            <div class="bar-gauge-head">
              <span class="bg-title">Bar 2 (Middle) · Node CPU Load</span>
              <span class="bg-val">${node.cpuMillis}m / ${node.cpuCapMillis}m (${cpuPct}%)</span>
            </div>
            <div class="bar-gauge-track">
              <div class="bar-gauge-fill" style="width:${cpuPct}%;background:${cpuPct > 80 ? 'var(--pending)' : '#3d9be0'}"></div>
            </div>
          </div>
          <div class="bar-gauge-row">
            <div class="bar-gauge-head">
              <span class="bg-title">Bar 3 (Front) · Node Memory Pressure</span>
              <span class="bg-val">${node.memoryMi}Mi / ${node.memoryCapMi}Mi (${memPct}%)</span>
            </div>
            <div class="bar-gauge-track">
              <div class="bar-gauge-fill" style="width:${memPct}%;background:${degraded ? 'var(--crashed)' : 'var(--transition)'}"></div>
            </div>
          </div>
        </div>

        <h3>Compute Node Spec</h3>
        <dl class="kv-grid">
          <dt>Node Pool</dt>
          <dd>${escapeHtml(node.nodePool)}</dd>
          <dt>Machine Type</dt>
          <dd>${escapeHtml(node.machineType)}</dd>
          <dt>Zone</dt>
          <dd>${escapeHtml(node.zone)}</dd>
          <dt>Kubelet</dt>
          <dd>${escapeHtml(node.kubeletVersion)}</dd>
        </dl>

        <h3>Pods Packed on This Node Pad (${node.usedPods})</h3>
        <div style="display:flex;flex-direction:column;gap:5px;">
          ${scheduledPods
            .map(
              (p) => `
              <button class="jump-link" data-jump-type="pod" data-jump-key="${escapeHtml(p.key)}" style="justify-content:space-between;">
                <span>⊞ ${escapeHtml(p.namespace)}/${escapeHtml(p.name)}</span>
                <span>${escapeHtml(p.status)} (${p.cpuMillis}m)</span>
              </button>`
            )
            .join('')}
        </div>
      `;
    } else if (item.type === 'ingress') {
      const ing = item.data;
      const targetPods = c.pods.filter((p) => (p.ingresses || []).includes(ing.key)).slice(0, 20);
      const degraded = ing.errPct > 0 || ing.healthyBackends < ing.totalBackends;

      panelContent.innerHTML = `
        <div class="panel-head">
          <div class="panel-ns">${escapeHtml(ing.kind)} · Deck 1 (Top Ingress) · ${escapeHtml(ing.namespace)}</div>
          <h2>${escapeHtml(ing.name)}</h2>
          <span class="state-badge ${degraded ? 'crashed' : 'running'}">
            ● ${ing.healthyBackends}/${ing.totalBackends} Healthy Backends · ${ing.rps} RPS
          </span>
        </div>

        <div class="panel-actions">
          <button class="act-btn primary" data-triage="1">⚡ Synthesize ArrowJS Triage</button>
          ${
            degraded
              ? `<button class="act-btn" data-remediate="${escapeHtml(ing.key)}">🛠️ Heal Upstream Backends</button>`
              : ''
          }
          ${
            ing.controllers?.[0]
              ? `<button class="act-btn" data-jump-type="controller" data-jump-key="${escapeHtml(ing.controllers[0])}">↓ Target Workload</button>`
              : ''
          }
        </div>

        <h3>North-South / Mesh Routing</h3>
        <dl class="kv-grid">
          <dt>Gateway</dt>
          <dd>${escapeHtml(ing.gatewayName)}</dd>
          <dt>Service</dt>
          <dd>${escapeHtml(ing.serviceName)}</dd>
          <dt>VIP</dt>
          <dd>${escapeHtml(ing.vip)}</dd>
          <dt>Traffic Rate</dt>
          <dd>${ing.rps} req/s</dd>
          <dt>5xx Error Rate</dt>
          <dd>${ing.errPct}% (p99: ${ing.p99Ms}ms)</dd>
        </dl>

        <h3>Routed Backend Pods (${targetPods.length})</h3>
        <div style="display:flex;flex-direction:column;gap:5px;">
          ${targetPods
            .map(
              (p) => `
              <button class="jump-link" data-jump-type="pod" data-jump-key="${escapeHtml(p.key)}" style="justify-content:space-between;">
                <span>↓ ${escapeHtml(p.name)}</span>
                <span>${escapeHtml(p.status)}</span>
              </button>`
            )
            .join('')}
        </div>
      `;
    }

    panelContent.querySelectorAll('[data-triage]').forEach((btn) => {
      btn.addEventListener('click', () => {
        launchArrowTriage(item, promptInput?.value || '');
      });
    });

    panelContent.querySelectorAll('[data-stream-logs]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (item.type === 'pod') {
          togglePodLogStream(item.data);
        }
      });
    });

    // Wire cross-deck jump buttons, drill-down buttons, and remediation inside inspector
    panelContent.querySelectorAll('[data-jump-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.jumpType;
        const key = btn.dataset.jumpKey;
        if (type === 'ingress' && scene.layoutMode === '2-deck') {
          setLayoutModeUI('3-deck');
        } else if (type === 'node' && scene.bottomMode !== 'nodes') {
          setBottomModeUI('nodes');
        }
        scene.focusByKey(type, key);
      });
    });

    panelContent.querySelectorAll('[data-drill-ctrl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ctrlKey = btn.dataset.drillCtrl;
        const label = btn.dataset.drillLabel || ctrlKey;
        if (scene.drillFilter?.type === 'controller' && scene.drillFilter.key === ctrlKey) {
          scene.setDrillFilter(null);
        } else {
          scene.setDrillFilter({
            type: 'controller',
            key: ctrlKey,
            label: `Workload: ${label}`,
          });
        }
        renderInspector(item);
      });
    });

    panelContent.querySelectorAll('[data-drill-ns]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nsName = btn.dataset.drillNs;
        scene.setDrillFilter({
          type: 'namespace',
          key: nsName,
          label: `Namespace: ${nsName}`,
        });
      });
    });

    panelContent.querySelectorAll('[data-remediate]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetKey = btn.dataset.remediate;
        const healed = remediateTarget(c, targetKey);
        pushFeedEvent({
          seq: eventSeq++,
          time: new Date().toISOString().slice(11, 23),
          kind: 'Healed',
          badgeClass: 'ev-woke',
          glyph: '✓',
          cluster: c.name,
          namespace: targetKey.split('/')[0],
          podKey: item.type === 'pod' ? item.key : null,
          podName: targetKey,
          summary: `Remediated ${healed} pod(s) for ${targetKey} — status is now Running`,
        });
        syncSceneFromState(false);
        if (item.type === 'pod' && item.data?.podIdx !== undefined) {
          item.data = materializePodAt(c, item.data.podIdx);
        }
        renderInspector(item);
      });
    });
  }

  function pushFeedEvent(ev) {
    if (!ev) return;
    const row = document.createElement('button');
    row.className = 'feed-row';
    row.innerHTML = `
      <span class="ev-badge ${escapeHtml(ev.badgeClass)}">${escapeHtml(ev.glyph)}</span>
      <div class="feed-body">
        <div class="feed-top">
          <span class="feed-pod">${escapeHtml(ev.podName)}</span>
          <span class="feed-time">${escapeHtml(ev.time)}</span>
        </div>
        <div class="feed-desc">[${escapeHtml(ev.cluster)}/${escapeHtml(ev.namespace)}] ${escapeHtml(ev.summary)}</div>
      </div>
    `;
    row.addEventListener('click', () => {
      if (scene.viewMode === 'fleet' || activeClusterName !== ev.cluster) {
        activeClusterName = ev.cluster;
        scene.viewMode = 'cluster';
        syncSceneFromState(false);
      }
      if (ev.podKey) {
        scene.focusByKey('pod', ev.podKey);
      } else if (ev.controllerKey) {
        scene.focusByKey('controller', ev.controllerKey);
      }
    });
    feedList.prepend(row);
    while (feedList.children.length > 45) {
      feedList.removeChild(feedList.lastChild);
    }
  }

  function seedInitialEvents() {
    feedList.innerHTML = '';
    const c = getActiveCluster();
    for (let i = 0; i < 6; i++) {
      pushFeedEvent(nextMockEvent(c, eventSeq++));
    }
  }

  function setLayoutModeUI(mode) {
    document.querySelectorAll('#layout button').forEach((b) => {
      b.classList.toggle('active', b.dataset.layout === mode);
    });
    scene.setLayoutMode(mode);
    updateStatusBar();
  }

  function setBottomModeUI(mode) {
    const normalized = mode === 'nodes' ? 'nodes' : 'namespaces';
    document.querySelectorAll('#bottom-mode button').forEach((b) => {
      b.classList.toggle('active', b.dataset.bottom === normalized);
    });
    scene.setBottomMode(normalized);
    updateStatusBar();
  }

  function setSoloUI(soloId) {
    document.querySelectorAll('#soloctl button').forEach((b) => {
      const active = soloId ? b.dataset.solo === soloId : b.dataset.solo === 'all';
      b.classList.toggle('active', active);
    });
  }

  // Topbar event bindings
  fleetBtn.addEventListener('click', () => {
    const nextMode = scene.viewMode === 'fleet' ? 'cluster' : 'fleet';
    scene.setViewMode(nextMode, activeClusterName);
    updateLegendCounts();
    updateStatusBar();
  });

  clusterSelect.addEventListener('change', () => {
    diveIntoCluster(clusterSelect.value);
  });

  scenarioSelect.addEventListener('change', () => {
    const val = scenarioSelect.value;
    if (val === 'live-ws') {
      wsClient.sendSetMode('live');
      if (liveWsTopology) {
        fleet = adaptLiveTopologyToFleet(liveWsTopology);
        connText.textContent = fleet.mode || 'live';
      } else {
        connText.textContent = 'syncing live...';
      }
    } else {
      fleet = buildMockFleet({ scenario: val, synthetic: syntheticCount });
      connText.textContent = 'mock';
    }
    scene.setDrillFilter(null);
    panelEl.classList.add('hidden');
    syncSceneFromState(true);
    seedInitialEvents();
  });

  document.querySelectorAll('.legend .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const st = chip.dataset.state;
      const next = scene.filterState === st ? null : st;
      document.querySelectorAll('.legend .chip').forEach((c) => {
        c.classList.toggle('active', c.dataset.state === next);
      });
      scene.setFilter({ state: next });
    });
  });

  nsSelect.addEventListener('change', () => {
    scene.setFilter({ namespace: nsSelect.value });
  });

  searchInput.addEventListener('input', () => {
    scene.setFilter({ search: searchInput.value });
  });

  document.querySelectorAll('#layout button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (scene.viewMode === 'fleet') {
        scene.viewMode = 'cluster';
      }
      setLayoutModeUI(btn.dataset.layout);
    });
  });

  document.querySelectorAll('#bottom-mode button').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (scene.viewMode === 'fleet') {
        scene.viewMode = 'cluster';
      }
      setBottomModeUI(btn.dataset.bottom);
    });
  });

  deckLinkBtn.addEventListener('click', () => {
    scene.decksLinked = !scene.decksLinked;
    deckLinkBtn.classList.toggle('active', scene.decksLinked);
  });

  deckResetBtn.addEventListener('click', () => {
    scene.resetDeckOffsets();
  });

  document.querySelectorAll('#beams button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document
        .querySelectorAll('#beams button')
        .forEach((b) => b.classList.toggle('active', b === btn));
      scene.setBeamsMode(btn.dataset.beams);
    });
  });

  document.querySelectorAll('#soloctl button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.solo === 'all' ? null : btn.dataset.solo;
      if (target === 'ingress' && scene.layoutMode === '2-deck') {
        setLayoutModeUI('3-deck');
      }
      scene.soloDeck = null;
      const activeSolo = target ? scene.setSoloDeck(target) : scene.setSoloDeck(null);
      setSoloUI(activeSolo);
    });
  });

  document.querySelectorAll('#labelmode button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document
        .querySelectorAll('#labelmode button')
        .forEach((b) => b.classList.toggle('active', b === btn));
      scene.setLabelsMode(btn.dataset.mode);
    });
  });

  document.getElementById('home').addEventListener('click', () => scene.homeCamera());
  document.getElementById('zoom-in').addEventListener('click', () => scene.zoomBy(0.8));
  document.getElementById('zoom-out').addEventListener('click', () => scene.zoomBy(1.25));
  document.getElementById('panel-close').addEventListener('click', () => {
    stopPodLogStream();
    panelEl.classList.add('hidden');
    scene.selectedItem = null;
    scene.rebuildBeams();
    if (promptChip) promptChip.textContent = 'Cluster Scope';
  });

  if (promptForm) {
    promptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      launchArrowTriage(scene.selectedItem, promptInput?.value || '');
      if (promptInput) promptInput.value = '';
    });
  }

  if (triageCancelBtn) {
    triageCancelBtn.addEventListener('click', () => {
      if (activeRequestId) {
        wsClient.sendCancel(activeRequestId);
        activeRequestId = null;
      }
      if (activeSynthesisTimer) {
        clearTimeout(activeSynthesisTimer);
        activeSynthesisTimer = null;
      }
      if (triageStatusEl && triageStatusTextEl) {
        triageStatusTextEl.textContent = 'Synthesis turn cancelled by user.';
      }
      triageCancelBtn.hidden = true;
    });
  }

  if (triageCloseBtn && triageDrawer) {
    triageCloseBtn.addEventListener('click', () => {
      triageDrawer.classList.add('hidden');
    });
  }

  // Listen for custom events bubbling out of the isolated ArrowSandboxRuntime ShadowRoot
  window.addEventListener('ephemeris-remediated', (e) => {
    const detail = e.detail || {};
    const c = getActiveCluster();
    const targetKey =
      detail.targetKey ||
      (detail.namespace && detail.podId
        ? `${detail.namespace}/${detail.podId}`
        : detail.namespace && detail.controller
          ? `${detail.namespace}/${detail.controller}`
          : detail.node || detail.gateway || scene.selectedItem?.key);
    if (!targetKey) return;
    const healed = remediateTarget(c, targetKey);
    wsClient.sendRemediate(detail.podId || targetKey, detail.action || 'remediate');
    pushFeedEvent({
      seq: eventSeq++,
      time: new Date().toISOString().slice(11, 23),
      kind: 'Healed',
      badgeClass: 'ev-woke',
      glyph: '⚡',
      cluster: c.name,
      namespace: detail.namespace || targetKey.split('/')[0] || 'default',
      podKey: scene.selectedItem?.type === 'pod' ? scene.selectedItem.key : null,
      podName: targetKey,
      summary: `ArrowJS Triage remediated ${Math.max(1, healed)} pod(s) for ${targetKey} -> Running`,
    });
    syncSceneFromState(false);
    if (scene.selectedItem) {
      if (scene.selectedItem.type === 'pod' && scene.selectedItem.data?._podIdx !== undefined) {
        scene.selectedItem.data = materializePodAt(c, scene.selectedItem.data._podIdx);
      }
      renderInspector(scene.selectedItem);
    }
  });

  window.addEventListener('ephemeris-traffic-drain', (e) => {
    const detail = e.detail || {};
    const c = getActiveCluster();
    const gwName = detail.gateway || detail.targetKey || 'ingress';
    pushFeedEvent({
      seq: eventSeq++,
      time: new Date().toISOString().slice(11, 23),
      kind: 'TrafficSplit',
      badgeClass: 'ev-task',
      glyph: '⇄',
      cluster: c.name,
      namespace: 'gateway-system',
      podName: gwName,
      summary: `ArrowJS shifted 100% traffic to stable backend on ${gwName} (0% canary leakage)`,
    });
  });

  window.addEventListener('ephemeris-select-pod', (e) => {
    const detail = e.detail || {};
    if (
      detail.clusterName &&
      detail.clusterName !== activeClusterName &&
      fleet.clusters.some((cl) => cl.name === detail.clusterName)
    ) {
      diveIntoCluster(detail.clusterName);
    }
    if (detail.type === 'drill-controller' && detail.key) {
      scene.setDrillFilter({
        type: 'controller',
        key: detail.key,
        label: `Workload: ${detail.label || detail.key}`,
      });
      return;
    }
    const rawKey = detail.key || detail.podId || '';
    if (rawKey.startsWith('ctrl:')) {
      scene.focusByKey('controller', rawKey.slice(5));
    } else if (rawKey.startsWith('node:')) {
      if (scene.bottomMode !== 'nodes') setBottomModeUI('nodes');
      scene.focusByKey('node', rawKey.slice(5));
    } else if (detail.type && detail.key) {
      if (detail.type === 'node' && scene.bottomMode !== 'nodes') {
        setBottomModeUI('nodes');
      }
      scene.focusByKey(detail.type, detail.key);
    } else if (rawKey) {
      const c = getActiveCluster();
      const matchPod = (c.pods || []).find(
        (p) =>
          p.key === rawKey ||
          p.name === rawKey ||
          (detail.namespace && p.key === `${detail.namespace}/${rawKey}`)
      );
      if (matchPod) {
        scene.focusByKey('pod', matchPod.key);
      }
    }
  });

  window.addEventListener('ephemeris-focus-resource', (e) => {
    const detail = e.detail || {};
    if (
      detail.clusterName &&
      detail.clusterName !== activeClusterName &&
      fleet.clusters.some((cl) => cl.name === detail.clusterName)
    ) {
      diveIntoCluster(detail.clusterName);
    }
    const c = getActiveCluster();
    const resName = detail.resourceName || detail.name || '';
    const ns = detail.namespace || '';
    const ing = (c.ingresses || []).find(
      (ig) => ig.name === resName || ig.key === `${ns}/${resName}` || ig.key === resName
    );
    if (ing) {
      scene.focusByKey('ingress', ing.key);
      return;
    }
    const ctrl = (c.controllers || []).find(
      (ct) => ct.name === resName || ct.key === `${ns}/${resName}` || ct.key === resName
    );
    if (ctrl) {
      scene.focusByKey('controller', ctrl.key);
    }
  });

  feedPauseBtn.addEventListener('click', () => {
    feedPaused = !feedPaused;
    feedPauseBtn.textContent = feedPaused ? '▶' : '⏸';
    document.getElementById('feed-rate').textContent = feedPaused ? 'paused' : 'live stream';
  });

  feedToggleBtn.addEventListener('click', () => {
    const collapsed = feedPanel.classList.toggle('collapsed');
    feedToggleBtn.textContent = collapsed ? '›' : '‹';
  });

  helpEl.addEventListener('click', () => helpEl.classList.add('hidden'));

  // Keyboard shortcuts (0, 1, 2, 3, 4, b, r, h, /, e, ?, Esc)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      searchInput.focus();
    } else if (e.key === '0') {
      fleetBtn.click();
    } else if (e.key === '1') {
      document.querySelector('#soloctl button[data-solo="ingress"]')?.click();
    } else if (e.key === '2') {
      document.querySelector('#soloctl button[data-solo="pods"]')?.click();
    } else if (e.key === '3') {
      document.querySelector('#soloctl button[data-solo="controllers"]')?.click();
    } else if (e.key === '4') {
      document.querySelector('#soloctl button[data-solo="all"]')?.click();
    } else if (e.key === 'b' || e.key === 'B') {
      setBottomModeUI(scene.bottomMode === 'nodes' ? 'namespaces' : 'nodes');
    } else if (e.key === 'r' || e.key === 'R') {
      scene.resetDeckOffsets();
    } else if (e.key === 'h' || e.key === 'Home') {
      scene.homeCamera();
    } else if (e.key === 'e' || e.key === 'E') {
      feedToggleBtn.click();
    } else if (e.key === '?') {
      helpEl.classList.toggle('hidden');
    } else if (e.key === 'Escape') {
      helpEl.classList.add('hidden');
      stopPodLogStream();
      panelEl.classList.add('hidden');
      if (triageDrawer) triageDrawer.classList.add('hidden');
      scene.selectedItem = null;
      scene.rebuildBeams();
    }
  });

  // Live simulated event stream + UTC clock
  setInterval(() => {
    clockEl.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }, 1000);
  clockEl.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  setInterval(() => {
    if (feedPaused) return;
    const c = getActiveCluster();
    pushFeedEvent(nextMockEvent(c, eventSeq++));
  }, 3200);

  // Connect WebSocketClient for live topology sync, Vertex AI ArrowJS synthesis, and live pod log streaming
  wsClient.onTopology = (topology) => {
    if (!topology) return;
    liveWsTopology = topology;
    if (!params.has('scenario') && topology.mode === 'live' && scenarioSelect.value !== 'live-ws') {
      scenarioSelect.value = 'live-ws';
    }
    if (scenarioSelect.value === 'live-ws') {
      fleet = adaptLiveTopologyToFleet(liveWsTopology);
      connText.textContent = fleet.mode || 'live';
      syncSceneFromState(true);
      seedInitialEvents();
    }
  };

  wsClient.onStatus = (statusMsg, requestId) => {
    if (requestId && activeRequestId && requestId !== activeRequestId) return;
    if (triageStatusEl && triageStatusTextEl && statusMsg) {
      triageStatusEl.hidden = false;
      triageStatusTextEl.textContent = statusMsg;
    }
  };

  wsClient.onUIComponent = (uiData, requestId) => {
    const reqId = requestId || uiData?.request_id;
    if (reqId && activeRequestId && reqId !== activeRequestId) return;
    const code = typeof uiData === 'string' ? uiData : uiData?.code;
    const telemetry = typeof uiData === 'object' ? uiData?.telemetry : {};
    if (activeSynthesisTimer) {
      clearTimeout(activeSynthesisTimer);
      activeSynthesisTimer = null;
    }
    if (triageTitleEl && typeof uiData === 'object' && uiData?.archetype) {
      const targetLabel =
        uiData.target_pod ||
        uiData.target_cluster ||
        uiData.target_namespace ||
        getActiveCluster().name;
      triageTitleEl.textContent = `Vertex AI · ${uiData.archetype} · ${targetLabel}`;
    }
    if (sandboxRuntime && code) {
      const res = sandboxRuntime.execute(code, telemetry || {});
      if (!res.success && activeFallbackPayload) {
        sandboxRuntime.execute(activeFallbackPayload.code, activeFallbackPayload.telemetry);
      }
    }
    if (triageStatusEl) triageStatusEl.hidden = true;
    if (triageCancelBtn) triageCancelBtn.hidden = true;
    activeRequestId = null;
  };

  wsClient.onError = (errMsg) => {
    if (!activeRequestId) return;
    if (activeSynthesisTimer) {
      clearTimeout(activeSynthesisTimer);
      activeSynthesisTimer = null;
    }
    if (sandboxRuntime && activeFallbackPayload) {
      sandboxRuntime.execute(activeFallbackPayload.code, activeFallbackPayload.telemetry);
    }
    if (triageStatusEl && triageStatusTextEl) {
      triageStatusTextEl.textContent = `Backend fallback: ${errMsg?.message || 'error'}`;
      setTimeout(() => {
        if (triageStatusEl) triageStatusEl.hidden = true;
      }, 2500);
    }
    if (triageCancelBtn) triageCancelBtn.hidden = true;
    activeRequestId = null;
  };

  wsClient.onTelemetry = (telemetry) => {
    const entries = telemetry?.logs;
    if (!Array.isArray(entries) || entries.length === 0) return;
    if (scene.selectedItem?.type === 'pod') {
      scene.selectedItem.data.logs = entries;
      const logBox = panelContent.querySelector('.log-box');
      if (logBox) {
        logBox.innerHTML = '';
        for (const entry of entries) {
          appendLogLineToInspector(entry);
        }
      }
    }
  };

  wsClient.onLogStream = (logStreamPayload) => {
    const podId = logStreamPayload?.pod_id;
    const entries = logStreamPayload?.entries;
    if (!logStreamPodKey || !Array.isArray(entries)) return;
    if (scene.selectedItem?.type === 'pod' && scene.selectedItem?.data?.name === podId) {
      for (const entry of entries) {
        appendLogLineToInspector(entry);
      }
    }
  };

  try {
    wsClient.connect();
  } catch {
    /* standalone mode without backend ws */
  }

  populateScenarioSelect();
  setLayoutModeUI(initialLayout);
  syncSceneFromState(true);
  seedInitialEvents();
}

initDecksApp();
