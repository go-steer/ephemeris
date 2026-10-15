# Verification Walkthrough: Ephemeris Decks (`/decks`) — 3-Deck Spatial Hierarchy, 100K-Pod Hyperscale & Generative ArrowJS Triage

## 1. Automated CI Presubmit Verification

Run the local presubmit aggregator:

```bash
dev/tools/ci
```

- **Web Unit Tests (`vitest`):** `6/6` test suites (`65/65` tests) passing, including [`web/src/decks/decks-plan.test.js`](../../web/src/decks/decks-plan.test.js) covering:
  - 9 Dark & Light themes (`THEMES`, `themeById`, `cssVars`).
  - Level 1 Multi-Cluster Fleet Overview Deck (`planFleetOverview`).
  - Level 2 Single-Cluster 3-Deck Architecture (`planClusterDecks`):
    - **Deck 1 (Top):** `Ingress & Routing` (`Gateway` / `HTTPRoute` / `Ingress` / `Service`).
    - **Deck 2 (Middle):** `Workloads & Namespaces` (`Deployment`, `StatefulSet`, `DaemonSet`, `Job` pads with 3 horizontal gauge bars inside squarified Namespace Districts).
    - **Deck 3 (Bottom):** Switchable between **`Pods & Namespaces`** (pods grouped by namespace with dynamic cell sizing) and **`Pods & GKE Nodes`** (GKE Compute Node pads grouped by Node Pool with scheduled pods packed directly on top of their hosting Node pad).
  - **100,000-Pod Hyperscale (`scale-100k`):** `500` Namespaces, `1,000` Workloads, `5,000` GKE Nodes, and `100,000` Pods represented via contiguous TypedArrays (`podTable`) with `< 0.2ms` focus beam indexing and dynamic Namespace/Workload drill-down scoping.
  - **Generative ArrowJS Triage (`ShadowRoot`) & Live Log Streaming:** Validated `synthesizeDecksTriagePayload` and `ArrowSandboxRuntime` execution across `pod`, `controller`, `node`, and `ingress` targets.
- **Go Unit & Race Tests (`dev/tools/go-test`):** All Go packages (`./cmd/... ./pkg/... ./internal/...`) pass `go test -race` and `golangci-lint`.

## 2. Interactive Walkthrough (`http://localhost:8080/decks`)

1. **Level 1 ↔ Level 2 Fleet Navigation (`0`):**
   - Click **`🌐 Fleet`** (or press `0`) to view the multi-cluster Fleet Overview Deck (`ap-iap-testing`, `std-stable-1-35`, `ap-kagent`, `ap-ambient-mesh`, `ap-agones`, `kube-agents-host`).
   - Click any cluster card to dive into its 3-Deck Single-Cluster view.
2. **Deck 3 Switcher (`Namespaces` | `GKE Nodes`, key `b`):**
   - Toggle **`Deck 3: Namespaces | GKE Nodes`** in the top bar (or press `b`) to switch Deck 3 between **Pods & Namespaces** and **Pods & GKE Nodes**.
3. **Namespace & Workload Pod Drill-Down:**
   - Click any **Namespace District** header or click **`🔍 Drill Down Pods on Deck 3`** in a Workload's right-hand inspector to scope Deck 3 to that Namespace or Workload and dynamically enlarge its 3D Pod capsules.
4. **500 Namespaces / 5,000 GKE Nodes / 100,000 Pods (`scale-100k`):**
   - Select **`Scale: 500 NS · 5,000 Nodes · 100K Pods`** in the scenario selector (or visit `http://localhost:8080/decks?scenario=scale-100k`) to inspect 100,000 instanced 3D pods across 500 aligned namespace districts or 5,000 GKE Node pads.
5. **Generative ArrowJS Triage (`ShadowRoot`) & Live Container Logs:**
   - Click any Pod, Workload, Node, or Ingress and click **`⚡ Synthesize ArrowJS Triage`** (or submit a natural-language query in the bottom-left **Gemini 3.8** prompt bar) to mount an interactive `@arrow-js/core` remediation card inside an isolated `ShadowRoot`.
   - Click **`▶ Stream Live Logs`** in the Pod Inspector to stream live UTC RFC3339 millisecond container logs.
