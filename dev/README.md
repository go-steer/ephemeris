# dev/

Build-, test-, and lint-tooling. The same scripts power both local development and GitHub Actions CI, ensuring "green local = green remote."

## Quickstart

```bash
# Run every presubmit check locally (fast-fail order)
dev/tools/ci

# Run all checks even after a failure (report all problems)
dev/tools/ci --keep-going

# Auto-fix formatting across Go and web assets
dev/tools/fix-format
dev/tools/fix-go-format

# Launch local dev servers (Go backend + Vite HMR)
dev/tools/dev
```

Missing tools (`golangci-lint`, `goimports`, `govulncheck`, `node_modules`) auto-install on first use.

## Layout

```
dev/
├── tools/                 # Entrypoints run locally and by Makefile
│   ├── ci                 # Aggregator — runs every check in sequence
│   ├── common.sh          # Shared helper functions (ensure_tool, run_step)
│   ├── dev                # Local development server with Vite HMR
│   ├── build              # Vite bundler -> dist/ and internal/webui/dist/
│   ├── test-unit          # Vitest runner for web tests
│   ├── lint-js            # ESLint runner
│   ├── lint-css           # Stylelint runner
│   ├── verify-format      # Prettier check (read-only)
│   ├── fix-format         # Prettier auto-fixer
│   ├── go-vet             # go vet ./cmd/... ./pkg/... ./internal/...
│   ├── go-build           # go build ./cmd/... ./pkg/... ./internal/...
│   ├── go-test            # go test -race -cover ./cmd/... ./pkg/... ./internal/...
│   ├── verify-go-format   # gofmt -s + goimports check (read-only)
│   ├── fix-go-format      # gofmt -s -w + goimports -w auto-fixer
│   ├── lint-go            # golangci-lint (v2.12.1)
│   ├── .golangci.yml      # Conservative linter configuration
│   ├── verify-mod-tidy    # go mod tidy clean check
│   └── verify-vuln        # govulncheck scanner
└── ci/
    └── presubmits/        # Thin one-line delegators executed by GitHub Actions
```
