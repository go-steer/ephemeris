# Walkthrough: Stratified 3D Ownership Hierarchy, Hover & Trouble Label Mode, & Fleet Scale Stress-Test

## What Was Built

### 1. GitHub Issue Filed for 3D Resource Silhouettes & Semantic Zoom UX
- Created [go-steer/ephemeris#6](https://github.com/go-steer/ephemeris/issues/6) (**"Design & UX: Revisit 3D Kubernetes Resource Shapes/Icons and Semantic Zoom Label UX"**) to track distinct 3D architectural silhouettes/icons for each Kubernetes resource kind (`Pod`, `Deployment`, `ReplicaSet`, `DaemonSet`, `StatefulSet`, `Service`, `HTTPRoute`, `Gateway`) and formalize 4 semantic zoom bands (`Fleet Macro > 75`, `Cluster Mid 35–75`, `Namespace Close 18–35`, `Workload Micro < 18`).

### 2. "Hover & Trouble + Zoom Reveal" Default Label Mode (`🏷️ Labels: Hover & Trouble`)
- **Default `hover-trouble` Mode (`setLabelMode('hover-trouble')`):**
  - **Healthy Labels Hidden at Overview Distance:** Healthy `Pod`, `Deployment`, `ReplicaSet`, `DaemonSet`, `Service`, `HTTPRoute`, and `Gateway` nodes hide their labels when viewed from macro fleet/cluster distance (`dist >= 18`), keeping the 3D scene ultra-clean.
  - **Trouble Always Visible:** Resources in trouble (`CrashLoopBackOff`, `Degraded`, `Pending`, `Failed`) and Cluster/Namespace plaques always display their high-contrast alert badges across the entire fleet.
  - **Instant Pointer Flyover Reveal (`onHoverNode`):** Moving the cursor over any 3D object raycasts the mesh and immediately pops up its label badge along with the labels and glowing vertical beams of its connected ownership chain (`Deployment -> ReplicaSet -> Pod`).
  - **Close-Up Zoom Reveal (`dist < 18`):** Zooming the camera close to a cluster neighborhood (`distance < 18` world units) automatically reveals labels for nearby workloads without requiring manual hovering.
- **4-State Top-Bar Switcher (`#hud-label-mode-btn`):** Click **`🏷️ Labels: Hover & Trouble`** in the top bar to cycle through:
  1. `🏷️ Labels: Hover & Trouble` (Default)
  2. `🏷️ Labels: Smart` (incidents + close primary workloads)
  3. `🏷️ Labels: All` (all labels within distance LOD)
  4. `🏷️ Labels: Off` (only active pointer flyover hover shown)

### 3. Sleek 3D Node & Billboard Sizing (`web/src/canvas/topology.js`)
- **Compact 3D Node Geometry:** Reduced base 3D node geometry by **~48%** (`POD_RADIUS = 0.35 * s`, `POD_HEIGHT = 0.68 * s`, adaptive `objectScaleFactor` scaling down at `120+` and `300+` objects).
- **Compact 2D Billboard Sprites (`createTextSprite`):** Reduced 3D world height by **~54%** (`worldHeight = 0.25` for nodes, `0.52` for cluster plaques) and introduced concise resource prefixes (`GW`, `ROUTE`, `SVC`, `DEPLOY`, `RS`, `DS`, `STS`) so labels shrink from `~4.4 units` wide down to `~1.2 units` wide.

### 4. Floating Panel Z-Index & Viewport Clamping (`styles.css` & `panel.js`)
- **Elevated Z-Index Layering:** Raised `#panel-container` (`z-index: 45`) and `.floating-panel` (`z-index: 50`) above `#hud-container` (`z-index: 30`) so generated floating panels never slip under the top navigation bar.
- **Strict Viewport Clamping (`_clampToViewport`):** Added automatic viewport coordinate clamping (`top >= 58px`, `left >= 12px`, `right >= 12px`) on panel show, drag, and window resize so the header and `[📌 Pin] [—] [×]` controls are always 100% visible and draggable.

---

## Verification Results

### Automated Presubmits (`dev/tools/ci`)
- **`verify-format` & `verify-go-format`**: Passed
- **`lint-js`, `lint-css`, `lint-go`**: 0 issues
- **`test-unit` (Vitest)**: 5 test files, **50 passed (50)** (including `supports hover-trouble default mode, pointer flyover chain reveal, close-up zoom reveal, and compact billboard world scale`)
- **`go-test` (Go race detector + coverage)**: All packages passed
- **Live Server Verification (`go run ./cmd/verify -url http://localhost:8080`)**: Passed (`GET /healthz`, `GET /`, `WSS /ws`)
