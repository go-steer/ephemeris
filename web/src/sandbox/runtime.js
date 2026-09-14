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
  font-family: "Google Sans", Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", monospace;
  font-size: 13px;
  color: #e8eaed;
  box-sizing: border-box;
}

*, *::before, *::after {
  box-sizing: inherit;
}

.ephemeris-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 10px;
}

.hidden {
  display: none !important;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #252e42;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.resource-title {
  font-weight: 700;
  font-size: 14px;
  color: #4285f4;
  letter-spacing: 0.3px;
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
  background: rgba(52, 168, 83, 0.15);
  color: #34a853;
  border: 1px solid rgba(52, 168, 83, 0.5);
}

.badge.status-crashloopbackoff,
.badge.status-failed {
  background: rgba(234, 67, 53, 0.18);
  color: #ea4335;
  border: 1px solid rgba(234, 67, 53, 0.6);
  animation: pulse-badge 1.8s infinite ease-in-out;
}

.badge.status-pending {
  background: rgba(251, 188, 4, 0.15);
  color: #fbbc04;
  border: 1px solid rgba(251, 188, 4, 0.5);
}

@keyframes pulse-badge {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; box-shadow: 0 0 8px rgba(234, 67, 53, 0.6); }
}

.stats-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.stat-chip {
  background: #1b2234;
  border: 1px solid #252e42;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #9aa0a6;
}

.stat-chip strong {
  color: #e8eaed;
  margin-left: 3px;
}

/* NAVIGATION TABS */
.nav-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid #252e42;
  padding-bottom: 4px;
}

.tab-btn {
  background: transparent;
  color: #9aa0a6;
  border: none;
  padding: 6px 12px;
  border-radius: 4px 4px 0 0;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.tab-btn:hover {
  color: #e8eaed;
  background: #1b2234;
}

.tab-btn.active {
  color: #4285f4;
  background: #1b2234;
  border-bottom: 2px solid #4285f4;
}

/* TRIAGE VIEW & RCA */
.triage-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  max-height: 480px;
  padding-right: 4px;
}

.diagnosis-card {
  background: #121826;
  border: 1px solid #394663;
  border-left: 4px solid #ea4335;
  border-radius: 6px;
  padding: 10px 12px;
}

.diagnosis-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.diagnosis-pill {
  background: rgba(234, 67, 53, 0.2);
  color: #ea4335;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  letter-spacing: 0.5px;
}

.diagnosis-title {
  font-weight: 600;
  color: #e8eaed;
  font-size: 13px;
}

.diagnosis-body {
  font-size: 12px;
  line-height: 1.5;
  color: #bdc1c6;
}

.diagnosis-body code {
  background: #1b2234;
  color: #ea4335;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: monospace;
}

.code-evidence {
  background: #0b0f19;
  border: 1px solid #252e42;
  padding: 6px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 11px;
  color: #ea4335;
  margin-top: 8px;
  white-space: pre-wrap;
  word-break: break-all;
}

.blast-radius-card {
  background: #181611;
  border: 1px solid #394663;
  border-left: 4px solid #fbbc04;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: #e8eaed;
  line-height: 1.4;
}

.blast-title {
  font-weight: 700;
  color: #fbbc04;
  margin-bottom: 4px;
}

/* TRAFFIC DRAIN CONTROL */
.drain-card {
  background: #151a28;
  border: 1px solid #252e42;
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drain-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drain-title {
  font-weight: 600;
  color: #e8eaed;
  font-size: 12.5px;
}

.drain-badge {
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.4px;
}

.drain-badge.full {
  background: rgba(52, 168, 83, 0.15);
  color: #34a853;
  border: 1px solid rgba(52, 168, 83, 0.4);
}

.drain-badge.draining {
  background: rgba(251, 188, 4, 0.18);
  color: #fbbc04;
  border: 1px solid rgba(251, 188, 4, 0.5);
  animation: pulse-badge 1.5s infinite ease-in-out;
}

.drain-slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drain-slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: #252e42;
  border-radius: 3px;
  outline: none;
  accent-color: #4285f4;
  cursor: pointer;
}

.drain-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #4285f4;
  cursor: pointer;
  box-shadow: 0 0 6px rgba(66, 133, 244, 0.6);
}

.drain-btn {
  background: #1b2234;
  color: #9aa0a6;
  border: 1px solid #252e42;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
  white-space: nowrap;
}

.drain-btn:hover {
  border-color: #4285f4;
  color: #e8eaed;
  background: #252e42;
}

.drain-hint {
  font-size: 11px;
  color: #9aa0a6;
  line-height: 1.3;
}

.health-card {
  background: #111b15;
  border: 1px solid #394663;
  border-left: 4px solid #34a853;
  border-radius: 6px;
  padding: 10px 12px;
}

.health-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.health-pill {
  background: rgba(52, 168, 83, 0.2);
  color: #34a853;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  letter-spacing: 0.5px;
}

.health-title {
  font-weight: 600;
  color: #e8eaed;
  font-size: 13px;
}

.health-body {
  font-size: 12px;
  line-height: 1.5;
  color: #bdc1c6;
}

.pending-card {
  background: #1b1911;
  border: 1px solid #394663;
  border-left: 4px solid #fbbc04;
  border-radius: 6px;
  padding: 10px 12px;
}

.pending-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.pending-pill {
  background: rgba(251, 188, 4, 0.2);
  color: #fbbc04;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  letter-spacing: 0.5px;
}

.pending-title {
  font-weight: 600;
  color: #e8eaed;
  font-size: 13px;
}

.pending-body {
  font-size: 12px;
  line-height: 1.5;
  color: #bdc1c6;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin: 4px 0;
}

.metric-box {
  background: #1b2234;
  border: 1px solid #252e42;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-box-val {
  font-size: 14px;
  font-weight: 700;
  color: #4285f4;
  font-family: monospace;
}

.metric-box-lbl {
  font-size: 10.5px;
  color: #9aa0a6;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.remediation-header {
  font-size: 11px;
  font-weight: 700;
  color: #4285f4;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 2px;
}

.actions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-card {
  background: #121826;
  border: 1px solid #252e42;
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  transition: border-color 0.15s;
}

.action-card.recommended {
  border-color: #4285f4;
  background: rgba(66, 133, 244, 0.08);
}

.action-meta {
  flex: 1;
}

.action-badge-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 4px;
}

.rec-badge {
  background: linear-gradient(90deg, #4285f4 0%, #24c1e0 50%, #a142f4 100%);
  color: #ffffff;
  font-size: 9.5px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 0.4px;
}

.rec-est {
  font-size: 11px;
  color: #9aa0a6;
}

.action-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #e8eaed;
}

.action-detail {
  font-size: 11px;
  color: #9aa0a6;
  margin-top: 2px;
  line-height: 1.35;
}

.remediation-btn {
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  padding: 7px 12px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  border: none;
}

.remediation-btn.primary {
  background: #4285f4;
  color: #ffffff;
}

.remediation-btn.primary:hover {
  background: #5a95f5;
}

.remediation-btn.secondary {
  background: #1b2234;
  color: #e8eaed;
  border: 1px solid #394663;
}

.remediation-btn.secondary:hover {
  background: #252e42;
}

/* REMEDIATION IN PROGRESS */
.remediation-in-progress {
  background: #121826;
  border: 1px solid #4285f4;
  border-radius: 6px;
  padding: 14px;
}

.progress-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #4285f4;
  margin-bottom: 12px;
}

.spinner-inline {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(66, 133, 244, 0.3);
  border-top-color: #4285f4;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.stepper-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #9aa0a6;
  font-size: 12px;
}

.step-item.done {
  color: #34a853;
}

.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #252e42;
  color: #e8eaed;
  font-size: 10px;
  font-weight: 700;
}

.step-item.done .step-num {
  background: #34a853;
  color: #0b0f19;
}

/* SUCCESS BANNER */
.remediation-success-banner {
  background: rgba(52, 168, 83, 0.12);
  border: 1px solid #34a853;
  border-radius: 6px;
  padding: 14px;
}

.success-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #34a853;
  font-weight: 700;
  font-size: 13.5px;
  margin-bottom: 6px;
}

.success-icon {
  background: #34a853;
  color: #0b0f19;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}

.success-desc {
  color: #e8eaed;
  font-size: 12px;
  line-height: 1.45;
}

.success-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.btn-action {
  font-family: inherit;
  padding: 5px 12px;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.btn-action.primary {
  background: #34a853;
  color: #0b0f19;
  border: none;
}

.btn-action.outline {
  background: transparent;
  color: #4285f4;
  border: 1px solid #4285f4;
}

/* LOGS TAB & CONTROLS */
.logs-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  background: #1b2234;
  color: #9aa0a6;
  border: 1px solid #252e42;
  padding: 4px 9px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn:hover {
  border-color: #4285f4;
  color: #4285f4;
}

.btn.active {
  background: rgba(66, 133, 244, 0.2);
  border-color: #4285f4;
  color: #4285f4;
  font-weight: 700;
}

.btn.active.fatal {
  background: rgba(234, 67, 53, 0.25);
  border-color: #ea4335;
  color: #ea4335;
}

.btn.active.error {
  background: rgba(234, 67, 53, 0.25);
  border-color: #ea4335;
  color: #ea4335;
}

.btn.active.warning {
  background: rgba(251, 188, 4, 0.25);
  border-color: #fbbc04;
  color: #fbbc04;
}

.btn.active.info {
  background: rgba(66, 133, 244, 0.25);
  border-color: #4285f4;
  color: #4285f4;
}

.search-input {
  flex: 1;
  min-width: 140px;
  background: #0b0f19;
  border: 1px solid #252e42;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  color: #e8eaed;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: #4285f4;
  box-shadow: 0 0 6px rgba(66, 133, 244, 0.3);
}

.log-container {
  flex: 1;
  overflow-y: auto;
  min-height: 180px;
  max-height: 380px;
  background: #0b0f19;
  border: 1px solid #252e42;
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
  background: #252e42;
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
  background: rgba(66, 133, 244, 0.08);
}

.log-row.selected {
  background: rgba(66, 133, 244, 0.16);
  border-left: 3px solid #4285f4;
}

.log-time {
  color: #9aa0a6;
  flex-shrink: 0;
  font-family: monospace;
}

.log-sev {
  font-weight: 700;
  flex-shrink: 0;
  font-family: monospace;
}

.log-row.fatal .log-sev {
  color: #ea4335;
}

.log-row.fatal .log-msg {
  color: #f6aea9;
}

.log-row.error .log-sev {
  color: #ea4335;
}

.log-row.error .log-msg {
  color: #f6aea9;
}

.log-row.warning .log-sev {
  color: #fbbc04;
}

.log-row.warning .log-msg {
  color: #fee8a2;
}

.log-row.info .log-sev {
  color: #4285f4;
}

.log-row.info .log-msg {
  color: #d2e3fc;
}

.log-msg {
  flex: 1;
}

.empty-state {
  color: #9aa0a6;
  text-align: center;
  padding: 24px;
  font-style: italic;
}

.diagnostic-error {
  padding: 12px;
  background: rgba(234, 67, 53, 0.15);
  border: 1px solid #ea4335;
  border-radius: 6px;
  color: #f6aea9;
}

.diagnostic-error h4 {
  margin: 0 0 6px 0;
  color: #ea4335;
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
