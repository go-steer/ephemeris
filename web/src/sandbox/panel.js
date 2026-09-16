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
    this.activeObject = null;
    this.onObjectPromptSubmit = null;

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

    // Persistent Object Chat Footer (Dedicated per-object prompt window)
    this.footerEl = document.createElement('div');
    this.footerEl.className = 'panel-object-chat-footer';

    this.chatHeaderEl = document.createElement('div');
    this.chatHeaderEl.className = 'panel-object-chat-header';

    const chatTitle = document.createElement('div');
    chatTitle.className = 'panel-object-chat-title';
    chatTitle.innerHTML = `<span class="panel-chat-pulse-dot"></span><span>DEDICATED WORKLOAD CO-PILOT</span>`;

    this.quickChipsEl = document.createElement('div');
    this.quickChipsEl.className = 'panel-quick-chips';

    const logsChip = document.createElement('button');
    logsChip.className = 'panel-quick-chip';
    logsChip.id = 'panel-chip-logs';
    logsChip.textContent = '📋 Show Logs';
    logsChip.addEventListener('click', () => {
      const podName = this._getActivePodName();
      this._submitObjectPrompt(`Show me the logs for ${podName}`);
    });

    const triageChip = document.createElement('button');
    triageChip.className = 'panel-quick-chip';
    triageChip.id = 'panel-chip-triage';
    triageChip.textContent = '🔍 AI Triage';
    triageChip.addEventListener('click', () => {
      const podName = this._getActivePodName();
      this._submitObjectPrompt(`Run AI root-cause triage for ${podName}`);
    });

    const metricsChip = document.createElement('button');
    metricsChip.className = 'panel-quick-chip';
    metricsChip.id = 'panel-chip-metrics';
    metricsChip.textContent = '📊 Resource Metrics';
    metricsChip.addEventListener('click', () => {
      const podName = this._getActivePodName();
      this._submitObjectPrompt(`Compare CPU and memory usage for ${podName}`);
    });

    this.quickChipsEl.appendChild(logsChip);
    this.quickChipsEl.appendChild(triageChip);
    this.quickChipsEl.appendChild(metricsChip);

    this.chatHeaderEl.appendChild(chatTitle);
    this.chatHeaderEl.appendChild(this.quickChipsEl);

    this.chatInputRow = document.createElement('div');
    this.chatInputRow.className = 'panel-object-input-row';

    this.objectTagEl = document.createElement('span');
    this.objectTagEl.className = 'panel-object-tag';
    this.objectTagEl.id = 'panel-object-tag';
    this.objectTagEl.textContent = '@workload';

    this.objectInputEl = document.createElement('input');
    this.objectInputEl.type = 'text';
    this.objectInputEl.id = 'panel-object-prompt-input';
    this.objectInputEl.className = 'panel-object-input';
    this.objectInputEl.placeholder =
      'Ask this object anything (e.g. "show logs", "why did it crash?")...';
    this.objectInputEl.addEventListener('focus', () => {
      if (this.objectInputEl.value) {
        this.objectInputEl.select();
      }
    });
    this.objectInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._handleInputSubmit();
      } else if (e.key === 'Escape' && this.objectInputEl.value) {
        e.preventDefault();
        this.objectInputEl.value = '';
      }
    });

    this.objectSendBtn = document.createElement('button');
    this.objectSendBtn.id = 'panel-object-send-btn';
    this.objectSendBtn.className = 'panel-object-send-btn';
    this.objectSendBtn.textContent = 'Ask AI ↵';
    this.objectSendBtn.addEventListener('click', () => this._handleInputSubmit());

    this.chatInputRow.appendChild(this.objectTagEl);
    this.chatInputRow.appendChild(this.objectInputEl);
    this.chatInputRow.appendChild(this.objectSendBtn);

    this.footerEl.appendChild(this.chatHeaderEl);
    this.footerEl.appendChild(this.chatInputRow);

    this.panelEl.appendChild(this.headerEl);
    this.panelEl.appendChild(this.bodyEl);
    this.panelEl.appendChild(this.footerEl);
    this.container.appendChild(this.panelEl);

    this._setupDragging();
  }

  _getActivePodName() {
    if (this.activeObject && this.activeObject.pod && this.activeObject.pod.name) {
      return this.activeObject.pod.name;
    }
    return this.titleText.textContent || 'payment-service';
  }

  _handleInputSubmit() {
    const val = (this.objectInputEl.value || '').trim();
    if (!val) return;
    this.objectInputEl.value = '';
    this._submitObjectPrompt(val);
  }

  _submitObjectPrompt(promptText) {
    if (this.onObjectPromptSubmit) {
      const pod = (this.activeObject && this.activeObject.pod) || {
        name: this._getActivePodName(),
      };
      const meta = (this.activeObject && this.activeObject.meta) || {};
      this.onObjectPromptSubmit(promptText, pod, meta);
    }
  }

  /**
   * Open the floating Object Chat & Inspector window immediately when a 3D pod is clicked.
   *
   * @param {object} pod - Selected 3D pod object { id, name, status, restarts, cpu, memory }.
   * @param {object} meta - Cluster/namespace metadata { clusterName, namespaceName }.
   */
  openObjectInspector(pod, meta = {}) {
    if (!pod) return;
    this.activeObject = { pod, meta };
    const podName = pod.name || pod.id || 'Workload';
    const status = pod.status || 'Running';
    const nsName = meta.namespaceName || pod.namespace || 'default';
    const clusterName = meta.clusterName || pod.cluster || 'production-us-central1';

    this.titleText.textContent = podName;
    this.statusBadge.textContent = status;
    this.statusBadge.className = `panel-status-pill status-${status.toLowerCase()}`;
    this.ttiBadge.textContent = 'INSPECTOR';
    this.ttiBadge.className = 'panel-tti-badge fast';

    if (this.objectTagEl) {
      this.objectTagEl.textContent = `@${podName}`;
    }
    if (this.objectInputEl) {
      this.objectInputEl.placeholder = `Ask @${podName} anything (e.g. "show logs", "triage crash")...`;
    }

    const inspectorCode = `
      const state = reactive({
        podName: ${JSON.stringify(podName)},
        status: ${JSON.stringify(status)},
        namespace: ${JSON.stringify(nsName)},
        cluster: ${JSON.stringify(clusterName)},
        restarts: ${JSON.stringify(pod.restarts ?? (status === 'CrashLoopBackOff' ? 14 : 0))},
        cpu: ${JSON.stringify(pod.cpu_usage || pod.cpu || (status === 'CrashLoopBackOff' ? '980m' : '240m'))},
        memory: ${JSON.stringify(pod.memory_usage || pod.memory || (status === 'CrashLoopBackOff' ? '1.8Gi' : '420Mi'))}
      });

      const triggerPrompt = (promptText) => {
        container.dispatchEvent(new CustomEvent('ephemeris-prompt-query', {
          bubbles: true,
          composed: true,
          detail: {
            prompt: promptText,
            podId: state.podName,
            resourceUri: 'gke://' + state.namespace + '/' + state.podName
          }
        }));
      };

      const template = html\`
        <div class="ephemeris-widget">
          <div class="widget-header">
            <div class="header-main">
              <span class="pod-title">\${() => '🎯 Spatial Object Inspector: ' + state.podName}</span>
              <span class="\${() => 'status-pill status-' + state.status.toLowerCase()}">\${() => state.status}</span>
            </div>
            <div class="header-meta">
              <span>Cluster: \${() => state.cluster} &bull; Namespace: \${() => state.namespace}</span>
            </div>
          </div>

          <div class="metrics-grid">
            <div class="metric-box">
              <span class="metric-box-val">\${() => state.cpu}</span>
              <span class="metric-box-lbl">CPU Allocation</span>
            </div>
            <div class="metric-box">
              <span class="metric-box-val">\${() => state.memory}</span>
              <span class="metric-box-lbl">Memory Usage</span>
            </div>
            <div class="metric-box">
              <span class="metric-box-val">\${() => state.restarts}</span>
              <span class="metric-box-lbl">Container Restarts</span>
            </div>
            <div class="metric-box">
              <span class="metric-box-val">\${() => 'gke://' + state.namespace + '/' + state.podName}</span>
              <span class="metric-box-lbl">MCP Resource URI</span>
            </div>
          </div>

          <div class="diagnosis-card">
            <div class="diagnosis-header">
              <span class="diagnosis-pill">DEDICATED OBJECT CO-PILOT</span>
              <span class="diagnosis-title">Interactive Generative Views for @\${() => state.podName}</span>
            </div>
            <div class="diagnosis-body">
              Select a specialized generative view below or type any natural-language question in the dedicated <strong>@\${() => state.podName}</strong> prompt bar at the bottom of this window.
            </div>
          </div>

          <div class="actions-list">
            <div class="action-card recommended">
              <div class="action-meta">
                <div class="action-name">📋 Live Container Log Stream & Search Console</div>
                <div class="action-detail">Stream and filter container stdout/stderr logs with severity pills and regex search</div>
              </div>
              <button class="remediation-btn primary" @click="\${() => triggerPrompt('Show me the logs for ' + state.podName)}">
                Open Logs
              </button>
            </div>
            <div class="action-card">
              <div class="action-meta">
                <div class="action-name">⚡ Deep AI Root-Cause Triage & Remediation Cockpit</div>
                <div class="action-detail">Synthesize stack-trace diagnosis, blast radius analysis, traffic drain & 1-click rollback</div>
              </div>
              <button class="remediation-btn secondary" @click="\${() => triggerPrompt('Run AI root-cause triage for ' + state.podName)}">
                Launch Triage
              </button>
            </div>
          </div>
        </div>
      \`;
      template(container);
    `;

    this.runtime.execute(inspectorCode, { pod_id: podName });
    this.show();
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

    if (this.objectTagEl) {
      this.objectTagEl.textContent = `@${podId}`;
    }
    if (this.objectInputEl) {
      this.objectInputEl.placeholder = `Ask @${podId} anything (e.g. "show logs", "triage crash")...`;
    }

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
      if (this.objectTagEl) {
        this.objectTagEl.textContent = `@${podId}`;
      }
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
      if (this.footerEl) this.footerEl.style.display = 'none';
      this.minBtn.innerHTML = '&#43;';
      this.panelEl.classList.add('minimized');
    } else {
      this.bodyEl.style.display = 'block';
      if (this.footerEl) this.footerEl.style.display = 'flex';
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
