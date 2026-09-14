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

  // 4. Wire 3D Scene Selection -> HUD & WebSocket
  controls.onSelectNode = (pod, meta) => {
    const resourceUri = pod.resource_uri || `gke://${meta.namespaceName || 'default'}/${pod.name}`;
    hud.setSelectedPod(pod, meta);
    ws.selectNode(pod.id, resourceUri);
  };

  hud.onResetView = () => {
    controls.resetView();
    hud.setSelectedPod(null);
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

    // 1. Check for specific pod or service name mentioned in the prompt
    for (const cluster of topologyData.clusters) {
      for (const ns of cluster.namespaces || []) {
        for (const p of ns.pods || []) {
          const pName = (p.name || '').toLowerCase();
          if (text.includes(pName) || (p.id && text.includes(p.id.toLowerCase()))) {
            return { pod: p, meta: { namespaceName: ns.name, clusterName: cluster.name } };
          }
        }
      }
    }

    // 2. If prompt asks for issues, errors, crash, triage, fix, or if no pod is currently active
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

    if (activePod) {
      return { pod: activePod, meta: hud.selectedMeta };
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
  hud.onClusterSelect = (clusterName) => {
    if (!currentTopologyData || !currentTopologyData.clusters) return;

    const cluster = currentTopologyData.clusters.find((c) => c.name === clusterName);
    if (!cluster) return;

    const pos = topologyMesh.getClusterPosition(clusterName);
    if (pos) {
      controls.focusOnCluster(pos);
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
    hud.setStatusMessage(
      `Viewing cluster ${cluster.name} [${cluster.location || 'global'}].`,
      false
    );
  };

  // Wire Live Remediation Event (dispatched from ArrowJS sandbox) -> 3D Mesh
  const onRemediate = (e) => {
    if (e.detail && e.detail.podId) {
      const podId = e.detail.podId;
      const newStatus = e.detail.status || 'Running';
      topologyMesh.remediatePod(podId, newStatus);
      if (panel.statusBadge) {
        panel.statusBadge.textContent = newStatus;
      }
      hud.setStatusMessage(
        `Remediation verified: ${podId} is now ${newStatus}. Spatial mesh updated.`,
        false
      );

      // Update cluster stats
      if (currentTopologyData && currentTopologyData.clusters) {
        currentTopologyData.clusters.forEach((c) => {
          (c.namespaces || []).forEach((ns) => {
            (ns.pods || []).forEach((p) => {
              if (p.name === podId || p.id === podId) {
                p.status = newStatus;
              }
            });
          });
        });
        const select = document.getElementById('hud-cluster-select');
        const activeClusterName = select ? select.value : currentTopologyData.clusters[0]?.name;
        hud.setClusters(currentTopologyData.clusters, activeClusterName);
        if (activeClusterName) {
          hud.onClusterSelect(activeClusterName);
        }
      }
    }
  };

  document.addEventListener('ephemeris-remediated', onRemediate);
  window.addEventListener('ephemeris-remediated', onRemediate);

  // 5. Wire Prompt Submission -> Intelligent Target Resolution & WebSocket
  hud.onPromptSubmit = (promptText, pod, meta) => {
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

    // Switch cluster if target pod is in a different cluster
    if (targetMeta && targetMeta.clusterName) {
      const select = document.getElementById('hud-cluster-select');
      if (select && select.value !== targetMeta.clusterName) {
        select.value = targetMeta.clusterName;
        hud.onClusterSelect(targetMeta.clusterName);
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
    currentTopologyData = topologyData;
    topologyMesh.build(topologyData);

    if (topologyData && topologyData.clusters && topologyData.clusters.length > 0) {
      const clusters = topologyData.clusters;
      const primaryCluster = clusters[0];
      hud.setClusters(clusters, primaryCluster.name);

      let running = 0;
      let crash = 0;
      let pending = 0;
      let failingPodMesh = null;

      (primaryCluster.namespaces || []).forEach((ns) => {
        (ns.pods || []).forEach((p) => {
          if (p.status === 'Running') running++;
          else if (p.status === 'CrashLoopBackOff' || p.status === 'Failed') {
            crash++;
          } else if (p.status === 'Pending') pending++;
        });
      });

      hud.setPodStats(running, crash, pending);
      hud.setStatusMessage(
        `Connected to ${clusters.length} GKE clusters: ${running} running, ${crash} crashing, ${pending} pending in primary.`,
        false
      );

      // Auto-focus the failing pod after initial load if available
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
    }
  };

  ws.onStatus = (statusMsg) => {
    hud.setStatusMessage(statusMsg, true);
  };

  ws.onUIComponent = (msg) => {
    const durationMs = promptStartTime ? performance.now() - promptStartTime : 0;
    hud.setStatusMessage(
      `UI ready in ${(durationMs / 1000).toFixed(2)}s. Displaying reactive triage widget.`,
      false
    );

    const activePod = hud.selectedPod;
    panel.mount(msg.code, msg.telemetry, {
      podId: activePod ? activePod.name : msg.selected_node_id || 'Pod',
      status: activePod ? activePod.status : 'Running',
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
