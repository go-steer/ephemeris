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

import { html, reactive } from '@arrow-js/core';

const SHADOW_CSS = `
:host {
  display: block;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  color: #e6edf3;
  box-sizing: border-box;
}

*, *::before, *::after {
  box-sizing: inherit;
}

.ephemeris-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0, 229, 255, 0.2);
}

.title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.resource-title {
  font-weight: 700;
  font-size: 14px;
  color: #00e5ff;
  letter-spacing: 0.5px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge.status-running {
  background: rgba(0, 255, 136, 0.15);
  color: #00ff88;
  border: 1px solid rgba(0, 255, 136, 0.4);
}

.badge.status-crashloopbackoff,
.badge.status-failed {
  background: rgba(255, 0, 85, 0.2);
  color: #ff0055;
  border: 1px solid rgba(255, 0, 85, 0.5);
  animation: pulse-badge 1.8s infinite ease-in-out;
}

.badge.status-pending {
  background: rgba(255, 170, 0, 0.15);
  color: #ffaa00;
  border: 1px solid rgba(255, 170, 0, 0.4);
}

@keyframes pulse-badge {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; box-shadow: 0 0 10px rgba(255, 0, 85, 0.6); }
}

.stats-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.stat-chip {
  background: rgba(18, 26, 40, 0.8);
  border: 1px solid rgba(0, 229, 255, 0.2);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #8b949e;
}

.stat-chip strong {
  color: #e6edf3;
  margin-left: 3px;
}

.filter-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-buttons {
  display: flex;
  gap: 4px;
}

.btn {
  background: rgba(18, 26, 40, 0.8);
  color: #8b949e;
  border: 1px solid rgba(139, 148, 158, 0.3);
  padding: 4px 9px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn:hover {
  border-color: #00e5ff;
  color: #00e5ff;
}

.btn.active {
  background: rgba(0, 229, 255, 0.2);
  border-color: #00e5ff;
  color: #00e5ff;
  font-weight: 700;
}

.btn.active.fatal {
  background: rgba(255, 0, 85, 0.25);
  border-color: #ff0055;
  color: #ff0055;
}

.btn.active.error {
  background: rgba(255, 51, 51, 0.25);
  border-color: #ff3333;
  color: #ff3333;
}

.btn.active.warning {
  background: rgba(255, 170, 0, 0.25);
  border-color: #ffaa00;
  color: #ffaa00;
}

.btn.active.info {
  background: rgba(0, 229, 255, 0.25);
  border-color: #00e5ff;
  color: #00e5ff;
}

.search-input {
  flex: 1;
  min-width: 140px;
  background: rgba(10, 14, 22, 0.8);
  border: 1px solid rgba(0, 229, 255, 0.25);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  color: #e6edf3;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: #00e5ff;
  box-shadow: 0 0 6px rgba(0, 229, 255, 0.3);
}

.log-container {
  flex: 1;
  overflow-y: auto;
  min-height: 180px;
  max-height: 420px;
  background: rgba(7, 10, 16, 0.75);
  border: 1px solid rgba(0, 229, 255, 0.15);
  border-radius: 4px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.log-container::-webkit-scrollbar {
  width: 6px;
}

.log-container::-webkit-scrollbar-thumb {
  background: rgba(0, 229, 255, 0.3);
  border-radius: 3px;
}

.log-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 3px;
  font-size: 11.5px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: pointer;
  transition: background 0.1s;
}

.log-row:hover {
  background: rgba(0, 229, 255, 0.08);
}

.log-row.selected {
  background: rgba(0, 229, 255, 0.16);
  border-left: 3px solid #00e5ff;
}

.log-time {
  color: #6e7681;
  flex-shrink: 0;
}

.log-sev {
  font-weight: 700;
  flex-shrink: 0;
}

.log-row.fatal .log-sev {
  color: #ff0055;
}

.log-row.fatal .log-msg {
  color: #ff6699;
}

.log-row.error .log-sev {
  color: #ff3333;
}

.log-row.error .log-msg {
  color: #ff9999;
}

.log-row.warning .log-sev {
  color: #ffaa00;
}

.log-row.warning .log-msg {
  color: #ffd480;
}

.log-row.info .log-sev {
  color: #00e5ff;
}

.log-row.info .log-msg {
  color: #cceeff;
}

.log-msg {
  flex: 1;
}

.empty-state {
  color: #8b949e;
  text-align: center;
  padding: 24px;
  font-style: italic;
}

.diagnostic-error {
  padding: 12px;
  background: rgba(255, 0, 85, 0.15);
  border: 1px solid #ff0055;
  border-radius: 6px;
  color: #ff99aa;
}

.diagnostic-error h4 {
  margin: 0 0 6px 0;
  color: #ff0055;
}
`;

/**
 * Sandboxed ArrowJS runtime.
 * Mounts code inside an isolated ShadowRoot with masked globals.
 */
export class ArrowSandboxRuntime {
  /**
   * @param {HTMLElement} hostElement - Host element to attach the ShadowRoot.
   */
  constructor(hostElement) {
    this.hostElement = hostElement;
    this.shadowRoot = hostElement.shadowRoot || hostElement.attachShadow({ mode: 'open' });
    this._injectStyles();

    this.container = document.createElement('div');
    this.container.className = 'sandbox-mount';
    this.shadowRoot.appendChild(this.container);
  }

  _injectStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = SHADOW_CSS;
    this.shadowRoot.appendChild(styleEl);
  }

  /**
   * Execute and render generated ArrowJS code within the isolated sandbox.
   *
   * @param {string} code - The ArrowJS code string.
   * @param {object} telemetry - Telemetry data bound to the component.
   * @returns {{ success: boolean, error?: string }}
   */
  execute(code, telemetry = {}) {
    // Clear previously mounted DOM
    this.container.innerHTML = '';

    try {
      let sanitizedCode = (code || '').trim();

      // Strip markdown code fences if model enclosed response in them
      if (sanitizedCode.startsWith('```')) {
        sanitizedCode = sanitizedCode
          .replace(/^```(?:javascript|js)?\s*\n?/i, '')
          .replace(/\n?```\s*$/, '');
      }

      // If template(container) was omitted, auto-mount if template is defined
      if (!sanitizedCode.includes('(container)') && sanitizedCode.includes('template')) {
        sanitizedCode += '\nif (typeof template === "function") { template(container); }';
      }

      // Build safe execution function with browser globals shadowed to undefined
      const sandboxFn = new Function(
        'html',
        'reactive',
        'data',
        'container',
        'window',
        'document',
        'localStorage',
        'sessionStorage',
        'fetch',
        'XMLHttpRequest',
        'WebSocket',
        'alert',
        'prompt',
        'confirm',
        'navigator',
        'location',
        `"use strict";\n${sanitizedCode}`
      );

      // Execute safely
      sandboxFn(
        html,
        reactive,
        telemetry,
        this.container,
        undefined, // window
        undefined, // document
        undefined, // localStorage
        undefined, // sessionStorage
        undefined, // fetch
        undefined, // XMLHttpRequest
        undefined, // WebSocket
        undefined, // alert
        undefined, // prompt
        undefined, // confirm
        undefined, // navigator
        undefined // location
      );

      return { success: true };
    } catch (err) {
      console.error('ArrowJS execution error in sandbox:', err);
      this._renderDiagnosticError(err, telemetry);
      return { success: false, error: err.message };
    }
  }

  _renderDiagnosticError(error, telemetry) {
    const errorBox = document.createElement('div');
    errorBox.className = 'diagnostic-error';
    errorBox.innerHTML = `
      <h4>Sandbox Execution Error</h4>
      <p>${error.message}</p>
      <details>
        <summary style="cursor: pointer; color: #00e5ff;">View Raw Telemetry</summary>
        <pre style="margin-top: 8px; font-size: 11px; overflow-x: auto; color: #8b949e;">${JSON.stringify(telemetry, null, 2)}</pre>
      </details>
    `;
    this.container.appendChild(errorBox);
  }

  clear() {
    this.container.innerHTML = '';
  }
}
