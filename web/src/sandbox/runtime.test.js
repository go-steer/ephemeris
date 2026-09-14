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
import { ArrowSandboxRuntime } from './runtime.js';

describe('ArrowSandboxRuntime', () => {
  let hostEl;
  let runtime;

  beforeEach(() => {
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    runtime = new ArrowSandboxRuntime(hostEl);
  });

  it('attaches a ShadowRoot and mounts container', () => {
    expect(hostEl.shadowRoot).toBeDefined();
    expect(hostEl.shadowRoot.querySelector('.sandbox-mount')).not.toBeNull();
  });

  it('executes ArrowJS template and renders DOM in isolated container', () => {
    const code = `
      const t = html\`<div class="test-render">Pod: \${data.pod_id}</div>\`;
      t(container);
    `;
    const telemetry = { pod_id: 'payment-service-84f7b6' };
    const result = runtime.execute(code, telemetry);

    expect(result.success).toBe(true);
    const rendered = hostEl.shadowRoot.querySelector('.test-render');
    expect(rendered).not.toBeNull();
    expect(rendered.textContent).toContain('payment-service-84f7b6');
  });

  it('masks browser globals inside sandbox scope', () => {
    const code = `
      const isWinUndef = typeof window === 'undefined' || window === undefined;
      const isStoreUndef = typeof localStorage === 'undefined' || localStorage === undefined;
      const isFetchUndef = typeof fetch === 'undefined' || fetch === undefined;
      const t = html\`<div id="isolation" data-win="\${isWinUndef}" data-store="\${isStoreUndef}" data-fetch="\${isFetchUndef}">Isolated</div>\`;
      t(container);
    `;
    const result = runtime.execute(code, {});
    expect(result.success).toBe(true);

    const el = hostEl.shadowRoot.querySelector('#isolation');
    expect(el).not.toBeNull();
    expect(el.getAttribute('data-win')).toBe('true');
    expect(el.getAttribute('data-store')).toBe('true');
    expect(el.getAttribute('data-fetch')).toBe('true');
  });

  it('safely catches errors and renders diagnostic error box', () => {
    const faultyCode = `
      throw new Error("Simulated syntax or runtime failure");
    `;
    const result = runtime.execute(faultyCode, { pod_id: 'test-pod' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Simulated syntax or runtime failure');

    const errorEl = hostEl.shadowRoot.querySelector('.diagnostic-error');
    expect(errorEl).not.toBeNull();
    expect(errorEl.textContent).toContain('Sandbox Execution Error');
  });

  it('clears mounted elements on clear()', () => {
    const code = `
      const t = html\`<div>Active</div>\`;
      t(container);
    `;
    runtime.execute(code, {});
    expect(hostEl.shadowRoot.querySelector('.sandbox-mount').children.length).toBeGreaterThan(0);

    runtime.clear();
    expect(hostEl.shadowRoot.querySelector('.sandbox-mount').children.length).toBe(0);
  });

  it('mounts full reactive incident triage widget without Invalid HTML position errors', async () => {
    const code = `
      const state = reactive({
        filter: 'ALL',
        search: '',
        selectedLog: null,
        logs: data.logs || []
      });

      function getFilteredLogs() {
        return state.logs.filter(log => {
          const matchesFilter = state.filter === 'ALL' || log.severity === state.filter;
          const matchesSearch = !state.search || log.message.toLowerCase().includes(state.search.toLowerCase());
          return matchesFilter && matchesSearch;
        });
      }

      const template = html\`
        <div class="ephemeris-widget">
          <div class="widget-header">
            <span class="\${'badge status-' + ((data.metrics && data.metrics.status) || 'running').toLowerCase()}">\${(data.metrics && data.metrics.status) || 'Running'}</span>
            <span class="resource-title">\${data.pod_id || 'Pod'}</span>
          </div>
          <div class="filter-bar">
            <button class="\${() => state.filter === 'ALL' ? 'btn active' : 'btn'}" id="btn-all" @click="\${() => { state.filter = 'ALL'; }}">ALL</button>
            <button class="\${() => state.filter === 'FATAL' ? 'btn active fatal' : 'btn'}" id="btn-fatal" @click="\${() => { state.filter = 'FATAL'; }}">FATAL</button>
            <input class="search-input" id="search-input" @input="\${(e) => { state.search = e.target.value; }}" />
          </div>
          <div class="log-container">
            \${() => {
              const filtered = getFilteredLogs();
              return filtered.map(log => html\`
                <div class="\${() => 'log-row ' + log.severity.toLowerCase()}">
                  <span class="log-sev">[\${log.severity}]</span>
                  <span class="log-msg">\${log.message}</span>
                </div>
              \`);
            }}
          </div>
        </div>
      \`;

      template(container);
    `;

    const telemetry = {
      pod_id: 'payment-service-84f7b6',
      metrics: { status: 'CrashLoopBackOff', restarts: '42' },
      logs: [
        {
          timestamp: '2026-09-14T10:00:00.123Z',
          severity: 'FATAL',
          message: 'panic: nil pointer dereference',
        },
        {
          timestamp: '2026-09-14T10:00:01.456Z',
          severity: 'INFO',
          message: 'server listening on port 8080',
        },
      ],
    };

    const result = runtime.execute(code, telemetry);
    expect(result.success).toBe(true);

    const badge = hostEl.shadowRoot.querySelector('.badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('CrashLoopBackOff');
    expect(badge.className).toBe('badge status-crashloopbackoff');

    const rows = hostEl.shadowRoot.querySelectorAll('.log-row');
    expect(rows.length).toBe(2);

    // Test reactive filtering on click
    const fatalBtn = hostEl.shadowRoot.querySelector('#btn-fatal');
    fatalBtn.click();

    // Allow ArrowJS reactive tick
    await new Promise((r) => setTimeout(r, 20));
    const filteredRows = hostEl.shadowRoot.querySelectorAll('.log-row');
    expect(filteredRows.length).toBe(1);
    expect(filteredRows[0].querySelector('.log-msg').textContent).toContain('panic: nil pointer');
  });

  it('mounts and executes 1-click remediation simulation in triage view', async () => {
    const code = `
      const state = reactive({
        status: 'CrashLoopBackOff',
        remediated: false
      });
      function fix() {
        state.status = 'Running';
        state.remediated = true;
        container.dispatchEvent(new CustomEvent('ephemeris-remediated', {
          bubbles: true,
          composed: true,
          detail: { podId: 'payment-service', status: 'Running' }
        }));
      }
      const template = html\`
        <div class="ephemeris-widget">
          <span class="\${() => 'badge status-' + state.status.toLowerCase()}">\${() => state.status}</span>
          <button class="remediation-btn primary" id="btn-fix" @click="\${() => fix()}">Rollback</button>
          \${() => state.remediated ? html\`<div class="remediation-success-banner">Fixed</div>\` : ''}
        </div>
      \`;
      template(container);
    `;

    let eventFired = false;
    hostEl.addEventListener('ephemeris-remediated', (e) => {
      if (e.detail.status === 'Running') eventFired = true;
    });

    const result = runtime.execute(code, { pod_id: 'payment-service' });
    expect(result.success).toBe(true);

    const fixBtn = hostEl.shadowRoot.querySelector('#btn-fix');
    expect(fixBtn).not.toBeNull();
    fixBtn.click();

    await new Promise((r) => setTimeout(r, 20));
    expect(eventFired).toBe(true);
    const badge = hostEl.shadowRoot.querySelector('.badge');
    expect(badge.textContent).toBe('Running');
    expect(hostEl.shadowRoot.querySelector('.remediation-success-banner')).not.toBeNull();
  });
});
