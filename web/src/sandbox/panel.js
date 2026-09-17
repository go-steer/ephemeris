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
  static zIndexCounter = 100;

  /**
   * @param {HTMLElement} container - Root element for the panel (e.g. #panel-container).
   * @param {boolean} [isChild=false] - Whether this panel is a spawned child window.
   * @param {number} [offsetIdx=0] - Spatial stagger offset index for multi-panel layout.
   */
  constructor(container, isChild = false, offsetIdx = 0) {
    this.container = container;
    this.isChild = isChild;
    this.offsetIdx = offsetIdx;
    this.isMinimized = false;
    this.isVisible = false;
    this.isPinned = false;
    this.activeObject = null;
    this._onObjectPromptSubmit = null;
    this._generationTimer = null;
    this._generationStart = 0;
    this._generationSteps = [];
    this._childWindows = [];
    this._activeTargetWindow = this;

    this._createDOM();
    this.runtime = new ArrowSandboxRuntime(this.sandboxHost);
  }

  get onObjectPromptSubmit() {
    return this._onObjectPromptSubmit;
  }

  set onObjectPromptSubmit(fn) {
    this._onObjectPromptSubmit = fn;
    for (const child of this._childWindows) {
      child.onObjectPromptSubmit = fn;
    }
  }

  _getTargetWindow() {
    if (this.isChild) return this;
    this._childWindows = this._childWindows.filter((w) => w.isVisible);

    if (
      this._activeTargetWindow &&
      this._activeTargetWindow.isVisible &&
      !this._activeTargetWindow.isPinned
    ) {
      return this._activeTargetWindow;
    }
    if (this.isVisible && !this.isPinned) {
      this._activeTargetWindow = this;
      return this;
    }
    for (const w of this._childWindows) {
      if (w.isVisible && !w.isPinned) {
        this._activeTargetWindow = w;
        return w;
      }
    }
    if (!this.isVisible) {
      this.isPinned = false;
      if (this.pinBtn) this.pinBtn.classList.remove('active');
      this.panelEl.classList.remove('pinned-panel');
      this._activeTargetWindow = this;
      return this;
    }

    // All visible windows are pinned -> spawn a new draggable floating panel window
    const offsetIdx = (this._childWindows.length + 1) % 5;
    const child = new IncidentPanel(this.container, true, offsetIdx);
    child.onObjectPromptSubmit = this._onObjectPromptSubmit;
    this._childWindows.push(child);
    this._activeTargetWindow = child;
    return child;
  }

  bringToFront() {
    this.panelEl.style.zIndex = String(++IncidentPanel.zIndexCounter);
  }

  togglePin() {
    this.isPinned = !this.isPinned;
    if (this.pinBtn) {
      this.pinBtn.classList.toggle('active', this.isPinned);
      this.pinBtn.title = this.isPinned
        ? 'Pinned — next query will open a new window (click to unpin)'
        : 'Pin panel (keep open when running next query)';
    }
    this.panelEl.classList.toggle('pinned-panel', this.isPinned);
  }

  _createDOM() {
    this.panelEl = document.createElement('div');
    this.panelEl.className = 'floating-panel';
    this.panelEl.style.display = 'none';
    if (this.offsetIdx > 0) {
      this.panelEl.style.right = `${24 + this.offsetIdx * 28}px`;
      this.panelEl.style.top = `${72 + this.offsetIdx * 28}px`;
    }
    this.panelEl.addEventListener('pointerdown', () => this.bringToFront());

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

    this.pinBtn = document.createElement('button');
    this.pinBtn.className = 'panel-control-btn pin';
    this.pinBtn.innerHTML = '📌';
    this.pinBtn.title = 'Pin panel (keep open when running next query)';
    this.pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePin();
    });

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

    this.controlsArea.appendChild(this.pinBtn);
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
  _stopGenerationTimer() {
    if (this._generationTimer) {
      clearInterval(this._generationTimer);
      this._generationTimer = null;
    }
  }

  _renderGenerationStepper() {
    const stepsHtml = this._generationSteps
      .map((step, idx) => {
        const isLast = idx === this._generationSteps.length - 1;
        return `
          <div class="step-item ${isLast ? 'active' : 'done'}">
            <span class="step-num">${isLast ? '<span class="spinner-inline"></span>' : '✓'}</span>
            <span class="step-text">${step}</span>
          </div>
        `;
      })
      .join('');

    this.runtime.container.innerHTML = `
      <div class="ephemeris-widget streaming-skeleton">
        <div class="remediation-in-progress">
          <div class="progress-title">
            <span class="spinner-inline"></span>
            <span>Gemini 3.8 Flash Live Synthesis & MCP Execution</span>
          </div>
          <div class="stepper-list">
            ${stepsHtml}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Immediately clear the unpinned sandbox at t = 0ms and start the live synthesis stepper & timer.
   * If all visible panels are pinned (📌), spawns a new draggable floating panel window.
   *
   * @param {string} title - Title for the panel header.
   * @param {string} initialMessage - Initial synthesis step description.
   */
  startGeneration(
    title = 'Synthesizing UI...',
    initialMessage = 'Routing intent via gemini-3.8-flash...'
  ) {
    const win = this._getTargetWindow();
    if (win !== this) {
      return win.startGeneration(title, initialMessage);
    }

    this._stopGenerationTimer();
    this.runtime.clear(); // Immediate t = 0ms sandbox wipe!

    this.titleText.textContent = title;
    this.statusBadge.textContent = 'STREAMING';
    this.statusBadge.className = 'panel-status-pill status-pending';
    this._generationStart = performance.now();
    this.ttiBadge.textContent = 'TTI: LIVE...';
    this.ttiBadge.className = 'panel-tti-badge';

    if (this.objectTagEl) {
      this.objectTagEl.textContent = `@${title}`;
    }

    this._generationSteps = [initialMessage];
    this._renderGenerationStepper();
    this.show();
    this.bringToFront();

    this._generationTimer = setInterval(() => {
      const elapsed = ((performance.now() - this._generationStart) / 1000).toFixed(1);
      this.ttiBadge.textContent = `TTI: ${elapsed}s...`;
    }, 100);
  }

  /**
   * Append a live progressive step from WebSocket status updates without re-compiling ArrowJS.
   *
   * @param {string} message - Status message from backend orchestrator.
   */
  appendGenerationStep(message) {
    const win = this.isChild ? this : this._activeTargetWindow || this;
    if (win !== this) {
      return win.appendGenerationStep(message);
    }
    if (!message) return;
    if (this._generationSteps.length === 0) {
      this.startGeneration(this.titleText.textContent || 'Synthesizing UI...', message);
      return;
    }
    if (this._generationSteps[this._generationSteps.length - 1] !== message) {
      this._generationSteps.push(message);
    }
    this._renderGenerationStepper();
  }

  /**
   * Open the floating Object Chat & Inspector window immediately when a 3D pod is clicked.
   *
   * @param {object} pod - Selected 3D pod object { id, name, status, restarts, cpu, memory }.
   * @param {object} meta - Cluster/namespace metadata { clusterName, namespaceName }.
   */
  openObjectInspector(pod, meta = {}) {
    if (!pod) return;
    const win = this._getTargetWindow();
    if (win !== this) {
      return win.openObjectInspector(pod, meta);
    }

    this._stopGenerationTimer();
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
    this.bringToFront();
  }

  _setupDragging() {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onPointerDown = (e) => {
      if (e.target.closest('.panel-control-btn')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.panelEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

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
    const win = this.isChild ? this : this._activeTargetWindow || this._getTargetWindow();
    if (win !== this) {
      return win.mount(code, telemetry, meta);
    }

    this._stopGenerationTimer();
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
    this.bringToFront();
  }

  /**
   * Display live progressive streaming indicator while Gemini is synthesizing the ArrowJS UI.
   *
   * @param {string} statusMessage - Current streaming/reasoning step message.
   * @param {string} podId - Target pod name.
   */
  showStreamingProgress(statusMessage, podId = 'Pod') {
    const win = this.isChild ? this : this._activeTargetWindow || this._getTargetWindow();
    if (win !== this) {
      return win.showStreamingProgress(statusMessage, podId);
    }
    if (!this._generationTimer && this._generationSteps.length === 0) {
      this.startGeneration(podId, statusMessage);
      return;
    }
    if (podId) {
      this.titleText.textContent = podId;
      if (this.objectTagEl) {
        this.objectTagEl.textContent = `@${podId}`;
      }
    }
    this.appendGenerationStep(statusMessage);
  }

  show() {
    this.panelEl.style.display = 'flex';
    this.isVisible = true;
    if (this.isMinimized) {
      this.toggleMinimize();
    }
  }

  hide() {
    this._stopGenerationTimer();
    this.panelEl.style.display = 'none';
    this.isVisible = false;
    this.isPinned = false;
    if (this.pinBtn) this.pinBtn.classList.remove('active');
    this.panelEl.classList.remove('pinned-panel');
    if (this.isChild && this.panelEl.parentNode) {
      this.panelEl.parentNode.removeChild(this.panelEl);
    }
    if (!this.isChild) {
      for (const child of this._childWindows) {
        child.hide();
      }
      this._childWindows = [];
      this._activeTargetWindow = this;
    }
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
    this._stopGenerationTimer();
    this.runtime.clear();
    this.titleText.textContent = 'Ephemeral Incident Triage';
    this.statusBadge.textContent = 'READY';
    this.ttiBadge.textContent = 'TTI: --';
  }
}
