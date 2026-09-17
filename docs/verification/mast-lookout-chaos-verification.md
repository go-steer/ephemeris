# Phase 7 Verification Guide: `go-steer/mast` Runtime, `k8s-lookout` MCP Diagnostics, & Chaos Scenario Injector

This document describes the architecture, operational modes, and end-to-end verification procedures for Phase 7 (`feat/mast-lookout-chaos`).

---

## 1. Architecture & Packaging: Built-In vs. External Process

Both **`go-steer/mast`** and **`go-steer/k8s-lookout`** are embedded directly into the single `ephemeris` Go binary for zero-dependency local execution, while supporting optional external MCP processes in production:

| Component | Operational Mode | Implementation Details |
| :--- | :--- | :--- |
| **`go-steer/mast` Agent Runtime Harness** (`pkg/orchestrator/mast_harness.go`) | **100% Built-In (In-Process)** | Runs directly inside the `ephemeris` Go orchestrator daemon (`pkg/orchestrator/server.go`). Coordinates the `ephemeris-spatial-ops` `WorkloadBundle`, executes the 3 specialists (`intent-router` -> `lookout-diagnostics` -> `arrowjs-compiler`), enforces turn budgets (`MaxTurns`), and records structured session transcripts (`MastTranscriptEntry`). |
| **`go-steer/k8s-lookout` MCP Diagnostics** (`pkg/mcp/lookout.go`) | **Dual-Mode: Built-In Engine (Default) + External MCP Support** | **1. Built-In Engine (Zero-Dependency Default):** Embeds `k8s-lookout`'s diagnostic check rules (`lookout_triage`, `lookout_events`, `lookout_top`, `lookout_resources`), secret sanitizer (`SanitizeFinding` scrubbing `secret/`, `token`, `Bearer`, `password` per `k8s-lookout` §6.5), deterministic SHA-256 fingerprint generator (`lk8s-...`), and v1 summary envelope (`scanned=N findings=N elapsed=Dms`) directly inside `pkg/mcp/lookout.go`.<br>**2. External `lookout mcp` Process (Optional):** When `-lookout-mcp-endpoint` (env: `LOOKOUT_MCP_ENDPOINT`) is provided, `LookoutClient` dispatches JSON-RPC `tools/call` requests to an external `lookout mcp` server first, falling back to the built-in engine if offline. |
