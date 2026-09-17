# Sandbox Lifecycle (Instant Clear & Live Stepper) & Multi-Panel Window Manager

## 1. Problem Diagnosis: Why the "Slow Replace" Happens

Currently, when a user submits a natural-language prompt in the HUD:
1. **Missing Immediate Sandbox Reset:** In `web/src/main.js` (`hud.onPromptSubmit`), if a prompt is not matched by client-side regexes (e.g. `"show me the services"`, or single-pod queries in section `5d`), `panel.showStreamingProgress()` is never called before `ws.sendPrompt()`. The previous ArrowJS component remains mounted in the `ShadowRoot` while the Go backend calls Vertex AI `gemini-3.8-flash` (`ResolveIntent`) and executes MCP tools (`lookout_resources`). Only when `ws.onUIComponent` finally arrives (~1–2 seconds later) does `panel.mount()` overwrite the container, causing a jarring "slow replace" where stale UI remains visible during generation.
2. **Inefficient Status Re-Compilation:** When `showStreamingProgress()` *is* called on `ws.onStatus`, it invokes `this.runtime.execute(streamingCode)` on every status tick—re-compiling an entire ArrowJS template via `new Function(...)` for every single status string rather than appending to an instant progressive step log.
3. **Single Panel Limitation ("Do we only have one spot for panel?"):** `IncidentPanel` is currently a singleton DOM element inside `#panel-container`. Every new query overwrites the single panel, making it impossible to keep an existing view (e.g. **Gateways & Routes** or **Incident Matrix**) open while inspecting another resource or running a follow-up query.

---

## 2. Proposed Architecture

### A. Instant Sandbox Clear & Live Progressive Stepper (`panel.startGeneration`)
Whenever any prompt is submitted (`hud.onPromptSubmit`, `panel.onObjectPromptSubmit`, or `hud.onScenarioSelect`):
- Immediately invoke `panel.startGeneration(title, initialStep)` **synchronously before `ws.sendPrompt()`**.
- `startGeneration()` immediately clears the previous ArrowJS `ShadowRoot` (`this.runtime.clear()`), starts a live `100ms` elapsed timer badge (`TTI: 0.1s...`), and renders a native, zero-latency **Agentic Synthesis Stepper** inside the panel body.
- As WebSocket `status` messages arrive (`🤖 [mast:intent-router]...`, `🔍 [k8s-lookout] Executing MCP tool...`, `🧠 [mast:arrowjs-compiler]...`), `panel.appendGenerationStep(statusMsg)` appends each step with checkmarks for completed stages and an active spinner on the current stage.
- When `ws.onUIComponent` arrives, the stepper is cleanly replaced by the newly compiled ArrowJS component.

### B. Multi-Panel Spatial Window Manager with Pinning (`📌 Pin Panel`)
To answer *"Do we only have one spot for panel?"*, we upgrade `#panel-container` from a single hardcoded panel to a **Multi-Panel Spatial Window Manager (`PanelManager`)**:
- **Default Behavior (Unpinned Active Panel):** By default, there is one primary active floating panel. Submitting a new prompt immediately clears and reuses this active panel.
- **Pinning (`📌 Pin` button in Panel Header):** Every floating panel header includes a **📌 Pin** toggle button (alongside Minimize `−` and Close `×`).
  - When a user clicks **📌 Pin** on a panel (e.g., pinning **K8s & CRD Objects: Deployments** or **Cluster Incident Matrix**), that panel is locked to the 3D workspace.
  - When the user submits a new prompt or clicks another 3D node while the current panel is pinned, `PanelManager` **automatically spawns a new floating panel window** offset by `(+28px, +28px)` with independent z-index focus, drag handle, minimize/close controls, and its own isolated ArrowJS `ShadowRoot` sandbox!
  - Users can have multiple live ArrowJS panels open simultaneously (up to 4 pinned panels) to compare Deployments, StatefulSets, Logs, and Triage side-by-side over the 3D topology.
