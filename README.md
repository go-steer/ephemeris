# Ephemeris — Generative Spatial Observability for GKE

**Ephemeris** replaces static 2D cloud dashboards with an interactive **3D WebGL topological mesh** of Google Kubernetes Engine (GKE) clusters paired with an isolated **`@arrow-js/core` reactive UI sandbox** powered by **Vertex AI (`gemini-3.8-flash`)**.

- **Canonical Architecture Specification:** [`docs/design/architecture.md`](docs/design/architecture.md)
- **Design Specifications:** [`docs/design/`](docs/design/)
- **Verification Walkthroughs:** [`docs/verification/`](docs/verification/)

---

## Key Capabilities

- **Stratified 5-Tier 3D Kubernetes Topology (Three.js):**
  - Renders `Cluster` monoliths (`Y = 1.0`), `Namespace` platforms (`Y = 0.45`), `Pods` (`Y = 0.52`), Workload Controllers (`ReplicaSet`, `Deployment`, `DaemonSet`, `StatefulSet`, `SparkApplication`, `RayCluster` at `Y = 1.35–2.15`), and Networking (`Service`, `HTTPRoute`, `Gateway` at `Y = 2.80–4.20`) connected by vertical ownership beams and animated traffic conduits.
  - **Official Kubernetes SVG Surface Medallions:** Every 3D object features flush **Top-Cap (`+Y` aerial view)** and **Front-Face (`+Z` zoom-in view)** 7-sided Kubernetes icon medallions (`control-plane.svg`, `pod.svg`, `rs.svg`, `sts.svg`, `deploy.svg`, `ds.svg`, `svc.svg`, `ing.svg`) rendered via cached `Path2D` canvas textures.
  - **4 Semantic Zoom Bands & Smart Labels:** Real-time `Macro` (`> 75`), `Cluster` (`35–75`), `Namespace` (`18–35`), and `Micro` (`<= 18`) zoom tracking with `Hover & Trouble` default label decluttering and `35` / `130` / `520`-object Fleet Scale presets.
- **Polymorphic Generative UI Runtime (`@arrow-js/core` in `ShadowRoot`):**
  - Compiles task-specific reactive UIs via `gemini-3.8-flash` across 6 archetypes (`incident_triage`, `fleet_overview`, `resource_table`, `capacity_heatmap`, `network_flow`, `comparison_matrix`) with dynamic 3D scene filtering (`filter_criteria`).
  - **Multi-Panel Window Manager:** Supports `📌 Pin` for side-by-side multi-window comparison, `— Minimize` to a bottom restore dock, viewport boundary clamping, and a **Dedicated 3D Object Inspector** on node click.
- **Dual-Mode Telemetry (Chaos Engine + GCP Managed MCP):**
  - **Mock Chaos Mode (`-mode=mock`):** Zero-dependency local simulation with a 2s live metric jitter ticker, 4 switchable chaos scenarios (`default`, `cascading_timeout`, `canary_oom`, `healthy`), and 1-click live remediation.
  - **Live GCP MCP Mode (`-mode=mcp`):** Read-only `GET`-whitelisted Model Context Protocol client (`container.googleapis.com/mcp`, `logging.googleapis.com/mcp`) authenticated via Application Default Credentials (ADC).

---

## Quickstart

```bash
# 1. Build frontend bundle and Go binary
./dev/tools/build
go build -o ./bin/ephemeris ./cmd/ephemeris

# 2. Launch Ephemeris on http://localhost:8080 (Mock Chaos Engine + Vertex AI via ADC)
./bin/ephemeris -mode=mock -port 8080 -gcp-project=YOUR_GCP_PROJECT

# 3. Run the full local CI presubmit aggregator (Vitest + Go race tests + linters)
./dev/tools/ci
```