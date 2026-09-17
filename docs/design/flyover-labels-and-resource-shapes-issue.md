# Design Plan: "Hover & Trouble + Zoom Reveal" 3D Label Mode & Resource Shapes Issue

## Goal Description

Address 3D spatial clarity and future icon/shape design:
1. **File GitHub Issue on `go-steer/ephemeris` ([go-steer/ephemeris#6](https://github.com/go-steer/ephemeris/issues/6)):**
   Create a tracking issue to revisit the 3D geometric shapes/icons for each Kubernetes resource kind (`Pod`, `Deployment`, `ReplicaSet`, `DaemonSet`, `StatefulSet`, `Service`, `HTTPRoute`, `Gateway`) and formalize semantic zoom levels.
2. **Implement "Hover & Trouble + Zoom Reveal" Label Mode (`hover-trouble`) as the Default:**
   - **Trouble Always Visible:** Resources in trouble (`CrashLoopBackOff`, `Degraded`, `Pending`, `Failed`) and Cluster/Namespace plaques always display their alert badges so incidents stand out immediately across the fleet.
   - **Flyover Hover Reveal:** Healthy resource labels are hidden at overview distance to eliminate clutter, and **instantly appear on pointer flyover** (`pointermove` raycast hover) along with their connected vertical ownership chain (`Deployment -> ReplicaSet -> Pod`).
   - **Zoomed-In Proximity Reveal:** When zooming the camera close to a cluster or namespace (`distance < 18` world units), labels for nearby workloads smoothly reveal automatically.
   - **Top-Bar Mode Switcher (`#hud-label-mode-btn`):** Cycle between **`🏷️ Labels: Hover & Trouble`** (new default), **`🏷️ Labels: Smart`**, **`🏷️ Labels: All`**, and **`🏷️ Labels: Off`**.

---

## Architectural Changes

### 1. GitHub Issue Specification (`go-steer/ephemeris#6`)
- **Distinct 3D Resource Silhouettes & Emblems:** Moving beyond basic primitives (cylinders/octahedrons/tori) to recognizable Kubernetes silhouettes or 3D badge emblems for `Pod`, `Deployment`, `ReplicaSet`, `DaemonSet`, `StatefulSet`, `Service`, `HTTPRoute`, and `Gateway`.
- **Semantic Zoom Levels:** Defining 4 explicit camera distance thresholds (`Fleet Macro > 75`, `Cluster Mid 35–75`, `Namespace Close 18–35`, `Workload Micro < 18`) that govern geometry detail and label density.

---

### 2. Raycaster Flyover Hover Callback (`web/src/canvas/controls.js`)
- Added `this.onHoverNode = null;` callback property to `CameraControls`.
- In `_onPointerMove(e)`, when `intersects.length > 0` and `this.hoveredObject !== hit`, invokes `this.onHoverNode(hit.userData)` with the hovered 3D object's metadata.
- In `_unhover()`, invokes `this.onHoverNode(null)` when the pointer leaves the 3D object.

---

### 3. Hover & Trouble + Zoom Reveal Engine (`web/src/canvas/topology.js`)
- Default `this.labelMode = 'hover-trouble'`.
- Added `setHoveredNode(userData)`:
  - Tracks `this.hoveredNodeId` and `this.hoveredChainIds` (computes ancestors/descendants of hovered node so flying over a `Pod` or `Deployment` reveals its immediate vertical ownership chain).
  - Calls `this._applyLabelVisibility(this._lastCamera)`.
- Updated `_applyLabelVisibility(camera)` to support four modes:
  1. **`'hover-trouble'` (Default):**
     - Always show Cluster/Namespace plaques (`isPlaque`).
     - Always show resources in trouble (`isIncident`: `CrashLoopBackOff`, `Degraded`, `Pending`, `Failed`).
     - Always show hovered node + hovered chain (`isHovered || inHoveredChain`) and selected node + selected chain (`isSelected || inSelectedChain`).
     - Automatically reveal labels for healthy nodes when **zoomed in close** (`dist < 18` world units).
  2. **`'smart'`:** Show incidents, hovered/selected chains, and close primary workloads (`dist < 32`).
  3. **`'all'`:** Show all labels within distance LOD (`dist < 80`).
  4. **`'off'`:** Hide all node labels except active pointer flyover hover (`isHovered`).

---

### 4. HUD Top-Bar Label Toggle & Main Wiring (`web/src/ui/hud.js` & `web/src/main.js`)
- Updated `#hud-label-mode-btn` default text to `🏷️ Labels: Hover & Trouble` (`data-mode="hover-trouble"`) and cycle through `['hover-trouble', 'smart', 'all', 'off']`.
- Wired `controls.onHoverNode = (userData) => topologyMesh.setHoveredNode(userData);` in `main.js` so pointer flyover updates 3D labels and vertical ownership chains at 60 FPS.
