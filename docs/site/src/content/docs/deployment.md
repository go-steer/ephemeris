---
title: Deployment Guide (Cloud Run & GKE)
description: Deploying Ephemeris as a self-contained distroless container on Google Cloud Run or GKE with Workload Identity.
---

Ephemeris compiles its WebGL 3D spatial frontend, ArrowJS sandbox runtime, and Go orchestrator daemon into a single, zero-dependency static binary using Go's `embed.FS` (`internal/webui`). This allows seamless deployment to **Google Cloud Run** or **Google Kubernetes Engine (GKE)**.

## Multi-Stage Distroless Container

The repository includes a production-hardened 3-stage [`Dockerfile`](https://github.com/go-steer/ephemeris/blob/main/Dockerfile):

1. **Stage 1 (`web-builder`):** Uses `node:22-alpine` to compile the Vite WebGL bundle and mirror assets into `internal/webui/dist/`.
2. **Stage 2 (`go-builder`):** Uses `golang:1.24-alpine` to compile a statically linked Linux binary (`CGO_ENABLED=0`) embedding the frontend assets.
3. **Stage 3 (`runtime`):** Packages the binary into `gcr.io/distroless/static-debian12:nonroot` running as non-root user `65532:65532`.

```bash
# Build the container image locally
docker build -t ephemeris:latest .

# Run locally on port 8080
docker run --rm -p 8080:8080 -e EPHEMERIS_MODE=mock ephemeris:latest
```

---

## One-Command Deployment to Google Cloud Run

Use the automated [`dev/tools/deploy-cloud-run`](https://github.com/go-steer/ephemeris/blob/main/dev/tools/deploy-cloud-run) script to build and deploy Ephemeris directly to Cloud Run with **WebSocket Session Affinity** enabled.

```bash
# Deploy interactive mock cluster showcase (default)
dev/tools/deploy-cloud-run --project my-gcp-project --region us-central1

# Deploy in live mode using Cloud Run Service Account IAM + Vertex AI + Managed MCP
dev/tools/deploy-cloud-run \
  --project my-gcp-project \
  --region us-central1 \
  --mode live
```

### Why Session Affinity Matters

Because Ephemeris maintains stateful bi-directional WebSocket connections (`/ws`) between the 3D spatial canvas and the Go orchestrator hub, `dev/tools/deploy-cloud-run` automatically configures:

- `--session-affinity`: Ensures WebSocket upgrade handshakes and subsequent frames route to the same instance.
- `--timeout=3600`: Prevents premature termination of active incident triage streams.

---

## Environment Variables & CLI Flags

The binary automatically inspects environment variables when flags are not explicitly provided on the command line:

| Environment Variable | CLI Flag    | Default  | Description                                                                        |
| :------------------- | :---------- | :------- | :--------------------------------------------------------------------------------- |
| `PORT`               | `-port`     | `8080`   | HTTP and WebSocket listen port (injected automatically by Cloud Run).              |
| `EPHEMERIS_MODE`     | `-mode`     | `mock`   | Telemetry mode: `mock` (synthetic 3-cluster topology) or `live` (GCP Managed MCP). |
| `GCP_PROJECT`        | `-project`  | _(auto)_ | Target Google Cloud Project ID for Vertex AI (`gemini-3.8-flash`) and MCP queries. |
| `GCP_LOCATION`       | `-location` | `global` | Google Cloud region/location for Vertex AI endpoints.                              |

---

## IAM & Workload Identity Configuration (`-mode=live`)

When running in `live` mode on Cloud Run or GKE Workload Identity, attach a dedicated Google Cloud Service Account with least-privilege read-only roles:

```bash
# Grant read-only GKE topology discovery
gcloud projects add-iam-policy-binding my-gcp-project \
  --member="serviceAccount:ephemeris-sa@my-gcp-project.iam.gserviceaccount.com" \
  --role="roles/container.viewer"

# Grant Cloud Logging query access for pod telemetry
gcloud projects add-iam-policy-binding my-gcp-project \
  --member="serviceAccount:ephemeris-sa@my-gcp-project.iam.gserviceaccount.com" \
  --role="roles/logging.viewer"

# Grant Vertex AI user access for gemini-3.8-flash UI synthesis
gcloud projects add-iam-policy-binding my-gcp-project \
  --member="serviceAccount:ephemeris-sa@my-gcp-project.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

> **Note:** Even if broader IAM permissions are granted to the service account, Ephemeris enforces a strict client-side read-only MCP tool whitelist (`AllowedReadTools`) in `pkg/mcp/client.go`.

---

## Shared Demo Environments & 1-Click Reset

When hosting a shared demo instance on Cloud Run for multiple reviewers:

- After a reviewer executes a **1-Click Rollback** or **Memory Hot-Patch**, the `payment-service` pod transitions to healthy Google Green (`#34A853`) and clears cluster alert plaques.
- Any reviewer can click the **↺ Reset Incident** button in the top navigation bar at any time to restore `payment-service` to its `CrashLoopBackOff` state (`#EA4335`) and re-trigger the spatial alert glow.
