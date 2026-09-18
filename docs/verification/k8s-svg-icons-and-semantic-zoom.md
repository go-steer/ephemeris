# Verification Walkthrough: Official Kubernetes SVG Icon Emblems, 3D Silhouettes & Semantic Zoom

## 1. Automated Verification Suite (`./dev/tools/ci`)

Run the full presubmit aggregator in `/usr/local/google/home/garisingh/projects/ephemeris-resource-silhouettes`:

```bash
./dev/tools/fix-format && ./dev/tools/build && ./dev/tools/ci
```

- **Vitest Unit Tests (`51/51 passed`):**
  - Verifies `getK8sIconTexture` and `createK8sIconSprite` in `web/src/canvas/k8s-icons.js` using exact vector paths extracted from `/usr/local/google/home/garisingh/projects/kubernetes/community/icons/svg/resources/unlabeled/{pod,rs,deploy,ds,sts,svc,ing,job}.svg`.
  - Verifies `userData.iconEmblem` attachment on all `Pod`, `Deployment`, `ReplicaSet`, `DaemonSet`, `StatefulSet`, `Service`, `HTTPRoute`, and `Gateway` 3D nodes.
  - Verifies the 4 semantic zoom bands (`Macro > 75`, `Cluster 35–75`, `Namespace 18–35`, `Micro <= 18`) in `TopologyMesh.getPerformanceStats().zoomBand`.

## 2. Interactive Browser Verification (`http://localhost:8080`)

1. Open **`http://localhost:8080`**.
2. **Official K8s SVG Icon Emblems & Top-Cap Decals:**
   - Observe the floating 7-sided Kubernetes heptagon icon emblems above every 3D `Deployment` (`deploy.svg`), `ReplicaSet` (`rs.svg`), `DaemonSet` (`ds.svg`), `StatefulSet` (`sts.svg`), `Service` (`svc.svg`), `HTTPRoute` / `Gateway` (`ing.svg`), and `Pod` (`pod.svg`).
   - Tilt the camera downward to see the official `pod.svg` heptagon medallion stamped on top of each Pod hexagon cap, tinted `#326ce5` (Healthy K8s Blue), `#fbbc04` (Pending Amber), or `#ea4335` (Crashing Red).
3. **Multi-Part 3D Resource Silhouettes:**
   - Switch **3D Layer (`#hud-layer-select`)** to `3D Layer: Ownership` or `3D Layer: Traffic`:
     - **`ReplicaSet` (`Y = 2.35`):** 3 staggered replica plates echoing `rs.svg`.
     - **`Deployment` (`Y = 3.75`):** Octagonal hub surrounded by a tilted orbital rollout ring (`deploy.svg`).
     - **`DaemonSet` (`Y = 3.75`):** Horizontal ring with 4 radial node satellite pips (`ds.svg`).
     - **`StatefulSet` (`Y = 3.75`):** Vertical cylinder with 3 persistent-volume horizontal bands (`sts.svg`).
     - **`Service` (`Y = 5.25`):** Cyan octahedron with an equatorial port-routing ring (`svc.svg`).
     - **`Gateway` (`Y = 8.05`):** Dual concentric portal arches (`ing.svg`).
4. **4 Semantic Zoom Bands in `#hud-perf-pill`:**
   - Scroll the mouse wheel in and out and observe the top-bar `#hud-perf-pill` badge transition live between:
     - `Zoom: Macro` (`dist > 75`)
     - `Zoom: Cluster` (`35 < dist <= 75`)
     - `Zoom: Namespace` (`18 < dist <= 35`)
     - `Zoom: Micro` (`dist <= 18` — automatically reveals nearby resource names even in `Labels: Hover & Trouble` mode).
