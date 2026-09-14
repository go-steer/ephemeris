---
title: Architecture & Systems
description: High-level system architecture, security isolation, and data flows.
---

## System Overview

```mermaid
flowchart TD
    subgraph Client["Browser (Single Page App)"]
        Canvas["WebGL Canvas (Three.js)\n3D Topology Mesh"]
        Sandbox["ArrowJS Sandbox\nIsolated ShadowRoot"]
    end

    subgraph Backend["Backend Orchestrator (Go)"]
        Hub["WebSocket Hub (/ws)"]
        Agent["Gemini Agent Engine"]
    end

    subgraph External["External Services"]
        Vertex["Vertex AI (gemini-3.8-flash, global)"]
        MCP["GCP Managed MCP (Logging / GKE)"]
    end

    Canvas -- "Context & Selection (WSS)" --> Hub
    Hub -- "Telemetry Request" --> MCP
    MCP -- "Live Telemetry JSON" --> Hub
    Hub -- "Prompt + Telemetry" --> Vertex
    Vertex -- "ArrowJS Code" --> Hub
    Hub -- "Executable Payload" --> Sandbox
    Sandbox -- "Mount Reactive Widget" --> Canvas
```

## Security & Sandboxing

1. **DOM Isolation:** ArrowJS components execute inside an isolated `ShadowRoot` overlaying the canvas.
2. **API Masking:** Global APIs (`window`, `localStorage`, `document`, `fetch`) are masked as `undefined` in the evaluator scope.
3. **Read-Only MCP Whitelist:** Outbound tool calls strictly enforce read-only semantics (`GET` only).
