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

# Convenience entrypoints. Real logic lives in dev/tools/.
# Same scripts run locally and in CI — "green local = green remote."

.PHONY: all dev build test lint format ci go-vet go-build go-test tidy vuln clean

all: ci

# Launch local development environment (Go backend + Vite HMR).
dev:
	./dev/tools/dev

# Build distributable bundle into ./dist/ and internal/webui/dist/.
build:
	./dev/tools/build

# Run web unit tests.
test:
	./dev/tools/test-unit

# Run all linters (JS, CSS, Go).
lint:
	./dev/tools/lint-js
	./dev/tools/lint-css
	./dev/tools/lint-go

# Verify formatting across web and Go.
format:
	./dev/tools/verify-format
	./dev/tools/verify-go-format

# Auto-fix formatting across web and Go.
fix:
	./dev/tools/fix-format
	./dev/tools/fix-go-format

# Run every presubmit in sequence — identical to what CI runs.
ci:
	./dev/tools/ci

go-vet:
	./dev/tools/go-vet

go-build:
	./dev/tools/go-build

go-test:
	./dev/tools/go-test

tidy:
	./dev/tools/verify-mod-tidy

vuln:
	./dev/tools/verify-vuln

clean:
	rm -rf dist bin coverage.out
