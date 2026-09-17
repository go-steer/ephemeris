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

import { describe, it, expect, beforeEach } from 'vitest';
import { initializeApp } from './main.js';

describe('initializeApp', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app">
        <div id="canvas-container"></div>
        <div id="hud-container"></div>
        <div id="panel-container"></div>
      </div>
    `;
  });

  it('initializes successfully when containers exist', () => {
    const app = initializeApp();
    expect(app).toBeTruthy();
    expect(app.sceneManager).toBeDefined();
    expect(app.hud).toBeDefined();
    expect(app.panel).toBeDefined();
    expect(app.ws).toBeDefined();
  });

  it('switches camera mode between orbit and pan via hud', () => {
    const app = initializeApp();
    app.hud.onCameraModeChange('pan');
    expect(app.controls.navMode).toBe('pan');

    app.hud.onCameraModeChange('orbit');
    expect(app.controls.navMode).toBe('orbit');
  });

  it('resolves issue pod and focuses camera when prompt is submitted without selection', () => {
    const app = initializeApp();
    const mockData = {
      clusters: [
        {
          name: 'prod',
          namespaces: [
            {
              name: 'default',
              pods: [
                { id: 'pod-1', name: 'healthy-srv', status: 'Running' },
                { id: 'pod-2', name: 'payment-service', status: 'CrashLoopBackOff' },
              ],
            },
          ],
        },
      ],
    };

    app.ws.onTopology(mockData);

    let sentPrompt = null;
    app.ws.sendPrompt = (id, uri, prompt) => {
      sentPrompt = { id, uri, prompt };
    };

    // Submit prompt without clicking any pod
    app.hud.onPromptSubmit('Investigate crash in payment service', null, null);

    // Should resolve payment-service and focus it
    expect(app.hud.selectedPod).toBeDefined();
    expect(app.hud.selectedPod.name).toBe('payment-service');
    expect(app.controls.selectedPod.name).toBe('payment-service');
    expect(sentPrompt).toBeDefined();
    expect(sentPrompt.id).toBe('pod-2');
  });

  it('resolves pod with hyphen when prompt uses spaces ("focus on batch ingestor")', () => {
    const app = initializeApp();
    const mockData = {
      clusters: [
        {
          name: 'prod',
          namespaces: [
            {
              name: 'default',
              pods: [
                { id: 'pod-batch-1', name: 'batch-ingestor', status: 'Pending' },
                { id: 'pod-pay-1', name: 'payment-service', status: 'Running' },
              ],
            },
          ],
        },
      ],
    };

    app.ws.onTopology(mockData);

    let sentPrompt = null;
    app.ws.sendPrompt = (id, uri, prompt) => {
      sentPrompt = { id, uri, prompt };
    };

    // User types "focus on batch ingestor" (spaces instead of hyphen)
    app.hud.onPromptSubmit('focus on batch ingestor', null, null);

    expect(app.hud.selectedPod).toBeDefined();
    expect(app.hud.selectedPod.name).toBe('batch-ingestor');
    expect(app.controls.selectedPod.name).toBe('batch-ingestor');
    expect(sentPrompt).toBeDefined();
    expect(sentPrompt.id).toBe('pod-batch-1');
  });

  it('initializes clusters with overview and switches cleanly', () => {
    const app = initializeApp();
    const mockData = {
      clusters: [
        {
          name: 'production-us-central1',
          location: 'us-central1',
          namespaces: [
            {
              name: 'default',
              pods: [{ id: 'p1', name: 'frontend', status: 'Running' }],
            },
          ],
        },
        {
          name: 'staging-us-east1',
          location: 'us-east1',
          namespaces: [
            {
              name: 'default',
              pods: [{ id: 'p2', name: 'batch-ingestor', status: 'Pending' }],
            },
          ],
        },
      ],
    };

    app.ws.onTopology(mockData);

    const select = document.getElementById('hud-cluster-select');
    expect(select).toBeDefined();
    expect(select.value).toBe('__overview__');

    // Select the first cluster explicitly
    select.value = 'production-us-central1';
    app.hud.onClusterSelect('production-us-central1');
    const statusMsgEl = document.getElementById('hud-status-msg');
    expect(statusMsgEl.textContent).toContain('production-us-central1');

    // Reset view restores overview
    app.hud.onResetView();
    expect(select.value).toBe('__overview__');
  });

  it('updates incident panel and HUD cockpit status when ephemeris-remediated event fires', () => {
    const app = initializeApp();
    const mockData = {
      clusters: [
        {
          name: 'production-us-central1',
          location: 'us-central1',
          namespaces: [
            {
              name: 'default',
              pods: [
                {
                  id: 'pod-payment',
                  name: 'payment-service',
                  status: 'CrashLoopBackOff',
                },
              ],
            },
          ],
        },
      ],
    };

    app.ws.onTopology(mockData);
    app.hud.setSelectedPod(
      { id: 'pod-payment', name: 'payment-service', status: 'CrashLoopBackOff' },
      { clusterName: 'production-us-central1', namespaceName: 'default' }
    );

    const badge = document.getElementById('hud-target-badge');
    expect(badge.className).toContain('status-crashloopbackoff');

    // Dispatch ephemeris-remediated event
    document.dispatchEvent(
      new CustomEvent('ephemeris-remediated', {
        detail: { podId: 'payment-service', status: 'Running' },
      })
    );

    expect(badge.className).toContain('status-running');
    expect(badge.textContent).toContain('Running');
    expect(app.panel.statusBadge.className).toContain('status-running');
    expect(app.panel.statusBadge.textContent).toBe('Running');
  });

  it('handles ephemeris-traffic-drain event and updates spatial mesh and HUD status', () => {
    const app = initializeApp();
    const mockData = {
      clusters: [
        {
          name: 'production-us-central1',
          namespaces: [
            {
              name: 'default',
              pods: [
                {
                  id: 'pod-payment',
                  name: 'payment-service',
                  status: 'CrashLoopBackOff',
                },
              ],
            },
          ],
        },
      ],
    };

    app.ws.onTopology(mockData);

    // Dispatch ephemeris-traffic-drain event
    document.dispatchEvent(
      new CustomEvent('ephemeris-traffic-drain', {
        detail: { podId: 'payment-service', percent: 25 },
      })
    );

    const statusMsg = document.getElementById('hud-status-msg');
    expect(statusMsg.textContent).toContain('Traffic drained to 25% on payment-service');
  });

  it('displays inline @resource prompt chip, telemetry inclusion badges, and 3D reticle on pod selection, and detaches cleanly', () => {
    const app = initializeApp();
    const mockData = {
      clusters: [
        {
          name: 'production-us-central1',
          namespaces: [
            {
              name: 'default',
              pods: [
                {
                  id: 'pod-payment',
                  name: 'payment-service',
                  status: 'CrashLoopBackOff',
                },
              ],
            },
          ],
        },
      ],
    };

    app.ws.onTopology(mockData);

    const promptChip = document.getElementById('hud-prompt-chip');
    const chipName = document.getElementById('hud-chip-name');
    const inclusions = document.getElementById('hud-context-inclusions');
    const detachBtn = document.getElementById('hud-detach-btn');

    // Initially hidden (cluster-wide mesh context)
    expect(promptChip.classList.contains('hidden')).toBe(true);
    expect(inclusions.classList.contains('hidden')).toBe(true);
    expect(app.topologyMesh.selectionReticle).toBeNull();

    // Simulate 3D node selection
    app.controls.onSelectNode(
      { id: 'pod-payment', name: 'payment-service', status: 'CrashLoopBackOff' },
      { clusterName: 'production-us-central1', namespaceName: 'default' }
    );

    // Inline @payment-service chip, telemetry inclusion badges, and 3D reticle should now be active
    expect(promptChip.classList.contains('hidden')).toBe(false);
    expect(chipName.textContent).toBe('payment-service');
    expect(inclusions.classList.contains('hidden')).toBe(false);
    expect(detachBtn.classList.contains('hidden')).toBe(false);
    expect(app.topologyMesh.selectionReticle).not.toBeNull();

    // Detach via the Detach button
    detachBtn.click();
    expect(promptChip.classList.contains('hidden')).toBe(true);
    expect(inclusions.classList.contains('hidden')).toBe(true);
    expect(app.topologyMesh.selectionReticle).toBeNull();
    expect(app.hud.selectedPod).toBeNull();
  });

  it('displays live progressive streaming in IncidentPanel when ws.onStatus arrives', () => {
    const app = initializeApp();
    app.hud.setSelectedPod(
      { id: 'pod-payment', name: 'payment-service', status: 'CrashLoopBackOff' },
      { clusterName: 'production-us-central1', namespaceName: 'default' }
    );

    expect(app.panel.isVisible).toBe(false);

    // Simulate streaming status message from backend
    app.ws.onStatus('Streaming ArrowJS UI tokens (420 bytes received)...');

    expect(app.panel.isVisible).toBe(true);
    expect(app.panel.statusBadge.textContent).toBe('STREAMING');
    expect(app.panel.ttiBadge.textContent).toBe('TTI: LIVE...');
    expect(document.getElementById('hud-status-msg').textContent).toContain(
      'Streaming ArrowJS UI tokens (420 bytes received)...'
    );
  });

  it('resets demo incident state when #hud-reset-incident-btn is clicked', () => {
    const app = initializeApp();
    const mockData = {
      clusters: [
        {
          name: 'production-us-central1',
          namespaces: [
            {
              name: 'default',
              pods: [
                {
                  id: 'pod-payment',
                  name: 'payment-service',
                  status: 'Running',
                },
              ],
            },
          ],
        },
      ],
    };

    app.ws.onTopology(mockData);
    app.panel.showStreamingProgress('Testing reset', 'payment-service');
    expect(app.panel.isVisible).toBe(true);

    let sentScenario = null;
    app.ws.sendScenario = (scenarioId) => {
      sentScenario = scenarioId;
    };

    const resetIncidentBtn = document.getElementById('hud-reset-incident-btn');
    expect(resetIncidentBtn).not.toBeNull();
    resetIncidentBtn.click();

    expect(app.panel.isVisible).toBe(false);
    expect(sentScenario).toBe('default');
    expect(document.getElementById('hud-status-msg').textContent).toContain(
      'Demo incident reset: baseline payment-service CrashLoopBackOff scenario restored.'
    );
  });

  it('sends scenario mutation when #hud-scenario-select changes and sendRemediate on remediation', () => {
    const app = initializeApp();
    let sentScenario = null;
    app.ws.sendScenario = (id) => {
      sentScenario = id;
    };

    let sentRemediation = null;
    app.ws.sendRemediate = (podId, action) => {
      sentRemediation = { podId, action };
    };

    const scenarioSelect = document.getElementById('hud-scenario-select');
    expect(scenarioSelect).not.toBeNull();
    scenarioSelect.value = 'redis-oom';
    scenarioSelect.dispatchEvent(new Event('change'));
    expect(sentScenario).toBe('redis-oom');

    document.dispatchEvent(
      new CustomEvent('ephemeris-remediated', {
        detail: { podId: 'redis-cart', status: 'Running', action: 'scale-memory' },
      })
    );
    expect(sentRemediation).toEqual({ podId: 'redis-cart', action: 'scale-memory' });
  });

  it('opens Dedicated Object Chat & Inspector window on 3D pod click and handles object prompt submit', () => {
    const app = initializeApp();
    const mockData = {
      clusters: [
        {
          name: 'production-us-central1',
          namespaces: [
            {
              name: 'default',
              pods: [
                {
                  id: 'pod-payment',
                  name: 'payment-service',
                  status: 'CrashLoopBackOff',
                },
                {
                  id: 'pod-frontend',
                  name: 'frontend',
                  status: 'Running',
                },
              ],
            },
          ],
        },
      ],
    };

    app.ws.onTopology(mockData);

    let sentPrompt = null;
    app.ws.sendPrompt = (nodeId, uri, text) => {
      sentPrompt = { nodeId, uri, text };
    };

    // Simulate clicking payment-service in 3D canvas
    app.controls.onSelectNode(
      { id: 'pod-payment', name: 'payment-service', status: 'CrashLoopBackOff' },
      { clusterName: 'production-us-central1', namespaceName: 'default' }
    );

    expect(app.panel.isVisible).toBe(true);
    expect(document.getElementById('panel-object-tag').textContent).toBe('@payment-service');

    // Type into dedicated object chat input and submit
    const objInput = document.getElementById('panel-object-prompt-input');
    const objSendBtn = document.getElementById('panel-object-send-btn');
    objInput.value = 'Show me the logs for payment-service';
    objSendBtn.click();

    expect(sentPrompt).not.toBeNull();
    expect(sentPrompt.uri).toBe('gke://default/payment-service');
    expect(sentPrompt.text).toBe('Show me the logs for payment-service');
  });

  it('filters 3D spatial mesh and sends fleet/namespace URI on polymorphic queries', () => {
    const app = initializeApp();
    const mockData = {
      clusters: [
        {
          name: 'production-us-central1',
          namespaces: [
            {
              name: 'default',
              pods: [
                { id: 'pod-payment', name: 'payment-service', status: 'CrashLoopBackOff' },
                { id: 'pod-frontend', name: 'frontend', status: 'Running' },
              ],
            },
          ],
        },
      ],
    };

    app.ws.onTopology(mockData);

    let sentPrompt = null;
    app.ws.sendPrompt = (nodeId, uri, text) => {
      sentPrompt = { nodeId, uri, text };
    };

    // Trigger fleet issues query via HUD chip
    const issuesChip = document.getElementById('hud-chip-issues');
    issuesChip.click();

    expect(sentPrompt).not.toBeNull();
    expect(sentPrompt.uri).toBe('gke://fleet/issues');

    // Verify 3D scene filtering dimmed non-failing pods
    const frontendMesh = app.topologyMesh.podMap.get('frontend');
    const paymentMesh = app.topologyMesh.podMap.get('payment-service');
    expect(frontendMesh.material.opacity).toBeCloseTo(0.22, 2);
    expect(paymentMesh.material.opacity).toBeCloseTo(1.0, 2);
  });

  it('handles bi-directional ephemeris-select-pod and ephemeris-prompt-query events from ArrowJS UI', () => {
    const app = initializeApp();
    const mockData = {
      clusters: [
        {
          name: 'production-us-central1',
          namespaces: [
            {
              name: 'default',
              pods: [
                { id: 'pod-payment', name: 'payment-service', status: 'CrashLoopBackOff' },
                { id: 'pod-frontend', name: 'frontend', status: 'Running' },
              ],
            },
          ],
        },
      ],
    };

    app.ws.onTopology(mockData);

    let sentPrompt = null;
    app.ws.sendPrompt = (nodeId, uri, text) => {
      sentPrompt = { nodeId, uri, text };
    };

    // Dispatch ephemeris-select-pod from generated UI row
    window.dispatchEvent(
      new CustomEvent('ephemeris-select-pod', {
        detail: {
          podId: 'frontend',
          clusterName: 'production-us-central1',
          namespaceName: 'default',
        },
      })
    );

    expect(app.hud.selectedPod.name).toBe('frontend');
    expect(document.getElementById('hud-status-msg').textContent).toContain(
      'Focused 3D camera on workload frontend.'
    );

    // Dispatch ephemeris-prompt-query from generated UI button
    window.dispatchEvent(
      new CustomEvent('ephemeris-prompt-query', {
        detail: {
          prompt: 'Show me the logs for frontend',
          podId: 'frontend',
          resourceUri: 'gke://default/frontend',
        },
      })
    );

    expect(sentPrompt).not.toBeNull();
    expect(sentPrompt.uri).toBe('gke://default/frontend');
    expect(sentPrompt.text).toBe('Show me the logs for frontend');
  });

  it('immediately clears previous sandbox content at t = 0ms and shows live synthesis stepper on prompt submit', () => {
    const app = initializeApp();
    app.panel.mount(
      'const template = html`<div class="old-stale-content">OLD PANEL</div>`; template(container);'
    );

    expect(app.panel.runtime.container.innerHTML).toContain('OLD PANEL');

    // Now submit a new prompt
    app.hud.onPromptSubmit('show me the statefulsets', null, null);

    // Verify stale content was cleared immediately at t = 0ms and replaced by live synthesis stepper
    expect(app.panel.runtime.container.innerHTML).not.toContain('OLD PANEL');
    expect(app.panel.runtime.container.innerHTML).toContain('Gemini 3.8 Flash Live Synthesis');
    expect(app.panel.statusBadge.textContent).toBe('STREAMING');
  });

  it('pins a floating panel (📌) and spawns a second floating panel window when a subsequent prompt is submitted', () => {
    const app = initializeApp();
    app.panel.mount(
      'const template = html`<div class="panel-one">StatefulSet Explorer</div>`; template(container);'
    );

    const panelContainer = document.getElementById('panel-container');
    expect(panelContainer.querySelectorAll('.floating-panel').length).toBe(1);

    // Pin the first panel
    app.panel.pinBtn.click();
    expect(app.panel.isPinned).toBe(true);
    expect(app.panel.panelEl.classList.contains('pinned-panel')).toBe(true);

    // Submit a new prompt -> should spawn a second floating panel without overwriting the first!
    app.hud.onPromptSubmit('show me the deployments', null, null);

    const allPanels = panelContainer.querySelectorAll('.floating-panel');
    expect(allPanels.length).toBe(2);
    // First panel still has its content
    expect(app.panel.runtime.container.innerHTML).toContain('StatefulSet Explorer');
    // Second spawned panel shows live stepper
    expect(app.panel._childWindows[0].runtime.container.innerHTML).toContain(
      'Gemini 3.8 Flash Live Synthesis'
    );
  });

  it('returns false when container is missing', () => {
    document.body.innerHTML = '';
    expect(initializeApp()).toBe(false);
  });
});
