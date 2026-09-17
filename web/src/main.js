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

import { SceneManager } from './canvas/scene.js';
import { TopologyMesh } from './canvas/topology.js';
import { CameraControls } from './canvas/controls.js';
import { HUDOverlay } from './ui/hud.js';
import { IncidentPanel } from './sandbox/panel.js';
import { WebSocketClient } from './ws/client.js';

export function initializeApp() {
  const appContainer = document.getElementById('app');
  const canvasContainer = document.getElementById('canvas-container');
  const hudContainer = document.getElementById('hud-container');
  const panelContainer = document.getElementById('panel-container');

  if (!appContainer || !canvasContainer || !hudContainer || !panelContainer) {
    return false;
  }

  // 1. Initialize Three.js 3D spatial canvas
  const sceneManager = new SceneManager(canvasContainer);
  const topologyMesh = new TopologyMesh(sceneManager.scene);
  const controls = new CameraControls(
    sceneManager.camera,
    sceneManager.renderer,
    sceneManager.scene,
    () => topologyMesh.getInteractiveObjects()
  );

  // Hook animation updates into the render loop
  sceneManager.addUpdateListener((time) => {
    topologyMesh.update(time);
    controls.update(time);
  });
  sceneManager.start();

  // 2. Initialize UI HUD and Floating Incident Panel
  const hud = new HUDOverlay(hudContainer);
  const panel = new IncidentPanel(panelContainer);

  // 3. Initialize WebSocket client
  const ws = new WebSocketClient();
  let promptStartTime = null;

  // 4. Wire 3D Scene Selection -> HUD, WebSocket & Dedicated Object Chat Window
  controls.onSelectNode = (pod, meta) => {
    const resourceUri = pod.resource_uri || `gke://${meta.namespaceName || 'default'}/${pod.name}`;
    topologyMesh.clearFilterHighlight();
    hud.setSelectedPod(pod, meta);
    ws.selectNode(pod.id, resourceUri);
    topologyMesh.setSelectedPod(pod.name || pod.id);
    topologyMesh.highlightBlastRadius(pod.name || pod.id);
    panel.openObjectInspector(pod, meta);
  };

  // Wire Dedicated Object Chat Window prompt submission
  panel.onObjectPromptSubmit = (promptText, pod, meta) => {
    const podName = pod?.name || pod?.id || 'payment-service';
    const nsName = meta?.namespaceName || pod?.namespace || 'default';
    const resourceUri = pod?.resource_uri || `gke://${nsName}/${podName}`;
    promptStartTime = performance.now();
    hud.setStatusMessage(`Asking @${podName}: "${promptText}"...`, true);
    panel.showStreamingProgress(`Synthesizing response for @${podName}...`, podName);
    ws.sendPrompt(pod?.id || podName, resourceUri, promptText);
  };

  hud.onClearSelection = () => {
    topologyMesh.clearSelectedPod();
    topologyMesh.clearBlastRadius();
    topologyMesh.clearFilterHighlight();
    hud.setStatusMessage(
      'Detached resource context. Prompt is now scoped to cluster-wide mesh.',
      false
    );
  };

  hud.onResetView = () => {
    controls.resetView();
    hud.setSelectedPod(null);
    topologyMesh.clearSelectedPod();
    topologyMesh.clearBlastRadius();
    const select = document.getElementById('hud-cluster-select');
    if (select) {
      select.value = '__overview__';
      hud.onClusterSelect('__overview__', true);
    }
  };

  hud.onScenarioSelect = (scenarioId) => {
    promptStartTime = performance.now();
    hud.setStatusMessage(`Applying scenario "${scenarioId}" across multi-cluster fleet...`, true);
    ws.sendScenario(scenarioId);
  };

  const onScenarioSelectEvent = (e) => {
    const scenarioId = e.detail && e.detail.scenarioId;
    if (scenarioId) {
      hud.setScenario(scenarioId);
      hud.onScenarioSelect(scenarioId);
    }
  };
  document.addEventListener('ephemeris-scenario-select', onScenarioSelectEvent);
  window.addEventListener('ephemeris-scenario-select', onScenarioSelectEvent);

  hud.onResetIncident = () => {
    panel.hide();
    hud.setSelectedPod(null);
    topologyMesh.clearSelectedPod();
    topologyMesh.clearBlastRadius();
    controls.resetView();
    hud.setScenario('default');
    ws.sendScenario('default');
    hud.setStatusMessage(
      'Demo incident reset: baseline payment-service CrashLoopBackOff scenario restored.',
      false
    );
  };

  // Wire Camera Mode toggle (Orbit vs Pan)
  hud.onCameraModeChange = (mode) => {
    controls.setNavMode(mode);
    hud.setStatusMessage(
      mode === 'pan'
        ? 'Pan mode active: Left-click and drag to move camera focus across the spatial mesh.'
        : 'Orbit mode active: Left-click and drag to rotate view around target.',
      false
    );
  };

  let currentTopologyData = null;

  // Resolve target pod from prompt text, looking for issues or specific pod names
  const findTargetPodFromPrompt = (promptText, activePod, topologyData) => {
    if (!topologyData || !topologyData.clusters) return null;
    const text = (promptText || '').toLowerCase();
    const cleanText = text.replace(/[-_]/g, ' ');

    // 1. Check for specific pod or service name mentioned in the prompt (with hyphen/space normalization)
    for (const cluster of topologyData.clusters) {
      for (const ns of cluster.namespaces || []) {
        for (const p of ns.pods || []) {
          const pName = (p.name || '').toLowerCase();
          const cleanPName = pName.replace(/[-_]/g, ' ');
          const pId = (p.id || '').toLowerCase();
          const cleanPId = pId.replace(/[-_]/g, ' ');

          if (
            text.includes(pName) ||
            cleanText.includes(cleanPName) ||
            (pId && (text.includes(pId) || cleanText.includes(cleanPId)))
          ) {
            return { pod: p, meta: { namespaceName: ns.name, clusterName: cluster.name } };
          }
        }
      }
    }

    // 2. If a pod is currently selected in the HUD, use it unless a different pod name was explicitly matched above
    if (activePod) {
      return { pod: activePod, meta: hud.selectedMeta };
    }

    // 3. If no pod is currently active, check if prompt asks for issues/crashes or fallback to first failing pod
    const issueKeywords = [
      'issue',
      'error',
      'crash',
      'fail',
      'broken',
      'triage',
      'fix',
      'rollback',
      'panic',
      'oom',
      'blast',
      'why',
      'what',
      'status',
      'help',
    ];
    const isAskingAboutIssues = issueKeywords.some((k) => text.includes(k));

    if (isAskingAboutIssues || !activePod) {
      // First priority: CrashLoopBackOff or Failed across all clusters
      for (const cluster of topologyData.clusters) {
        for (const ns of cluster.namespaces || []) {
          const crashPod = (ns.pods || []).find(
            (p) => p.status === 'CrashLoopBackOff' || p.status === 'Failed'
          );
          if (crashPod) {
            return { pod: crashPod, meta: { namespaceName: ns.name, clusterName: cluster.name } };
          }
        }
      }

      // Second priority: Pending pods
      for (const cluster of topologyData.clusters) {
        for (const ns of cluster.namespaces || []) {
          const pendingPod = (ns.pods || []).find((p) => p.status === 'Pending');
          if (pendingPod) {
            return { pod: pendingPod, meta: { namespaceName: ns.name, clusterName: cluster.name } };
          }
        }
      }
    }

    // Fallback: first available pod
    const firstCluster = topologyData.clusters[0];
    if (firstCluster?.namespaces?.[0]?.pods?.[0]) {
      return {
        pod: firstCluster.namespaces[0].pods[0],
        meta: { namespaceName: firstCluster.namespaces[0].name, clusterName: firstCluster.name },
      };
    }

    return null;
  };

  // Wire Cluster Switcher -> Smooth 3D Navigation
  hud.onClusterSelect = (clusterName, skipCameraFocus = false) => {
    if (!currentTopologyData || !currentTopologyData.clusters) return;

    if (clusterName === '__overview__') {
      if (!skipCameraFocus) {
        controls.resetView();
      }
      topologyMesh.clearBlastRadius();
      let running = 0;
      let crash = 0;
      let pending = 0;
      currentTopologyData.clusters.forEach((c) => {
        (c.namespaces || []).forEach((ns) => {
          (ns.pods || []).forEach((p) => {
            if (p.status === 'Running') running++;
            else if (p.status === 'CrashLoopBackOff' || p.status === 'Failed') crash++;
            else if (p.status === 'Pending') pending++;
          });
        });
      });

      hud.setPodStats(running, crash, pending);
      hud.setClusterInfo('Multi-Cluster Mesh', `${currentTopologyData.clusters.length} Clusters`);
      hud.setStatusMessage('Viewing multi-cluster topology mesh overview.', false);
      return;
    }

    const cluster = currentTopologyData.clusters.find((c) => c.name === clusterName);
    if (!cluster) return;

    if (!skipCameraFocus) {
      const pos = topologyMesh.getClusterPosition(clusterName);
      if (pos) {
        controls.focusOnCluster(pos);
      }
    }

    let running = 0;
    let crash = 0;
    let pending = 0;
    (cluster.namespaces || []).forEach((ns) => {
      (ns.pods || []).forEach((p) => {
        if (p.status === 'Running') running++;
        else if (p.status === 'CrashLoopBackOff' || p.status === 'Failed') crash++;
        else if (p.status === 'Pending') pending++;
      });
    });

    hud.setPodStats(running, crash, pending);
    hud.setClusterInfo(cluster.name, cluster.location || 'global');
    hud.setStatusMessage(
      `Viewing cluster ${cluster.name} [${cluster.location || 'global'}].`,
      false
    );
  };

  // Wire Live Remediation Event (dispatched from ArrowJS sandbox) -> 3D Mesh & Backend
  const onRemediate = (e) => {
    if (e.detail && e.detail.podId) {
      const podId = e.detail.podId;
      const newStatus = e.detail.status || 'Running';
      const action = e.detail.action || 'rollback';
      ws.sendRemediate(podId, action);
      topologyMesh.remediatePod(podId, newStatus);
      if (panel.statusBadge) {
        panel.statusBadge.textContent = newStatus;
        panel.statusBadge.className = `panel-status-pill status-${newStatus.toLowerCase()}`;
      }
      hud.setStatusMessage(
        `Remediation verified: ${podId} is now ${newStatus}. Spatial mesh updated.`,
        false
      );

      // Update selected pod in HUD cockpit if it matches
      if (
        hud.selectedPod &&
        (hud.selectedPod.id === podId ||
          hud.selectedPod.name === podId ||
          podId.includes(hud.selectedPod.name) ||
          (hud.selectedPod.id && hud.selectedPod.id.includes(podId)))
      ) {
        hud.selectedPod.status = newStatus;
        hud.setSelectedPod(hud.selectedPod, hud.selectedMeta);
      }

      // Update cluster stats
      if (currentTopologyData && currentTopologyData.clusters) {
        currentTopologyData.clusters.forEach((c) => {
          (c.namespaces || []).forEach((ns) => {
            (ns.pods || []).forEach((p) => {
              if (
                p.name === podId ||
                p.id === podId ||
                podId.includes(p.name) ||
                (p.id && podId.includes(p.id))
              ) {
                p.status = newStatus;
              }
            });
          });
        });
        const select = document.getElementById('hud-cluster-select');
        const activeClusterName = select ? select.value : currentTopologyData.clusters[0]?.name;
        hud.setClusters(currentTopologyData.clusters, activeClusterName);
        if (activeClusterName) {
          hud.onClusterSelect(activeClusterName, true);
        }
      }
    }
  };

  document.addEventListener('ephemeris-remediated', onRemediate);
  window.addEventListener('ephemeris-remediated', onRemediate);

  // Wire Live Traffic Drain Event (dispatched from ArrowJS sandbox) -> 3D Mesh
  const onTrafficDrain = (e) => {
    if (e.detail && e.detail.podId) {
      const podId = e.detail.podId;
      const percent = parseInt(e.detail.percent, 10);
      topologyMesh.setTrafficDrain(podId, percent);
      hud.setStatusMessage(`Traffic drained to ${percent}% on ${podId}. Conduits adjusted.`, false);
    }
  };

  document.addEventListener('ephemeris-traffic-drain', onTrafficDrain);
  window.addEventListener('ephemeris-traffic-drain', onTrafficDrain);

  // Wire Bi-Directional 3D Spatial Co-Pilot Events from ArrowJS UI
  const onSelectPodFromUI = (e) => {
    const detail = e.detail || {};
    const podId = detail.podId;
    if (!podId) return;

    topologyMesh.clearFilterHighlight();

    // Find matching pod object in topology data
    let foundPod = null;
    let foundMeta = {
      clusterName: detail.clusterName || 'production-us-central1',
      namespaceName: detail.namespaceName || 'default',
    };
    if (currentTopologyData && currentTopologyData.clusters) {
      for (const c of currentTopologyData.clusters) {
        for (const ns of c.namespaces || []) {
          for (const p of ns.pods || []) {
            if (p.name === podId || p.id === podId) {
              foundPod = p;
              foundMeta = { clusterName: c.name, namespaceName: ns.name };
              break;
            }
          }
        }
      }
    }

    let targetMesh = topologyMesh.podMap.get(podId);
    if (!targetMesh) {
      for (const [k, m] of topologyMesh.podMap.entries()) {
        if (typeof k === 'string' && (k.includes(podId) || podId.includes(k))) {
          targetMesh = m;
          break;
        }
      }
    }

    if (targetMesh) {
      controls.focusOnMesh(targetMesh);
    }
    topologyMesh.setSelectedPod(podId);
    if (foundPod) {
      hud.setSelectedPod(foundPod, foundMeta);
    }
    hud.setStatusMessage(`Focused 3D camera on workload ${podId}.`, false);
  };

  document.addEventListener('ephemeris-select-pod', onSelectPodFromUI);
  window.addEventListener('ephemeris-select-pod', onSelectPodFromUI);

  const onPromptQueryFromUI = (e) => {
    const detail = e.detail || {};
    const promptText = detail.prompt;
    if (!promptText) return;
    const podId = detail.podId || (hud.selectedPod && hud.selectedPod.name) || 'payment-service';
    const resourceUri = detail.resourceUri || `gke://default/${podId}`;

    promptStartTime = performance.now();
    hud.setStatusMessage(`Synthesizing view for ${podId}: "${promptText}"...`, true);
    panel.showStreamingProgress(`Synthesizing view for @${podId}...`, podId);
    ws.sendPrompt(podId, resourceUri, promptText);
  };

  document.addEventListener('ephemeris-prompt-query', onPromptQueryFromUI);
  window.addEventListener('ephemeris-prompt-query', onPromptQueryFromUI);

  const isFleetIssuesQuery = (pLower) => {
    const explicitPods = [
      'payment-service',
      'payment service',
      'cart-service',
      'cart service',
      'checkout-service',
      'checkout service',
      'batch-ingestor',
      'batch ingestor',
      'redis-cart',
      'spark-master',
      'spark-worker',
    ];
    if (explicitPods.some((ep) => pLower.includes(ep))) {
      return false;
    }

    const issueWords = [
      'issue',
      'issues',
      'failing',
      'failed',
      'fail',
      'broken',
      'crashing',
      'crash',
      'error',
      'errors',
      'problem',
      'problems',
      'unhealthy',
      'degraded',
      'alert',
      'alerts',
      'down',
      'wrong',
      'anomal',
    ];
    const pluralOrQueryWords = [
      'pods',
      'workloads',
      'services',
      'containers',
      'which',
      'what',
      'list',
      'show',
      'all',
      'any',
      'fleet',
      'cluster',
    ];

    const hasIssue = issueWords.some((iw) => pLower.includes(iw));
    const hasQuery = pluralOrQueryWords.some((qw) => pLower.includes(qw));
    return hasIssue && hasQuery;
  };

  const isChaosScenarioQuery = (pLower) => {
    return (
      pLower.includes('simulate') ||
      pLower.includes('inject chaos') ||
      pLower.includes('trigger ') ||
      (pLower.includes('redis') && pLower.includes('oom')) ||
      pLower.includes('traffic spike') ||
      (pLower.includes('make') && pLower.includes('healthy')) ||
      (pLower.includes('all') && pLower.includes('healthy') && !pLower.includes('why'))
    );
  };

  // 5. Wire Prompt Submission -> Intelligent Target Resolution & WebSocket
  hud.onPromptSubmit = (promptText, pod, meta) => {
    const pLower = (promptText || '').toLowerCase();

    // 5a-0. Check for Chaos Scenario Injection intent ("simulate a redis oom cascade", "make all clusters healthy")
    if (isChaosScenarioQuery(pLower)) {
      hud.setSelectedPod(null);
      topologyMesh.clearSelectedPod();
      controls.resetView();
      promptStartTime = performance.now();
      hud.setStatusMessage(`Executing chaos scenario mutation: "${promptText}"...`, true);
      panel.showStreamingProgress(
        'Mutating cluster state & running k8s-lookout check...',
        'Chaos Scenario Injector'
      );
      ws.sendPrompt('chaos-injector', 'gke://fleet/chaos', promptText);
      return;
    }

    // 5a. Check for Fleet-wide Issues Matrix intent ("which pods have issues", "show me the list of pods with issues")
    if (isFleetIssuesQuery(pLower)) {
      hud.setSelectedPod(null);
      topologyMesh.clearSelectedPod();
      topologyMesh.highlightPodsByFilter((p) => p.status !== 'Running');
      controls.resetView();
      promptStartTime = performance.now();
      hud.setStatusMessage(`Scanning multi-cluster fleet for active issues...`, true);
      panel.showStreamingProgress('Querying multi-cluster anomalies...', 'Fleet Incident Matrix');
      ws.sendPrompt('fleet-issues', 'gke://fleet/issues', promptText);
      return;
    }

    // 5b. Check for Namespace Inventory intent ("show me all the pods in the default namespace")
    if (
      pLower.includes('namespace') ||
      pLower.includes('pods in ') ||
      pLower.includes('workloads in ')
    ) {
      let targetNs = 'default';
      const knownNs = [
        'default',
        'production',
        'checkout',
        'data-pipeline',
        'payments',
        'monitoring',
      ];
      for (const ns of knownNs) {
        if (pLower.includes(ns)) {
          targetNs = ns;
          break;
        }
      }
      hud.setSelectedPod(null);
      topologyMesh.clearSelectedPod();
      topologyMesh.highlightPodsByFilter(
        (p, ud) => ud && ud.namespaceName && ud.namespaceName.toLowerCase().includes(targetNs)
      );
      promptStartTime = performance.now();
      hud.setStatusMessage(`Listing workloads in namespace "${targetNs}"...`, true);
      panel.showStreamingProgress(
        `Listing workloads in namespace ${targetNs}...`,
        `ns/${targetNs}`
      );
      ws.sendPrompt(`ns-${targetNs}`, `gke://namespace/${targetNs}`, promptText);
      return;
    }

    // 5c. Check for Resource Leaderboard intent ("compare memory usage across pods")
    if (
      pLower.includes('leaderboard') ||
      pLower.includes('compare cpu') ||
      pLower.includes('compare memory') ||
      pLower.includes('top cpu') ||
      pLower.includes('top memory') ||
      pLower.includes('saturation')
    ) {
      hud.setSelectedPod(null);
      topologyMesh.clearSelectedPod();
      topologyMesh.clearFilterHighlight();
      promptStartTime = performance.now();
      hud.setStatusMessage(`Comparing cluster resource saturation...`, true);
      panel.showStreamingProgress(
        'Ranking workload CPU & memory saturation...',
        'Resource Leaderboard'
      );
      ws.sendPrompt('fleet-leaderboard', 'gke://fleet/leaderboard', promptText);
      return;
    }

    // 5d. Single-Pod Query (Logs Console or Deep Triage Cockpit)
    topologyMesh.clearFilterHighlight();
    let targetPod = pod;
    let targetMeta = meta;

    // Resolve target pod if needed or if prompt explicitly requests a resource
    const resolved = findTargetPodFromPrompt(promptText, pod, currentTopologyData);
    if (resolved && resolved.pod) {
      targetPod = resolved.pod;
      targetMeta = resolved.meta;
    }

    if (!targetPod) {
      hud.setStatusMessage('No Kubernetes resources found matching prompt.', false);
      return;
    }

    // Switch cluster if target pod is in a different cluster (skip cluster camera refocus)
    if (targetMeta && targetMeta.clusterName) {
      const select = document.getElementById('hud-cluster-select');
      if (select && select.value !== targetMeta.clusterName) {
        select.value = targetMeta.clusterName;
        hud.onClusterSelect(targetMeta.clusterName, true);
      }
    }

    // Smoothly focus camera on the target pod in 3D topology
    let targetMesh =
      topologyMesh.podMap.get(targetPod.name) || topologyMesh.podMap.get(targetPod.id);
    if (!targetMesh) {
      for (const [k, m] of topologyMesh.podMap.entries()) {
        if (k.includes(targetPod.name) || targetPod.name.includes(k)) {
          targetMesh = m;
          break;
        }
      }
    }
    if (targetMesh) {
      controls.focusOnMesh(targetMesh);
    }
    topologyMesh.setSelectedPod(targetPod.name || targetPod.id);
    topologyMesh.highlightBlastRadius(targetPod.name || targetPod.id);

    hud.setSelectedPod(targetPod, targetMeta);
    promptStartTime = performance.now();
    hud.setStatusMessage(`Investigating ${targetPod.name}: "${promptText}"...`, true);

    const resourceUri =
      targetPod.resource_uri || `gke://${targetMeta?.namespaceName || 'default'}/${targetPod.name}`;
    ws.sendPrompt(targetPod.id, resourceUri, promptText);
  };

  // 6. Handle WebSocket events
  ws.onConnectionChange = (state) => {
    hud.setConnectionState(state);
    if (state === 'connected') {
      hud.setStatusMessage('Connected to daemon. Loading spatial topology...', false);
    } else if (state === 'connecting') {
      hud.setStatusMessage('Connecting to orchestrator daemon...', false);
    } else {
      hud.setStatusMessage('Disconnected from daemon. Retrying...', false);
    }
  };

  ws.onTopology = (topologyData) => {
    const isFirstLoad = !currentTopologyData;
    currentTopologyData = topologyData;
    topologyMesh.build(topologyData);

    if (topologyData && topologyData.scenario_id) {
      hud.setScenario(topologyData.scenario_id);
    }

    if (topologyData && topologyData.clusters && topologyData.clusters.length > 0) {
      const clusters = topologyData.clusters;
      const select = document.getElementById('hud-cluster-select');
      const activeClusterName =
        !isFirstLoad && select && select.value ? select.value : '__overview__';
      hud.setClusters(clusters, activeClusterName);
      hud.onClusterSelect(activeClusterName, true);

      if (isFirstLoad) {
        // Auto-focus the failing pod after initial load if available
        let failingPodMesh = null;
        for (const mesh of topologyMesh.getInteractiveObjects()) {
          if (mesh.userData && mesh.userData.isCrashLoop) {
            failingPodMesh = mesh;
            break;
          }
        }

        if (failingPodMesh) {
          setTimeout(() => {
            controls.focusOnMesh(failingPodMesh);
          }, 800);
        }
      } else {
        hud.setStatusMessage(
          `Scenario "${topologyData.scenario_id || 'default'}" active. 3D spatial mesh synchronized.`,
          false
        );
      }
    }
  };

  ws.onStatus = (statusMsg) => {
    hud.setStatusMessage(statusMsg, true);
    const activePodName = hud.selectedPod ? hud.selectedPod.name : 'Pod';
    panel.showStreamingProgress(statusMsg, activePodName);
  };

  ws.onUIComponent = (msg) => {
    const durationMs = promptStartTime ? performance.now() - promptStartTime : 0;
    const codeStr = msg.code || '';
    const archetype = msg.archetype || '';

    let displayTitle = hud.selectedPod ? hud.selectedPod.name : msg.selected_node_id || 'Pod';
    let displayStatus = hud.selectedPod ? hud.selectedPod.status : 'Running';

    if (
      archetype === 'chaos_scenario' ||
      archetype === 'issues_matrix' ||
      codeStr.includes('Multi-Cluster Incident Fleet Matrix')
    ) {
      displayTitle =
        archetype === 'chaos_scenario'
          ? 'Chaos Scenario & Fleet Health'
          : 'Multi-Cluster Fleet Issues';
      const hasIssues = !codeStr.includes('ALL CLUSTERS HEALTHY');
      displayStatus = hasIssues ? 'CrashLoopBackOff' : 'Running';
      panel.activeObject = null;
      hud.setSelectedPod(null);
      topologyMesh.clearSelectedPod();
      topologyMesh.highlightPodsByFilter((p) => p.status !== 'Running');
      controls.resetView();
    } else if (
      archetype === 'namespace_inventory' ||
      codeStr.includes('Namespace Workload Inventory')
    ) {
      const ns = msg.target_namespace || 'default';
      displayTitle = `Namespace Inventory: ${ns}`;
      displayStatus = 'Running';
      panel.activeObject = null;
      hud.setSelectedPod(null);
      topologyMesh.clearSelectedPod();
      topologyMesh.highlightPodsByFilter(
        (p, ud) =>
          ns === 'all' || (ud && ud.namespaceName && ud.namespaceName.toLowerCase().includes(ns))
      );
    } else if (
      archetype === 'resource_leaderboard' ||
      codeStr.includes('Workload Resource Saturation Leaderboard')
    ) {
      displayTitle = 'Resource Leaderboard';
      displayStatus = 'Running';
      panel.activeObject = null;
      hud.setSelectedPod(null);
      topologyMesh.clearSelectedPod();
      topologyMesh.clearFilterHighlight();
    }

    hud.setStatusMessage(
      `UI ready in ${(durationMs / 1000).toFixed(2)}s. Displaying ${displayTitle}.`,
      false
    );

    panel.mount(msg.code, msg.telemetry, {
      podId: displayTitle,
      status: displayStatus,
      durationMs: durationMs,
    });
  };

  ws.onError = (err) => {
    hud.setStatusMessage(`Error: ${err.message || 'Operation failed'}`, false);
  };

  ws.connect();

  return {
    sceneManager,
    topologyMesh,
    controls,
    hud,
    panel,
    ws,
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
  });
}
