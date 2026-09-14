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

  // 5. Wire Prompt Submission -> WebSocket & Latency Timer
  hud.onPromptSubmit = (promptText, pod, meta) => {
    promptStartTime = performance.now();
    hud.setStatusMessage(`Investigating ${pod.name}: "${promptText}"...`, true);

    const resourceUri = pod.resource_uri || `gke://${meta?.namespaceName || 'default'}/${pod.name}`;
    ws.sendPrompt(pod.id, resourceUri, promptText);
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
    topologyMesh.build(topologyData);

    if (topologyData && topologyData.clusters && topologyData.clusters.length > 0) {
      const cluster = topologyData.clusters[0];
      hud.setClusterInfo(cluster.name, cluster.location || 'us-central1');

      let running = 0;
      let crash = 0;
      let pending = 0;
      let failingPodMesh = null;

      (cluster.namespaces || []).forEach((ns) => {
        (ns.pods || []).forEach((p) => {
          if (p.status === 'Running') running++;
          else if (p.status === 'CrashLoopBackOff' || p.status === 'Failed') {
            crash++;
          } else if (p.status === 'Pending') pending++;
        });
      });

      hud.setPodStats(running, crash, pending);
      hud.setStatusMessage(
        `Topology synced: ${running} running, ${crash} crashing, ${pending} pending.`,
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
