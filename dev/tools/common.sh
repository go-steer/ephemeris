#!/usr/bin/env bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Shared helpers for dev/tools/* scripts.
#
# Source this from each tool with:
#   . "$(dirname "$0")/common.sh"

set -euo pipefail

repo_root() {
  git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel
}

ensure_node_deps() {
  local root
  root="$(repo_root)"
  if [[ -d "$root/node_modules" ]]; then
    return 0
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "ensure_node_deps: npm not found on PATH" >&2
    return 1
  fi
  echo "▸ installing node dependencies (one-time)…" >&2
  (cd "$root" && npm install --silent)
}

ensure_tool() {
  local name="$1"
  local target="$2"
  if command -v "$name" >/dev/null 2>&1; then
    return 0
  fi
  local gobin
  gobin="${GOBIN:-$(go env GOPATH)/bin}"
  if [[ -x "$gobin/$name" ]]; then
    export PATH="$gobin:$PATH"
    return 0
  fi
  echo "▸ $name not found — installing $target into $gobin" >&2
  GOBIN="$gobin" go install "$target"
  export PATH="$gobin:$PATH"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "ensure_tool: $name still missing after install" >&2
    return 1
  fi
}

run_step() {
  local label="$1"; shift
  printf '\n\033[1m▸ %s\033[0m\n' "$label"
  "$@"
}
