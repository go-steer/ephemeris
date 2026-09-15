---
title: SRE Controls & Blast Radius
description: Interactive traffic draining, multi-action incident playbooks, 3D blast radius visualization, and progressive Vertex AI streaming.
---

Ephemeris transforms passive observability into an active, spatial incident response cockpit. When a Kubernetes resource experiences degradation, the Three.js WebGL canvas and the ArrowJS ShadowRoot sandbox synchronize to provide immediate situational awareness and surgical remediation controls.

## 1. 3D Spatial Blast Radius Visualization

When an engineer selects a failing pod (or issues a natural-language triage prompt), `TopologyMesh.highlightBlastRadius()` illuminates the incident's blast radius across the 3D scene:

- **Google Amber (`#FBBC04`) Highlighting:** Upstream callers (such as `cart-service` calling `payment-service`) and downstream dependencies glow in vibrant Google Amber.
- **Conduit Flow Illumination:** The quadratic Bezier conduits connecting impacted services shift to high-opacity amber with bright flow particles, visually mapping failure propagation across the cluster.
- **Automated Recovery:** Executing any remediation playbook or returning to the cluster overview automatically invokes `clearBlastRadius()`, smoothly restoring default Kubernetes Blue (`#326CE5`) boundaries.

## 2. Interactive Inbound Traffic Drain

To mitigate user-facing impact while investigating root causes, the generated ArrowJS incident widget provides a live **Inbound Traffic Drain** slider (0% – 100%):

- **Reactive Control:** Adjusting the slider dispatches `ephemeris-traffic-drain` custom events from the isolated `ShadowRoot` to the 3D canvas.
- **Real-Time Conduit Dampening:** `TopologyMesh.setTrafficDrain(podId, percent)` dynamically scales the opacity and particle velocity of incoming 3D traffic conduits. Draining to `0%` visually pauses particle ingress and isolates the pod.

## 3. Multi-Action Incident Playbooks

Rather than a single static button, the ephemeral ArrowJS cockpit synthesizes context-aware operational interventions:

1. **1-Click Rollback to Stable Release (`v2.1.3`):** Reverts faulty deployments and clears exponential crash backoffs.
2. **Hot-Patch Memory Limit (`512Mi` → `2Gi`):** Dynamically adjusts container resource limits to resolve OOM-kill panics.
3. **Restart Pod Container:** Evicts and reschedules clean pod instances.

Each action triggers a stepped execution simulation and transitions the 3D pod mesh, billboard label, namespace rim, and cluster monolith LED slit back to healthy Google Green (`#34A853`).

## 4. Live Vertex AI Token Streaming

When compiling ephemeral UI components via `gemini-3.8-flash` on Vertex AI, Ephemeris uses `GenerateContentStream` to deliver progressive status updates over WebSocket (`/ws`):

- The floating HUD panel opens immediately in `STREAMING` mode (`TTI: LIVE...`).
- Live reasoning steps (_"Analyzing container panic trace..."_, _"Streaming ArrowJS UI tokens..."_) are displayed in real time before the compiled reactive component is mounted.
