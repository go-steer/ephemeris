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

import { ArrowSandboxRuntime } from './runtime.js';

/**
 * IncidentPanel manages the floating HUD window containing the ArrowJS sandbox runtime,
 * draggable header, minimize/close controls, and TTI benchmark readouts.
 */
export class IncidentPanel {
  /**
   * @param {HTMLElement} container - Root element for the panel (e.g. #panel-container).
   */
  constructor(container) {
    this.container = container;
    this.isMinimized = false;
    this.isVisible = false;

    this._createDOM();
    this.runtime = new ArrowSandboxRuntime(this.sandboxHost);
  }

  _createDOM() {
    this.panelEl = document.createElement('div');
    this.panelEl.className = 'floating-panel';
    this.panelEl.style.display = 'none';

    // Header with drag handle and controls
    this.headerEl = document.createElement('div');
    this.headerEl.className = 'panel-header';

    this.titleArea = document.createElement('div');
    this.titleArea.className = 'panel-title-area';

    this.statusBadge = document.createElement('span');
    this.statusBadge.className = 'panel-status-pill';
    this.statusBadge.textContent = 'READY';

    this.titleText = document.createElement('span');
    this.titleText.className = 'panel-title-text';
    this.titleText.textContent = 'Ephemeral Incident Triage';

    this.ttiBadge = document.createElement('span');
    this.ttiBadge.className = 'panel-tti-badge';
    this.ttiBadge.textContent = 'TTI: --';

    this.titleArea.appendChild(this.statusBadge);
    this.titleArea.appendChild(this.titleText);
    this.titleArea.appendChild(this.ttiBadge);

    this.controlsArea = document.createElement('div');
    this.controlsArea.className = 'panel-controls';

    this.minBtn = document.createElement('button');
    this.minBtn.className = 'panel-control-btn';
    this.minBtn.innerHTML = '&minus;';
    this.minBtn.title = 'Minimize/Expand';
    this.minBtn.addEventListener('click', () => this.toggleMinimize());

    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'panel-control-btn close';
    this.closeBtn.innerHTML = '&times;';
    this.closeBtn.title = 'Close Panel';
    this.closeBtn.addEventListener('click', () => this.hide());

    this.controlsArea.appendChild(this.minBtn);
    this.controlsArea.appendChild(this.closeBtn);

    this.headerEl.appendChild(this.titleArea);
    this.headerEl.appendChild(this.controlsArea);

    // Body hosting the sandbox
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'panel-body';

    this.sandboxHost = document.createElement('div');
    this.sandboxHost.className = 'sandbox-host';
    this.bodyEl.appendChild(this.sandboxHost);

    this.panelEl.appendChild(this.headerEl);
    this.panelEl.appendChild(this.bodyEl);
    this.container.appendChild(this.panelEl);

    this._setupDragging();
  }

  _setupDragging() {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onPointerDown = (e) => {
      // Don't drag if clicking buttons
      if (e.target.closest('.panel-control-btn')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.panelEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      // Unset bottom/right positioning if set
      this.panelEl.style.right = 'auto';
      this.panelEl.style.bottom = 'auto';
      this.panelEl.style.left = `${initialLeft}px`;
      this.panelEl.style.top = `${initialTop}px`;

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newLeft = Math.max(10, Math.min(window.innerWidth - 300, initialLeft + dx));
      const newTop = Math.max(50, Math.min(window.innerHeight - 100, initialTop + dy));

      this.panelEl.style.left = `${newLeft}px`;
      this.panelEl.style.top = `${newTop}px`;
    };

    const onPointerUp = () => {
      isDragging = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    this.headerEl.addEventListener('pointerdown', onPointerDown);
  }

  /**
   * Mount and display generated ArrowJS component.
   *
   * @param {string} code - Generated ArrowJS code.
   * @param {object} telemetry - Telemetry data object.
   * @param {object} meta - Additional metadata { podId, status, durationMs }.
   */
  mount(code, telemetry = {}, meta = {}) {
    const podId = meta.podId || telemetry.pod_id || 'Pod';
    const status = meta.status || (telemetry.metrics && telemetry.metrics.status) || 'Running';

    this.titleText.textContent = podId;
    this.statusBadge.textContent = status;
    this.statusBadge.className = `panel-status-pill status-${status.toLowerCase()}`;

    if (meta.durationMs !== undefined) {
      const ttiSec = (meta.durationMs / 1000).toFixed(2);
      this.ttiBadge.textContent = `TTI: ${ttiSec}s`;
      this.ttiBadge.className = meta.durationMs < 4000 ? 'panel-tti-badge fast' : 'panel-tti-badge';
    }

    this.runtime.execute(code, telemetry);
    this.show();
  }

  /**
   * Display live progressive streaming indicator while Gemini is synthesizing the ArrowJS UI.
   *
   * @param {string} statusMessage - Current streaming/reasoning step message.
   * @param {string} podId - Target pod name.
   */
  showStreamingProgress(statusMessage, podId = 'Pod') {
    if (podId) {
      this.titleText.textContent = podId;
    }
    this.statusBadge.textContent = 'STREAMING';
    this.statusBadge.className = 'panel-status-pill status-pending';
    this.ttiBadge.textContent = 'TTI: LIVE...';

    const streamingCode = `
      const state = reactive({
        msg: ${JSON.stringify(statusMessage || 'Synthesizing reactive ArrowJS control interface...')},
        pod: ${JSON.stringify(podId || 'Pod')}
      });
      const template = html\`
        <div class="ephemeris-widget streaming-skeleton">
          <div class="remediation-in-progress">
            <div class="progress-title">
              <span class="spinner-inline"></span>
              <span>Gemini 3.8 Flash Live Synthesis</span>
            </div>
            <div class="stepper-list">
              <div class="step-item done">
                <span class="step-num">1</span>
                <span class="step-text">Spatial context bound: <strong>\${() => state.pod}</strong></span>
              </div>
              <div class="step-item done">
                <span class="step-num">2</span>
                <span class="step-text">\${() => state.msg}</span>
              </div>
            </div>
          </div>
        </div>
      \`;
      template(container);
    `;

    this.runtime.execute(streamingCode, { pod_id: podId });
    this.show();
  }

  show() {
    this.panelEl.style.display = 'flex';
    this.isVisible = true;
    if (this.isMinimized) {
      this.toggleMinimize();
    }
  }

  hide() {
    this.panelEl.style.display = 'none';
    this.isVisible = false;
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    if (this.isMinimized) {
      this.bodyEl.style.display = 'none';
      this.minBtn.innerHTML = '&#43;';
      this.panelEl.classList.add('minimized');
    } else {
      this.bodyEl.style.display = 'block';
      this.minBtn.innerHTML = '&minus;';
      this.panelEl.classList.remove('minimized');
    }
  }

  clear() {
    this.runtime.clear();
    this.titleText.textContent = 'Ephemeral Incident Triage';
    this.statusBadge.textContent = 'READY';
    this.ttiBadge.textContent = 'TTI: --';
  }
}
