# Ephemeris System Architecture & Technical Stack

> **Canonical Architectural Specification (`v1.0`)**
> `ephemeris` is a generative spatial observability platform for Google Kubernetes Engine (GKE). It replaces static 2D dashboards with an interactive 3D WebGL topological mesh paired with an isolated `@arrow-js/core` reactive UI runtime powered by Vertex AI (`gemini-3.8-flash`).

---

## 1. System Context & Component Architecture

`ephemeris` decouples telemetry ingestion from UI presentation. Instead of routing metrics and logs into rigid, pre-built dashboards, spatial context and live telemetry are streamed to a Go WebSocket orchestrator (`cmd/ephemeris`) which compiles task-specific, interactive ArrowJS UI widgets on the fly and mounts them inside an isolated browser `ShadowRoot`.

```mermaid
flowchart TD
    subgraph Browser["Browser Client Layer (Vite + Three.js + ArrowJS)"]
        HUD["SRE Cockpit HUD\n(Cluster / Scenario / Scale / Layer / Label Controls)"]
        Canvas["3D Spatial WebGL Mesh (Three.js)\n5-Tier K8s Hierarchy + Raycaster + Reticles"]
        Icons["Official K8s SVG Emblem Engine\n(Path2D Texture Cache: Top-Cap + Front Medallions)"]
        Inspector["Dedicated 3D Object Inspector\n(Floating Contextual Chat & Telemetry)"]
        Sandbox["Multi-Panel ArrowJS Sandbox Runtime\n(Isolated ShadowRoot + Global API Masking + Pin/Minimize Dock)"]
    end

    subgraph Backend["Go Orchestrator Daemon (cmd/ephemeris)"]
        WSHub["Stateful WebSocket Hub (/ws)\nClient Session & Message Queue"]
        Assembler["Polymorphic Prompt Assembler\n(6 UI Archetypes + Spatial Blast Radius)"]
        Compiler["Vertex AI Agent Compiler\n(gemini-3.8-flash Structured JSON + Filter Criteria)"]
    end

    subgraph Telemetry["Dual-Mode Telemetry Layer"]
        MockEngine["Interactive Mock Chaos Engine (-mode=mock)\n2s Live Jitter Ticker + 4 Chaos Scenarios + Scale Presets"]
        MCPClient["Read-Only GCP Managed MCP Client (-mode=mcp)\nADC Token Auth + Strict HTTP GET Whitelist"]
    end

    subgraph GCP["Google Cloud Platform"]
        VertexAI["Vertex AI API\n(gemini-3.8-flash @ global)"]
        GKEMCP["GKE Managed MCP\n(container.googleapis.com/mcp)"]
        LogMCP["Cloud Logging Managed MCP\n(logging.googleapis.com/mcp)"]
    end

    HUD -- "Scenario / Scale / Layer / Prompt" --> WSHub
    Canvas -- "3D Raycast Selection (@resource)" --> HUD
    Canvas -- "3D Node Click" --> Inspector
    Icons -- "Cached sRGB CanvasTextures" --> Canvas
    WSHub -- "Topology & 2s Telemetry Tick" --> Canvas
    WSHub -- "Progressive Status & UI Payload" --> Sandbox
    Sandbox -- "CustomEvents (remediate / drain / select)" --> Canvas

    WSHub --> Assembler
    Assembler --> Compiler
    Compiler -- "ADC gRPC/REST" --> VertexAI

    WSHub --> MockEngine
    WSHub --> MCPClient
    MCPClient -- "Read-Only JSON-RPC (GET)" --> GKEMCP
    MCPClient -- "Read-Only JSON-RPC (GET)" --> LogMCP
```

---

## 2. End-to-End Generative UI & Spatial Filtering Sequence

When an SRE clicks a 3D Kubernetes object or submits a natural-language triage prompt, `ephemeris` executes a synchronized spatial-and-generative pipeline:

```mermaid
sequenceDiagram
    autonumber
    actor SRE as SRE / Incident Commander
    participant Canvas as 3D WebGL Canvas (TopologyMesh)
    participant HUD as SRE Cockpit & Sandbox (IncidentPanel)
    participant Hub as Go WebSocket Hub (/ws)
    participant Tel as Telemetry / Chaos Engine
    participant Gemini as Vertex AI (gemini-3.8-flash)

    SRE->>Canvas: Clicks 3D Pod / Controller (or submits Fleet Query)
    Canvas->>HUD: Locks 3D Target Reticle + Attaches @resource Context Pill
    HUD->>HUD: Clears Unpinned Panel (t=0ms) & Starts Synthesis Stepper
    HUD->>Hub: WSS {"type": "prompt", "query": "...", "active_resource": "gke://..."}

    Hub-->>HUD: WSS {"type": "status", "step": "gathering_telemetry"}
    Hub->>Tel: Fetch Pod Logs, CPU/Mem Metrics & Ownership Chain
    Tel-->>Hub: Structured Telemetry + Blast Radius Graph

    Hub-->>HUD: WSS {"type": "status", "step": "compiling_ui"}
    Hub->>Gemini: System Prompt + Telemetry JSON + Polymorphic Schema
    Gemini-->>Hub: JSON {"arrow_template": "...", "filter_criteria": {...}}

    Hub-->>HUD: WSS {"type": "ui_update", "arrow_template": "...", "filter_criteria": {...}}
    HUD->>Canvas: highlightPodsByFilter(filter_criteria) (Dims non-matching nodes to 0.22)
    HUD->>HUD: Sanitize Template & Mount inside Isolated ShadowRoot

    SRE->>HUD: Clicks [Rollback Image] or drags [Traffic Drain Slider] in ArrowJS Widget
    HUD->>Canvas: Dispatches CustomEvent ("ephemeris-remediated" / "ephemeris-traffic-drain")
    HUD->>Hub: WSS {"type": "remediate", "pod_id": "..."}
    Canvas->>Canvas: Transitions 3D Node, Namespace Rim & Cluster Slits to Healthy Green (#34A853)
```

---

## 3. Stratified 3D Spatial Topology & Official Kubernetes SVG Medallions

To eliminate visual flattening and label clutter across multi-cluster fleets, `TopologyMesh` ([`web/src/canvas/topology.js`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/canvas/topology.js)) organizes Kubernetes resources into **5 stratified vertical elevation tiers** and stamps every 3D object with **Official Kubernetes Community SVG Medallions** ([`web/src/canvas/k8s-icons.js`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/canvas/k8s-icons.js)).

```mermaid
flowchart BT
    subgraph Tier0["Tier 0 & 1: Infrastructure & Territory (Y = 0.20 – 0.52)"]
        Cluster["GKE Cluster Monolith (Y = 1.0)\nHexagonal Core + control-plane.svg Medallions"]
        NS["Namespace Territory Pad (Y = 0.45)\nHexagonal Slate Platform + Status Rim"]
    end

    subgraph Tier2["Tier 2: Compute Workloads (Y = 0.52)"]
        Pod["Kubernetes Pod (Y = 0.52)\nInner Hex Container + Outer Dashed Heptagon + pod.svg Medallions"]
    end

    subgraph Tier3["Tier 3: Workload Controllers (Y = 1.35 – 2.15)"]
        RS["ReplicaSet (Y = 1.35)\nrs.svg Medallions"]
        Deploy["Deployment (Y = 2.05)\ndeploy.svg Medallions"]
        DS["DaemonSet (Y = 2.05)\nds.svg Medallions"]
        STS["StatefulSet (Y = 2.05)\nsts.svg Medallions (with PV Cylinder)"]
    end

    subgraph Tier4["Tier 4: Service Mesh & Ingress (Y = 2.80 – 4.20)"]
        SVC["Service (Y = 2.80)\nsvc.svg Medallions"]
        Route["HTTPRoute (Y = 3.50)\ning.svg Medallions"]
        GW["Gateway (Y = 4.20)\ning.svg Medallions"]
    end

    Cluster --> NS
    NS --> Pod
    Pod -. "Ownership Beam" .-> RS
    RS -. "Ownership Beam" .-> Deploy
    Pod -. "Ownership Beam" .-> DS
    Pod -. "Ownership Beam" .-> STS
    Pod == "Traffic Conduit" ==> SVC
    SVC == "Traffic Conduit" ==> Route
    Route == "Traffic Conduit" ==> GW
```

### 3.1 Dual Surface-Mounted Medallions (`Top-Cap` + `Front-Face`)
Rather than floating billboard icons that clutter vertical sightlines, [`createK8sSurfaceMedallions`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/canvas/k8s-icons.js#L334) renders official Kubernetes vector paths (`viewBox="0 0 18.035334 17.500378"`) via `Path2D` onto cached `sRGB` `THREE.CanvasTexture` instances and mounts two 7-sided medallions directly onto each 3D geometry:
- **Top-Cap Medallion (`rotation.x = -Math.PI / 2`):** Flush on the top surface (`+Y`) for immediate recognition during aerial/overview navigation.
- **Front-Face Medallion (`+Z` flat face):** Flush on the rotated front polygon face (`rotateY(Math.PI / radialSegments)`) with `polygonOffset` for close-up inspection.

### 3.2 Semantic Zoom Bands & Smart Label Modes
`TopologyMesh` continuously evaluates camera distance (`originDist`) across **4 Semantic Zoom Bands**, surfaced live in `#hud-perf-pill` (`60 FPS • 45 Obj • Zoom: Cluster`):

| Semantic Zoom Band | Camera Distance (`originDist`) | Visual Behavior in Default `Hover & Trouble` Label Mode |
| :--- | :---: | :--- |
| **`Macro`** | `> 75` world units | Shows Cluster & Namespace plaques + high-priority incident badges (`CrashLoopBackOff` / `Failed`). Hides healthy pod medallions and labels. |
| **`Cluster`** | `35 – 75` world units | Shows all Top-Cap & Front-Face K8s SVG medallions + incident labels. Healthy node labels reveal on pointer flyover hover (`setHoveredNode`). |
| **`Namespace`** | `18 – 35` world units | Shows full ownership & networking beams + flyover chain labels (`_computeChainIds`). |
| **`Micro`** | `<= 18` world units | Automatically reveals nearby healthy resource labels (`isZoomedInClose`) alongside front-facing K8s medallions. |

---

## 4. ArrowJS Sandbox Security & Multi-Panel Windowing Lifecycle

LLM-generated UI code is untrusted by default. [`ArrowSandboxRuntime`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/sandbox/runtime.js) and [`IncidentPanel`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/ui/incident-panel.js) enforce strict execution isolation and multi-window ergonomics:

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Synthesizing: User submits Prompt (t = 0ms)
    note right of Synthesizing
      Immediately clears unpinned DOM
      & renders 3-stage live progress stepper
    end note
    Synthesizing --> UnpinnedActive: WSS ui_update (ArrowJS mounted in ShadowRoot)
    UnpinnedActive --> Synthesizing: Next Prompt submitted (replaces unpinned panel)
    UnpinnedActive --> PinnedWindow: User clicks [📌 Pin]
    PinnedWindow --> PinnedWindow: Next Prompt spawns new parallel Panel (up to 4)
    PinnedWindow --> MinimizedDock: User clicks [— Minimize]
    UnpinnedActive --> MinimizedDock: User clicks [— Minimize]
    MinimizedDock --> PinnedWindow: User clicks Dock Pill (#hud-minimized-dock)
    PinnedWindow --> [*]: User clicks [✕ Close]
    UnpinnedActive --> [*]: User clicks [✕ Close]
```

### Key Sandbox Guardrails
1. **Shadow DOM Encapsulation:** Every floating panel creates an isolated `ShadowRoot` (`attachShadow({ mode: 'open' })`) with scoped dark-glass styles so generated CSS cannot leak into the Three.js canvas or HUD.
2. **Global API Masking:** Inside [`ArrowSandboxRuntime.mount`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/sandbox/runtime.js), `new Function('html', 'reactive', 'telemetry', 'window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', ...)` explicitly passes `undefined` for all browser network and storage globals.
3. **Template Attribute Auto-Repair:** [`_sanitizeTemplate`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/sandbox/runtime.js) rewrites partial attribute interpolations (e.g. `style="width: ${() => val}%"`) into full attribute bindings (`style="${() => `width: ${val}%`}"`) required by `@arrow-js/core` before evaluation.
4. **Viewport Clamping:** [`_clampToViewport`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/ui/incident-panel.js) prevents any floating window header from sliding underneath the top HUD navigation bar (`top >= 64px`).

---

## 5. Complete Technical Stack & Package Map

### 5.1 Technology Stack

| Layer | Technology | Version / Target | Purpose |
| :--- | :--- | :--- | :--- |
| **3D Rendering** | `three` (Three.js WebGL) | `^0.174.0` | Hierarchical 3D scene graph, OrbitControls, Raycaster, PBR materials, Bézier particle conduits |
| **Generative UI Runtime** | `@arrow-js/core` | `^1.0.0-alpha.10` | Zero-build-step reactive template literals (`html`, `reactive`) executing in `ShadowRoot` |
| **Frontend Bundler & Test** | `vite` + `vitest` + `jsdom` | Vite `^6.4.3` / Vitest `^3.0.7` | Sub-2s production bundling into `internal/webui/dist/` + 51 headless unit tests |
| **Backend Orchestrator** | Go (`golang.org/x/net/websocket`) | Go `1.24+` | High-concurrency `/ws` hub, single-binary `embed.FS` server, chaos ticker |
| **LLM Compiler** | Vertex AI (`google.golang.org/genai`) | `gemini-3.8-flash` (`global`) | Polymorphic ArrowJS template + `filter_criteria` JSON compilation via ADC |
| **Cloud Telemetry** | GCP Managed MCP (`pkg/mcp`) | JSON-RPC 2.0 over HTTPS | Read-only `GET`-whitelisted queries to `container.googleapis.com/mcp` & `logging.googleapis.com/mcp` |

### 5.2 Repository Package & Module Map

| Path | Responsibility |
| :--- | :--- |
| [`cmd/ephemeris/main.go`](file:///usr/local/google/home/garisingh/projects/ephemeris/cmd/ephemeris/main.go) | Main binary entrypoint (`-mode=mock\|mcp`, `-port=8080`, `-gcp-project`, `-location=global`). |
| [`cmd/verify/main.go`](file:///usr/local/google/home/garisingh/projects/ephemeris/cmd/verify/main.go) | Automated E2E post-deployment verification probe (`/healthz`, SPA bundle, and `/ws` handshake + ArrowJS compilation). |
| [`pkg/api/types.go`](file:///usr/local/google/home/garisingh/projects/ephemeris/pkg/api/types.go) | WebSocket protocol DTOs (`WSMessage`, `ClusterTopology`, `K8sResource`, `PodSummary`, `FilterCriteria`). |
| [`pkg/orchestrator/`](file:///usr/local/google/home/garisingh/projects/ephemeris/pkg/orchestrator/hub.go) | Stateful `/ws` hub (`hub.go`), polymorphic prompt assembler (`prompt.go`), and Vertex AI `gemini-3.8-flash` compiler (`compiler.go`). |
| [`pkg/gke/`](file:///usr/local/google/home/garisingh/projects/ephemeris/pkg/gke/mock.go) | Multi-cluster GKE topology engine (`mock.go`, `mcp.go`) with 4 live Chaos Scenarios and 3 Fleet Scale Presets (`standard`, `medium`, `large`). |
| [`pkg/telemetry/`](file:///usr/local/google/home/garisingh/projects/ephemeris/pkg/telemetry/mock.go) | Pod log tailing, CPU/memory time-series generator, and 2-second live metric jitter engine. |
| [`pkg/mcp/client.go`](file:///usr/local/google/home/garisingh/projects/ephemeris/pkg/mcp/client.go) | Read-only GCP Managed MCP client using Application Default Credentials (ADC). |
| [`web/src/canvas/topology.js`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/canvas/topology.js) | 5-tier 3D WebGL scene builder, ownership & dependency beams, semantic zoom bands, and `Hover & Trouble` label engine. |
| [`web/src/canvas/k8s-icons.js`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/canvas/k8s-icons.js) | Official Kubernetes SVG `Path2D` canvas texture registry and Top-Cap + Front-Face medallion factory. |
| [`web/src/sandbox/runtime.js`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/sandbox/runtime.js) | Isolated `ShadowRoot` ArrowJS evaluator, browser global masker, and template sanitizer. |
| [`web/src/ui/incident-panel.js`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/ui/incident-panel.js) | Multi-panel draggable window manager (`📌 Pin`, minimize dock, viewport boundary clamping, progressive synthesis stepper). |
| [`web/src/ui/object-chat.js`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/ui/object-chat.js) | Dedicated 3D Object Inspector & contextual chat window triggered on 3D node click. |
| [`web/src/ui/hud.js`](file:///usr/local/google/home/garisingh/projects/ephemeris/web/src/ui/hud.js) | Top SRE status bar (Cluster, Chaos Scenario, Scale, 3D Layer, Labels, FPS/Zoom pill) and bottom prompt dock. |
