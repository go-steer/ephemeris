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
          <span class="cluster-name" id="hud-cluster-name">production-cluster [us-central1]</span>
          <div class="stats-counters">
            <span class="stat-badge running" id="hud-stat-running">&bull; 0 Running</span>
            <span class="stat-badge crash" id="hud-stat-crash">&#x2715; 0 Crashing</span>
            <span class="stat-badge pending" id="hud-stat-pending">&#x25B2; 0 Pending</span>
          </div>
        </div>

        <div class="header-actions">
          <button class="hud-btn" id="hud-reset-view-btn" title="Reset 3D Camera">&#x2299; Overview</button>
          <span class="connection-status connected" id="hud-conn-status">LIVE</span>
        </div>
      </header>

      <footer class="hud-bottom-bar">
        <div class="target-context-strip" id="hud-context-strip">
          <span class="context-label">TARGET CONTEXT:</span>
          <span class="context-pod-badge" id="hud-target-badge">None</span>
          <span class="context-uri" id="hud-target-uri">Click any pod in the 3D topology to inspect</span>
        </div>

        <div class="triage-prompt-row">
          <div class="prompt-input-wrapper">
            <span class="prompt-icon">&#x2728;</span>
            <input
              type="text"
              id="hud-prompt-input"
              class="prompt-input"
              placeholder="Ask Gemini: e.g. Why is this crashing? Highlight fatal errors..."
              autocomplete="off"
            />
          </div>
          <button class="investigate-btn" id="hud-investigate-btn">
            <span class="btn-text">Investigate</span>
            <span class="spinner" id="hud-spinner"></span>
          </button>
        </div>

        <div class="quick-chips-row">
          <span class="chips-label">Quick Triage:</span>
          <button class="chip-btn" data-prompt="Why is this crashing? Highlight the fatal errors.">Why is this crashing?</button>
          <button class="chip-btn" data-prompt="Show FATAL stack traces and panic root cause.">Show fatal stack traces</button>
          <button class="chip-btn" data-prompt="Analyze memory pressure, OOM events, and resource limits.">Analyze OOM pressure</button>
          <button class="chip-btn" data-prompt="Summarize recent restart events and termination reasons.">Summarize restart events</button>
        </div>

        <div class="status-notification-line" id="hud-status-line">
          <span class="status-dot"></span>
          <span class="status-msg" id="hud-status-msg">Spatial mesh ready. Select a resource to begin triage.</span>
        </div>
      </footer>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const input = this.container.querySelector('#hud-prompt-input');
    const investBtn = this.container.querySelector('#hud-investigate-btn');
    const resetBtn = this.container.querySelector('#hud-reset-view-btn');

    const submitPrompt = (customText) => {
      const text = customText !== undefined ? customText : input.value.trim();
      if (!text) return;
      if (!this.selectedPod) {
        this.setStatusMessage('Please click a pod in the 3D topology first', false);
        return;
      }
      if (this.onPromptSubmit) {
        this.onPromptSubmit(text, this.selectedPod, this.selectedMeta);
      }
    };

    investBtn.addEventListener('click', () => submitPrompt());

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitPrompt();
      }
    });

    resetBtn.addEventListener('click', () => {
      if (this.onResetView) this.onResetView();
    });

    const chipBtns = this.container.querySelectorAll('.chip-btn');
    chipBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const query = btn.getAttribute('data-prompt');
        input.value = query;
        submitPrompt(query);
      });
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

    const badge = this.container.querySelector('#hud-target-badge');
    const uri = this.container.querySelector('#hud-target-uri');
    const input = this.container.querySelector('#hud-prompt-input');

    if (!pod) {
      if (badge) {
        badge.textContent = 'None';
        badge.className = 'context-pod-badge';
      }
      if (uri) uri.textContent = 'Click any pod in the 3D topology to inspect';
      return;
    }

    const status = pod.status || 'Running';
    if (badge) {
      badge.textContent = `${pod.name} [${status}]`;
      badge.className = `context-pod-badge status-${status.toLowerCase()}`;
    }

    const resourceUri = pod.resource_uri || `gke://${meta.namespaceName || 'default'}/${pod.name}`;
    if (uri) {
      uri.textContent = resourceUri;
    }

    if (status === 'CrashLoopBackOff') {
      input.placeholder = `Ask Gemini: Why is ${pod.name} crashing? Highlight fatal errors...`;
      this.setStatusMessage(
        `Selected ${pod.name} in CrashLoopBackOff. Ready to investigate.`,
        false
      );
    } else {
      input.placeholder = `Ask Gemini: What is the telemetry status of ${pod.name}?`;
      this.setStatusMessage(`Selected ${pod.name} (${status}). Ready to investigate.`, false);
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
