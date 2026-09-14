---
title: 3D Spatial Canvas
description: WebGL 3D Kubernetes topology rendering, camera controls, and selection raycasting.
---

## 3D Hierarchy Representation

The WebGL canvas parses Kubernetes cluster topology into an interactive 3D scene:

- **Cluster Core:** Central glowing origin representing the GCP GKE cluster.
- **Namespace Rings:** Orbital concentric rings grouping related services.
- **Pods:** 3D nodes positioned in their namespace orbits.

## Node Status Visuals

| Status | Color | Visual Effect |
| :--- | :--- | :--- |
| **Running** | Neon Cyan / Green (`#00e5ff` / `#00ff88`) | Steady glow |
| **CrashLoopBackOff / Error** | Neon Red (`#ff0055`) | Pulsing strobe |
| **Pending / Initializing** | Amber (`#ffaa00`) | Breathing glow |

## Raycaster Interaction

Clicking any 3D node:
1. Calculates intersection via Three.js `Raycaster`.
2. Animates camera targeting and orbit controls focus onto the selected pod.
3. Renders an animated targeting ring around the active pod.
4. Broadcasts `select_node` event over WebSocket to prime backend telemetry caches.
