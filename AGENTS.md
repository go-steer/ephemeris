# ephemeris project memory

When an AGENTS.md-aware agent runs inside this repo, this file is loaded into the agent's system prompt as the project-level instruction prefix. Keep it short and load-bearing.

## What this project is

`ephemeris` is a generative spatial observability platform that replaces static dashboards with an interactive 3D WebGL topological mesh of Google Kubernetes Engine (GKE) clusters, utilizing Gemini models (`gemini-3.8-flash` on Vertex AI) to generate ephemeral, task-specific ArrowJS reactive control interfaces precisely at the moment of a cloud infrastructure incident.

It combines:
- **WebGL 3D Topology Mesh:** Interactive hierarchical 3D node graph (Cluster -> Namespaces -> Pods) rendered using Three.js with real-time status glow (green/red/amber) and raycaster selection.
- **Agentic UI Runtime (ArrowJS):** Secure `@arrow-js/core` reactive UI runtime executing inside an isolated `ShadowRoot` overlaying the canvas, with global browser APIs masked to prevent DOM/storage escaping.
- **Go Orchestrator Daemon:** High-performance Go WebSocket hub (`/ws`) bridging user spatial context, GCP Managed MCP telemetry, and Vertex AI agent compilation.
- **Dual-Mode Telemetry:** High-fidelity mock cluster provider for rapid zero-dependency local iteration, and GCP Managed MCP provider (`container.googleapis.com/mcp`, `logging.googleapis.com/mcp`) via ADC for live production triage.

## Layout

```
cmd/ephemeris/        Main server binary entrypoint.
pkg/
  api/                WebSocket message protocols (types.go) and DTOs.
  gke/                GKE topology provider interface, mock engine, and MCP provider.
  telemetry/          Pod telemetry and log query interface, mock generator, and MCP logging.
  orchestrator/       WebSocket hub, Vertex AI agent compiler, and prompt assembler.
  mcp/                Read-only GCP MCP client with ADC token authentication.
internal/
  webui/              Single-binary embed.FS wrapper (embeds dist/ with .gitkeep).
web/                  Frontend source (Three.js canvas, ArrowJS sandbox, SRE HUD, styles).
dev/
  tools/              Standalone developer tooling (ci, build, test, lint, format).
  ci/presubmits/      Thin one-line delegators executed by GitHub Actions.
docs/
  design/             Architectural specifications and design documents.
  verification/       End-to-end verification guides and walkthroughs.
  site/               Astro Starlight documentation site.
.github/
  workflows/          ci.yml, docs.yml, ci-docs.yml.
```

## Non-Negotiable Operational Rules

1. **Always use git worktrees for each feature branch:**
   Never switch branches in-place in the primary working tree for non-trivial feature work. Always spawn an isolated git worktree:
   ```bash
   git worktree add ../ephemeris-<feature-name> -b feat/<feature-name>
   ```
   When work is merged or abandoned, clean it up:
   ```bash
   git worktree remove ../ephemeris-<feature-name>
   ```

2. **Always run presubmits locally when possible:**
   Before pushing a branch or opening a PR, run the local aggregator:
   ```bash
   dev/tools/ci
   ```
   A green local run must match remote CI. Fast-fail order ensures checks complete in under 60 seconds.

3. **License headers on all source files:**
   Every Go, TypeScript, JavaScript, CSS, Shell, and YAML file must include the canonical Google LLC Apache 2.0 boilerplate.

4. **Zero-dependency fresh clone guarantee:**
   `internal/webui/dist/.gitkeep` must be preserved. A developer on a fresh clone must be able to run `go build` or `go test` immediately without being forced to build web assets first.

5. **Explicit package scoping for Go commands:**
   When running `go vet`, `go build`, or `go test`, always explicitly target `./cmd/... ./pkg/... ./internal/...` to prevent Go from accidentally traversing into `node_modules`.

6. **Small, self-contained commits with Conventional Commits:**
   Subject lines use `feat:`, `fix:`, `docs:`, `ci:`, `chore:`, `test:`. Rebase feature branches on `main`; do not merge commits.

7. **Persist all architectural plans and verification walkthroughs in repo docs:**
   Always write architectural design documents and implementation plans to `docs/design/` and all verification guides and walkthroughs to `docs/verification/` so design and verification artifacts are version-controlled alongside the code.

## Build & Test Commands

```bash
dev/tools/ci              # Run all presubmits locally in fast-fail order
dev/tools/ci --keep-going # Run all checks without stopping on first failure
dev/tools/go-build        # Build Go packages
dev/tools/go-test         # Run Go unit tests with race detector and coverage
dev/tools/lint-go         # Run golangci-lint (auto-installs v2.12.1)
dev/tools/fix-go-format   # Auto-fix Go formatting (gofmt -s + goimports)
dev/tools/build           # Bundle frontend assets into dist/ and internal/webui/dist/
dev/tools/test-unit       # Run web unit tests (vitest)
dev/tools/lint-js         # Run ESLint on web sources
dev/tools/lint-css        # Run Stylelint on CSS
dev/tools/fix-format      # Auto-fix web formatting (prettier)
dev/tools/dev             # Launch local development servers (Go backend + Vite HMR)
```

## Key Architectural Decisions & Gotchas

- **Vertex AI Model:** Target `gemini-3.8-flash` in `global` location using Application Default Credentials (ADC).
- **ArrowJS Sandboxing:** LLM-generated UI code runs strictly inside a `ShadowRoot` overlaying the canvas. Mask global objects (`window`, `localStorage`, `document`, `fetch`) as `undefined`.
- **Read-Only MCP Guardrails:** The MCP client enforces a strict read-only whitelist, dropping any non-GET requests.
