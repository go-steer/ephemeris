---
title: Getting Started
description: Quickstart guide for running and developing ephemeris.
---

## Prerequisites

- **Go:** 1.26+
- **Node.js:** 24+
- **npm:** 11+
- **gcloud CLI:** (optional, required only for live GCP MCP mode)

## Running Locally (Mock Mode)

The default mock mode runs with zero external credentials or network dependencies:

```bash
# Build web assets and Go daemon
make build

# Launch the server
./bin/ephemeris -port=8080 -mode=mock
```

Open `http://localhost:8080` in Chrome or Firefox.

## Development with Hot Module Reloading (Vite)

To develop with live frontend hot-reloading:

```bash
make dev
```

This runs:
- The Go backend on `http://localhost:8080`
- The Vite development server on `http://localhost:5173` with WebSocket proxying

## Running Presubmits

Before pushing or opening a PR, run:

```bash
dev/tools/ci
```
