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
});
