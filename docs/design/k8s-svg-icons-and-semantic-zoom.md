# Design Specification: Official Kubernetes SVG Icon Emblems, 3D Silhouettes & Semantic Zoom Levels

## Overview

This document specifies the implementation of [go-steer/ephemeris#6](https://github.com/go-steer/ephemeris/issues/6), combining official Kubernetes community SVG icons from `/usr/local/google/home/garisingh/projects/kubernetes/community/icons/svg/resources/unlabeled/` with sculpted 3D resource silhouettes and 4 semantic zoom bands.

## 1. Official Kubernetes SVG Vector Icon Registry (`web/src/canvas/k8s-icons.js`)

- Extracts the canonical 7-sided Kubernetes heptagon shield (`#path3055`, `#path3054-2-9`) and inner resource symbol `<path>` coordinates from:
  - `pod.svg` (`Pod`)
  - `rs.svg` (`ReplicaSet`)
  - `deploy.svg` (`Deployment`)
  - `ds.svg` (`DaemonSet`)
  - `sts.svg` (`StatefulSet`)
  - `svc.svg` (`Service`)
  - `ing.svg` (`HTTPRoute` & `Gateway`)
  - `job.svg` (`SparkApplication` & `RayCluster`)
- Renders crisp `256x256` `THREE.CanvasTexture` textures via HTML5 Canvas `Path2D` with a deterministic cache key (`${kind}-${bgColorHex}-${isIncident}`) so hundreds of 3D workloads share GPU textures with zero extra memory overhead.

## 2. Sculpted 3D Resource Silhouettes + K8s Icon Emblems (`web/src/canvas/topology.js`)

Each Kubernetes resource tier is rendered with a distinct 3D silhouette plus its official K8s SVG icon emblem (`userData.iconEmblem` floating badge + top medallion cap):
- **Pod (`pod.svg`):** Hexagonal container core inside dashed 7-sided K8s heptagon boundary + `pod.svg` top-cap decal & floating K8s icon badge.
- **ReplicaSet (`rs.svg`):** Triple-stacked heptagonal replica plates + `rs.svg` icon badge.
- **Deployment (`deploy.svg`):** 7-sided command tower with an outer rotating rollout halo ring + `deploy.svg` icon badge.
- **DaemonSet (`ds.svg`):** Node-hugging torus ring with satellite node pips + `ds.svg` icon badge.
- **StatefulSet (`sts.svg`):** Tiered storage monolith with horizontal persistent-volume bands + `sts.svg` icon badge.
- **Service (`svc.svg`):** Octahedral network router prism with equatorial port ring + `svc.svg` icon badge.
- **HTTPRoute / Gateway (`ing.svg`):** Elevated portal archway / dual-torus beacon at the top of the stack + `ing.svg` icon badge.

## 3. 4 Semantic Zoom Bands (`Macro`, `Cluster`, `Namespace`, `Micro`)

Camera distance from the target/scene center dynamically classifies `stats.zoomBand`:
1. **`Macro` (`dist > 75`):** Cluster monoliths, cluster plaques, and pulsing incident beacons/trouble badges.
2. **`Cluster` (`35 < dist <= 75`):** Namespace territories, 3D resource silhouettes, official K8s SVG icon emblems, vertical ownership beams, and trouble badges (healthy text labels hidden until pointer flyover).
3. **`Namespace` (`18 <= dist <= 35`):** Reveals top-level `Deployment` and `Gateway` text labels alongside K8s icon emblems.
4. **`Micro` (`dist < 18`):** Automatically reveals all nearby workload text labels (`Pod`, `ReplicaSet`, `DaemonSet`, `Service`, `HTTPRoute`).
