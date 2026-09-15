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

/**
 * HUDOverlay manages the top cluster status bar, bottom incident triage bar,
 * quick action chips, and context indicators.
 */
export class HUDOverlay {
  /**
   * @param {HTMLElement} container - Host container element (e.g. #hud-container).
   */
  constructor(container) {
    this.container = container;
    this.selectedPod = null;
    this.selectedMeta = null;

    // Callbacks
    this.onPromptSubmit = null;
    this.onResetView = null;
    this.onResetIncident = null;
    this.onClusterSelect = null;
    this.onClearSelection = null;

    this._createDOM();
  }

  _createDOM() {
    this.container.innerHTML = `
      <header class="hud-top-bar">
        <div class="brand-group">
          <div class="logo-mark">
            <span class="logo-icon">&#x25C7;</span>
            <span class="logo-title">EPHEMERIS</span>
          </div>
          <span class="brand-divider">/</span>
          <span class="brand-sub">Generative Spatial Observability</span>
        </div>

        <div class="cluster-summary">
          <div class="cluster-select-wrapper">
            <span class="cluster-select-icon">&#x1F310;</span>
            <select id="hud-cluster-select" class="cluster-select-dropdown" aria-label="Select GKE Cluster">
              <option value="production-us-central1">production-us-central1 [us-central1] (1 Alert)</option>
            </select>
          </div>
          <div class="stats-counters">
            <span class="stat-badge running" id="hud-stat-running">&bull; 0 Running</span>
            <span class="stat-badge crash" id="hud-stat-crash">&#x2715; 0 Crashing</span>
            <span class="stat-badge pending" id="hud-stat-pending">&#x25B2; 0 Pending</span>
          </div>
        </div>

        <div class="header-actions">
          <div class="camera-mode-toggle" id="hud-camera-toggle">
            <button class="mode-btn active" id="hud-btn-mode-orbit" title="Orbit (Rotate) around cluster or target">🔄 Orbit</button>
            <button class="mode-btn" id="hud-btn-mode-pan" title="Pan (Move) camera focus left/right, up/down (or hold Shift / Space)">✋ Pan</button>
          </div>
          <button class="hud-btn reset-incident-btn" id="hud-reset-incident-btn" title="Reset Demo Incident State (Restore CrashLoopBackOff)">&#x1F504; Reset Incident</button>
          <button class="hud-btn" id="hud-reset-view-btn" title="Reset 3D Camera Overview">&#x2299; Overview</button>
          <span class="connection-status connected" id="hud-conn-status">LIVE</span>
        </div>
      </header>

      <footer class="hud-bottom-bar">
        <div class="target-context-strip" id="hud-context-strip">
          <span class="context-label" id="hud-context-label">🌐 PROMPT CONTEXT:</span>
          <span class="context-pod-badge" id="hud-target-badge">Cluster-Wide Mesh</span>
          <div class="context-inclusion-group hidden" id="hud-context-inclusions">
            <span class="context-inclusion-tag">📋 Live Logs</span>
            <span class="context-inclusion-tag">📊 Metrics</span>
            <span class="context-inclusion-tag">🕸️ Blast Radius</span>
          </div>
          <span class="context-uri" id="hud-target-uri">Click any 3D resource to attach its live logs & metrics to your prompt</span>
          <button class="context-detach-btn hidden" id="hud-detach-btn" title="Detach resource from prompt context (Esc)">&#x2715; Detach</button>
        </div>

        <div class="triage-prompt-row">
          <div class="prompt-input-wrapper" id="hud-input-wrapper">
            <span class="prompt-icon">&#x2728;</span>
            <div class="prompt-context-pill hidden" id="hud-prompt-chip" title="Attached to AI prompt context (click × or press Esc to detach)">
              <span class="pill-at">@</span>
              <span class="pill-name" id="hud-chip-name">payment-service</span>
              <button class="pill-remove-btn" id="hud-chip-remove" title="Remove from prompt context" aria-label="Remove context">&times;</button>
            </div>
            <input
              type="text"
              id="hud-prompt-input"
              class="prompt-input"
              placeholder="Ask Gemini or press [⏎ Enter] to run incident triage across clusters..."
              autocomplete="off"
            />
          </div>
          <button class="investigate-btn" id="hud-investigate-btn" title="Run AI Incident Triage (Enter)">
            <span class="btn-icon">⚡</span>
            <span class="btn-text">Run AI Triage</span>
            <kbd class="btn-kbd">⏎ Enter</kbd>
            <span class="spinner" id="hud-spinner"></span>
          </button>
        </div>

        <div class="quick-chips-row">
          <span class="chips-label">Quick Actions:</span>
          <button class="chip-btn" data-prompt="Triage incident, identify panic root cause, and execute 1-click rollback.">⚡ 1-Click Triage & Fix</button>
          <button class="chip-btn" data-prompt="Analyze stack trace, uninitialized DB pool references, and panic origin.">🔍 Root Cause Analysis</button>
          <button class="chip-btn" data-prompt="Evaluate upstream checkout-service blast radius and HTTP 500 error rates.">💥 Evaluate Blast Radius</button>
          <button class="chip-btn" data-prompt="Analyze memory pressure, OOM events, and container resource limits.">📦 Memory & OOM Pressure</button>
        </div>

        <div class="status-notification-line" id="hud-status-line">
          <span class="status-dot"></span>
          <span class="status-msg" id="hud-status-msg">Spatial mesh ready. Select a resource or submit a prompt to begin triage.</span>
        </div>
      </footer>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const input = this.container.querySelector('#hud-prompt-input');
    const investBtn = this.container.querySelector('#hud-investigate-btn');
    const resetBtn = this.container.querySelector('#hud-reset-view-btn');
    const resetIncidentBtn = this.container.querySelector('#hud-reset-incident-btn');
    const clusterSelect = this.container.querySelector('#hud-cluster-select');
    const btnOrbit = this.container.querySelector('#hud-btn-mode-orbit');
    const btnPan = this.container.querySelector('#hud-btn-mode-pan');
    const chipRemoveBtn = this.container.querySelector('#hud-chip-remove');
    const detachBtn = this.container.querySelector('#hud-detach-btn');

    const clearSelectionHandler = (e) => {
      e?.stopPropagation();
      this.setSelectedPod(null);
      if (this.onClearSelection) {
        this.onClearSelection();
      }
    };

    chipRemoveBtn?.addEventListener('click', clearSelectionHandler);
    detachBtn?.addEventListener('click', clearSelectionHandler);

    btnOrbit?.addEventListener('click', () => {
      btnOrbit.classList.add('active');
      btnPan?.classList.remove('active');
      if (this.onCameraModeChange) this.onCameraModeChange('orbit');
    });

    btnPan?.addEventListener('click', () => {
      btnPan.classList.add('active');
      btnOrbit?.classList.remove('active');
      if (this.onCameraModeChange) this.onCameraModeChange('pan');
    });

    const submitPrompt = (customText) => {
      const text = customText !== undefined ? customText : input.value.trim();
      if (!text) return;
      if (this.onPromptSubmit) {
        this.onPromptSubmit(text, this.selectedPod, this.selectedMeta);
      }
    };

    investBtn.addEventListener('click', () => submitPrompt());

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitPrompt();
      } else if (e.key === 'Escape' && this.selectedPod) {
        e.preventDefault();
        clearSelectionHandler();
      } else if (e.key === 'Backspace' && input.value === '' && this.selectedPod) {
        e.preventDefault();
        clearSelectionHandler();
      }
    });

    resetBtn.addEventListener('click', () => {
      if (this.onResetView) this.onResetView();
    });

    resetIncidentBtn?.addEventListener('click', () => {
      if (this.onResetIncident) this.onResetIncident();
    });

    if (clusterSelect) {
      clusterSelect.addEventListener('change', (e) => {
        if (this.onClusterSelect) {
          this.onClusterSelect(e.target.value);
        }
      });
    }

    const chipBtns = this.container.querySelectorAll('.chip-btn');
    chipBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const query = btn.getAttribute('data-prompt');
        input.value = query;
        submitPrompt(query);
      });
    });
  }

  setClusters(clusters = [], activeClusterName = '') {
    const select = this.container.querySelector('#hud-cluster-select');
    if (!select || clusters.length === 0) return;

    select.innerHTML = '';

    const overviewOpt = document.createElement('option');
    overviewOpt.value = '__overview__';
    overviewOpt.textContent = `🌐 Multi-Cluster Overview (${clusters.length} Clusters)`;
    if (activeClusterName === '__overview__') {
      overviewOpt.selected = true;
    }
    select.appendChild(overviewOpt);

    clusters.forEach((c) => {
      let alerts = 0;
      (c.namespaces || []).forEach((ns) => {
        (ns.pods || []).forEach((p) => {
          if (p.status === 'CrashLoopBackOff' || p.status === 'Failed') alerts++;
        });
      });

      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = `${c.name} [${c.location || 'global'}] ${alerts > 0 ? `(${alerts} Alert)` : '(Healthy)'}`;
      if (c.name === activeClusterName) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  }

  setClusterInfo(clusterName, location = 'us-central1') {
    const el = this.container.querySelector('#hud-cluster-name');
    if (el) el.textContent = `${clusterName} [${location}]`;
  }

  setPodStats(running = 0, crash = 0, pending = 0) {
    const rEl = this.container.querySelector('#hud-stat-running');
    const cEl = this.container.querySelector('#hud-stat-crash');
    const pEl = this.container.querySelector('#hud-stat-pending');

    if (rEl) rEl.innerHTML = `&bull; ${running} Running`;
    if (cEl) cEl.innerHTML = `&#x2715; ${crash} Crashing`;
    if (pEl) pEl.innerHTML = `&#x25B2; ${pending} Pending`;
  }

  setSelectedPod(pod, meta = {}) {
    this.selectedPod = pod;
    this.selectedMeta = meta;

    const label = this.container.querySelector('#hud-context-label');
    const badge = this.container.querySelector('#hud-target-badge');
    const inclusions = this.container.querySelector('#hud-context-inclusions');
    const uri = this.container.querySelector('#hud-target-uri');
    const detachBtn = this.container.querySelector('#hud-detach-btn');
    const inputWrapper = this.container.querySelector('#hud-input-wrapper');
    const promptChip = this.container.querySelector('#hud-prompt-chip');
    const chipName = this.container.querySelector('#hud-chip-name');
    const input = this.container.querySelector('#hud-prompt-input');

    if (!pod) {
      if (label) label.textContent = '🌐 PROMPT CONTEXT:';
      if (badge) {
        badge.textContent = 'Cluster-Wide Mesh';
        badge.className = 'context-pod-badge';
      }
      if (inclusions) inclusions.classList.add('hidden');
      if (detachBtn) detachBtn.classList.add('hidden');
      if (uri) {
        uri.textContent = 'Click any 3D resource to attach its live logs & metrics to your prompt';
      }
      if (promptChip) {
        promptChip.className = 'prompt-context-pill hidden';
      }
      if (inputWrapper) {
        inputWrapper.className = 'prompt-input-wrapper';
      }
      if (input) {
        input.placeholder =
          'Ask Gemini or press [⏎ Enter] to run incident triage across clusters...';
      }
      return;
    }

    const status = pod.status || 'Running';
    const statusLower = status.toLowerCase();

    if (label) label.textContent = '📌 ATTACHED TO PROMPT:';
    if (badge) {
      badge.textContent = `${pod.name} [${status}]`;
      badge.className = `context-pod-badge status-${statusLower}`;
    }
    if (inclusions) inclusions.classList.remove('hidden');
    if (detachBtn) detachBtn.classList.remove('hidden');

    const resourceUri = pod.resource_uri || `gke://${meta.namespaceName || 'default'}/${pod.name}`;
    if (uri) {
      uri.textContent = resourceUri;
    }

    if (promptChip && chipName) {
      chipName.textContent = pod.name;
      promptChip.className = `prompt-context-pill status-${statusLower} pulse-in`;
    }

    if (inputWrapper) {
      inputWrapper.className = `prompt-input-wrapper has-context status-${statusLower}`;
    }

    if (input) {
      if (status === 'CrashLoopBackOff' || status === 'Failed') {
        input.placeholder = `Why is ${pod.name} crashing? Highlight fatal errors...`;
        this.setStatusMessage(
          `Attached @${pod.name} (${status}) to prompt context with live logs & blast radius.`,
          false
        );
      } else {
        input.placeholder = `What is the telemetry status of ${pod.name}?`;
        this.setStatusMessage(`Attached @${pod.name} (${status}) to prompt context.`, false);
      }
    }
  }

  setStatusMessage(msg, isLoading = false) {
    const textEl = this.container.querySelector('#hud-status-msg');
    const spinner = this.container.querySelector('#hud-spinner');
    const investBtn = this.container.querySelector('#hud-investigate-btn');

    if (textEl) textEl.textContent = msg;

    if (spinner && investBtn) {
      if (isLoading) {
        spinner.style.display = 'inline-block';
        investBtn.classList.add('loading');
        investBtn.disabled = true;
      } else {
        spinner.style.display = 'none';
        investBtn.classList.remove('loading');
        investBtn.disabled = false;
      }
    }
  }

  setConnectionState(state) {
    const el = this.container.querySelector('#hud-conn-status');
    if (!el) return;

    if (state === 'connected') {
      el.textContent = 'LIVE';
      el.className = 'connection-status connected';
    } else if (state === 'connecting') {
      el.textContent = 'CONNECTING';
      el.className = 'connection-status connecting';
    } else {
      el.textContent = 'DISCONNECTED';
      el.className = 'connection-status disconnected';
    }
  }
}
