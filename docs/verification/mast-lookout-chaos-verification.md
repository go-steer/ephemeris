# Phase 7 Verification Guide: `go-steer/mast` Runtime, `k8s-lookout` MCP Diagnostics, & Chaos Scenario Injector

This document describes the architecture, operational modes, and end-to-end verification procedures for Phase 7 (`feat/mast-lookout-chaos`).

---

## 1. Architecture & Packaging: Built-In vs. External Process

Both **`go-steer/mast`** and **`go-steer/k8s-lookout`** are embedded directly into the single `ephemeris` Go binary for zero-dependency local execution, while supporting optional external MCP processes in production:

| Component | Operational Mode | Implementation Details |
| :--- | :--- | :--- |
| **`go-steer/mast` Agent Runtime Harness** (`pkg/orchestrator/mast_harness.go`) | **100% Built-In (In-Process)** | Runs directly inside the `ephemeris` Go orchestrator daemon (`pkg/orchestrator/server.go`). Coordinates the `ephemeris-spatial-ops` `WorkloadBundle`, executes the 3 specialists (`intent-router` -> `lookout-diagnostics` -> `arrowjs-compiler`), enforces turn budgets (`MaxTurns`), and records structured session transcripts (`MastTranscriptEntry`). |
| **`go-steer/k8s-lookout` MCP Diagnostics** (`pkg/mcp/lookout.go`) | **Dual-Mode: Built-In Engine (Default) + External MCP Support** | **1. Built-In Engine (Zero-Dependency Default):** Embeds `k8s-lookout`'s diagnostic check rules (`lookout_triage`, `lookout_events`, `lookout_top`), secret sanitizer (`SanitizeFinding` scrubbing `secret/`, `token`, `Bearer`, `password` per `k8s-lookout` §6.5), deterministic SHA-256 fingerprint generator (`lk8s-...`), and v1 summary envelope (`scanned=N findings=N elapsed=Dms`) directly inside `pkg/mcp/lookout.go`.<br>**2. External `lookout mcp` Process (Optional):** When `-lookout-mcp-endpoint` (env: `LOOKOUT_MCP_ENDPOINT`) is provided, `LookoutClient` dispatches JSON-RPC `tools/call` requests to an external `lookout mcp` server first, falling back to the built-in engine if offline. |

---

## 2. Automated E2E Verification (`cmd/verify`)

To verify the full WebSocket protocol handshake (`init` -> `topology` -> `prompt` -> `status` -> `ui_component`), `MastHarness` specialist pipeline, and Vertex AI `gemini-3.8-flash` (`Location: "global"`) polymorphic UI synthesis:

```bash
# 1. Build and start the ephemeris daemon
go build -o bin/ephemeris ./cmd/ephemeris
./bin/ephemeris -mode=mock -port 8080 -gcp-project=gke-demos-345619 &

# 2. Run automated WebSocket E2E verifier
go run ./cmd/verify -url http://localhost:8080
```

---

## 3. Interactive Browser Verification (`http://localhost:8080`)

Open **`http://localhost:8080`** in your browser to interactively test the 4 Phase 7 capabilities:

### 3.1 Interactive Chaos Scenario Injector (`#hud-scenario-select`)
Use the amber **⚡ Scenario** dropdown in the top HUD bar to trigger live multi-cluster chaos scenarios:
1. **`Scenario: Baseline (Payment Crash)` (`default`)**:
   - `payment-service` in `production-us-central1` is in `CrashLoopBackOff` (`SIGSEGV nil pointer dereference at server.go:142`).
   - `batch-ingestor` in `staging-us-east1` is `Pending` (`0/6 nodes available: Insufficient cpu`).
2. **`🔥 Scenario: Redis OOM Cascade` (`redis-oom`)**:
   - Watch the 3D WebGL scene live-update as `redis-cart`, `cart-service`, and `checkout-service` transition to red pulsing `CrashLoopBackOff` / `Failed` states.
   - Click the **🚨 Fleet Issues** chip (`Which pods have issues?`) to inspect all cascading failures in the Multi-Cluster Fleet Issues Matrix.
   - Click **Logs** on `redis-cart` to inspect authentic Linux kernel `Out of memory: Killed process 1 (redis-server) anon-rss:4190MB` logs.
3. **`📈 Scenario: Checkout Traffic Spike` (`traffic-spike`)**:
   - Watch `checkout-service-scale-2` appear as an amber `Pending` autoscaler replica while `frontend` and `checkout-service` experience 95% CPU saturation.
   - Click **📊 Resource Leaderboard** chip to inspect live CPU/Memory saturation bars.
4. **`🟢 Scenario: All Healthy (0 Issues)` (`healthy`)**:
   - Watch all 12 pods across all 3 clusters turn green (`Running`).
   - Click **🚨 Fleet Issues** chip to view the celebratory **✨ ALL CLUSTERS HEALTHY — 0 ACTIVE INCIDENTS** card with quick scenario injection buttons (`🔥 Inject Redis OOM Cascade`, `📈 Inject Traffic Spike`, `💥 Restore Payment Crash`).

### 3.2 Natural-Language Chaos Prompts
You can also trigger scenario mutations via natural language in the bottom prompt bar:
- `"Simulate a Redis OOM cascade"`
- `"Trigger a checkout traffic spike"`
- `"Make all clusters healthy"`

### 3.3 `go-steer/k8s-lookout` MCP Findings & v1 Envelope
In any **Fleet Issues Matrix** view (`Which pods have issues?`), scroll to the **`🔍 GO-STEER/K8S-LOOKOUT MCP FINDINGS`** section at the bottom of the panel:
- Verify the v1 summary envelope badge (`scanned=12 findings=N elapsed=Dms`).
- Verify each finding displays its deterministic `lk8s-...` fingerprint (`GenerateFingerprint`), check source (`lookout_triage`, `lookout_events`, `lookout_top`), and secret-sanitized diagnostic summary.

### 3.4 Stateful Backend Remediation (`MsgTypeRemediate`)
- While in the `Baseline (Payment Crash)` or `Redis OOM Cascade` scenario, click **Fix Now** on a failing pod in the Fleet Issues Matrix (or click **⚡ Execute Remediation** in the Single-Pod Cockpit).
- Verify that:
  1. The pod turns green (`Running`) in the 3D WebGL mesh and HUD status bar.
  2. Re-querying **🚨 Fleet Issues** or refreshing the browser page preserves the `Running` state because the backend mutated `MockProvider` state and broadcast the updated topology over WebSocket.
