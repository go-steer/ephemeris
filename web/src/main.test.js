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

  it('returns false when container is missing', () => {
    document.body.innerHTML = '';
    expect(initializeApp()).toBe(false);
  });
});
