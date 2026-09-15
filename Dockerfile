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

# Stage 1: Build Three.js & ArrowJS frontend assets
FROM node:24-alpine AS web-builder
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js ./
COPY web/ ./web/
RUN npx vite build

# Stage 2: Build Go single-binary daemon embedding web assets
FROM golang:1.25-alpine AS go-builder
WORKDIR /workspace
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ ./cmd/
COPY pkg/ ./pkg/
COPY internal/ ./internal/
COPY --from=web-builder /workspace/dist/ ./internal/webui/dist/
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/ephemeris ./cmd/ephemeris

# Stage 3: Distroless non-root runtime container for Google Cloud Run
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=go-builder /out/ephemeris /app/ephemeris
ENV PORT=8080
ENV EPHEMERIS_MODE=mock
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/ephemeris"]
