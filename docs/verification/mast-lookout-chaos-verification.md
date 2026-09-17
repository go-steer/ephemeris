# Verification Guide: Mast Harness, k8s-lookout MCP Resources, Instant Sandbox Clear & Multi-Panel Pinning

## 1. Automated Verification Suite
Run the local CI aggregator to execute all unit tests, linters, and vulnerability scans:
```bash
./dev/tools/ci
```
- **Frontend (`vitest`):** `48/48` tests passing across `5` test suites (`web/src/main.test.js`, `web/src/sandbox/runtime.test.js`, `web/src/canvas/topology.test.js`, `web/src/canvas/controls.test.js`, `web/src/ws/client.test.js`).
- **Backend (`go test -race`):** All Go unit tests passing (`pkg/orchestrator`, `pkg/mcp`, `pkg/gke`, `pkg/telemetry`).

## 2. Automated E2E Verification
With the server running on `:8080`, execute the automated E2E verifier:
```bash
go run ./cmd/verify -url http://localhost:8080
```

## 3. Interactive Verification Walkthrough (`http://localhost:8080`)
1. **Dynamic Per-Kind Filtering (`lookout_resources` MCP Tool):**
   - Run `"show me the statefulsets"` $\rightarrow$ Renders exclusively `StatefulSet/redis-cart` with filter pill `StatefulSet` active and MCP badge `MCP tool=lookout_resources(kinds=[StatefulSet])`.
   - Run `"show me the deployments"` $\rightarrow$ Renders exclusively `Deployment` controllers (`deploy-frontend`, `deploy-cart-service`, `deploy-checkout-service`, `deploy-payment-service`).
   - Run `"show gateways and routes"` $\rightarrow$ Renders exclusively `Gateway + HTTPRoute` (`boutique-gateway`, `checkout-route`).
2. **Instant `t = 0ms` Sandbox Clear & Live Stepper:**
   - Submit any new prompt while a panel is open $\rightarrow$ Verify that the previous ArrowJS component is **cleared immediately at `t = 0ms`** and replaced by the **Gemini 3.8 Flash Live Synthesis & MCP Execution** stepper with a real-time `TTI` counter (`0.1s...`, `0.2s...`).
3. **Multi-Panel Pinning (`📌 Pin Panel`):**
   - Click the **📌** button in the top-right header of any floating panel to pin it (border and icon glow cyan).
   - Submit another prompt or click another 3D node $\rightarrow$ Verify that a **second draggable floating panel window** spawns offset by `(+28px, +28px)`, allowing side-by-side comparison over the 3D spatial mesh.
