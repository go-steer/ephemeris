---
title: Generative UI (ArrowJS Sandbox)
description: Real-time generation and sandboxed execution of reactive ArrowJS widgets.
---

## Why ArrowJS?

Unlike heavier frontend frameworks, `@arrow-js/core` provides native JavaScript reactive primitives (`html` tagged template literals and `reactive` state proxies) that execute without build pipelines or bundling steps.

This enables Gemini agents to write clean, reactive JavaScript that runs directly in the browser.

## Component Contract

The agent outputs self-contained components receiving injected reactive dependencies:

```javascript
// Injected variables: html, reactive, data, container
const state = reactive({
  filter: 'ALL',
  logs: data.logs || [],
});

const template = html`
  <div class="ephemeris-widget">
    <div class="header">
      <span class="badge ${data.metrics.status}">${data.pod_id}</span>
      <span class="restarts">Restarts: ${data.metrics.restarts}</span>
    </div>
    <div class="logs">
      ${() =>
        state.logs.map(
          (log) => html`
            <div class="log-line ${log.severity.toLowerCase()}">
              <span class="time">${log.timestamp}</span>
              <span class="msg">${log.message}</span>
            </div>
          `
        )}
    </div>
  </div>
`;

template(container);
```

## Security Sandboxing

- Mounts into a `ShadowRoot` on `<ephemeris-panel>`.
- Evaluated within a restricted function scope where `window`, `document`, `localStorage`, and `fetch` are shadowed as `undefined`.
