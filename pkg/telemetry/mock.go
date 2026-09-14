// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package telemetry

import (
	"context"
	"strings"
	"time"

	"github.com/go-steer/ephemeris/pkg/api"
)

// MockProvider generates realistic container logs with timestamps and severities.
type MockProvider struct{}

// NewMockProvider creates a new mock telemetry provider.
func NewMockProvider() *MockProvider {
	return &MockProvider{}
}

// QueryLogs returns realistic container logs based on the requested resource URI.
func (m *MockProvider) QueryLogs(_ context.Context, resourceURI string, limit int) (*api.TelemetryData, error) {
	if limit <= 0 {
		limit = 50
	}

	if strings.Contains(resourceURI, "payment-service") {
		return m.failingPaymentLogs(resourceURI, limit), nil
	}

	return m.healthyServiceLogs(resourceURI, limit), nil
}

func (m *MockProvider) failingPaymentLogs(resourceURI string, limit int) *api.TelemetryData {
	now := time.Now().UTC()
	t := func(offsetSeconds int) string {
		return now.Add(time.Duration(-offsetSeconds) * time.Second).Format("2006-01-02T15:04:05.000Z")
	}

	rawLogs := []api.LogEntry{
		{
			Timestamp: t(180),
			Severity:  "INFO",
			Message:   "Starting payment-service v2.1.4 (commit: 9f8a32b, arch: amd64)",
			Source:    "main.go:42",
		},
		{
			Timestamp: t(175),
			Severity:  "INFO",
			Message:   "Listening for gRPC requests on :50051 (TLS disabled for mesh)",
			Source:    "server.go:88",
		},
		{
			Timestamp: t(150),
			Severity:  "INFO",
			Message:   "Initializing connection pool to postgres-payment.db.internal:5432 (max_conn=50)",
			Source:    "db.go:34",
		},
		{
			Timestamp: t(120),
			Severity:  "WARNING",
			Message:   "Elevated query latency observed on db connection pool: 485ms (threshold: 200ms)",
			Source:    "pool.go:118",
		},
		{
			Timestamp: t(90),
			Severity:  "ERROR",
			Message:   "Connection attempt 1 to postgres-payment.db.internal:5432 timed out after 5000ms",
			Source:    "client.go:67",
		},
		{
			Timestamp: t(60),
			Severity:  "ERROR",
			Message:   "Connection attempt 2 to postgres-payment.db.internal:5432 timed out after 5000ms",
			Source:    "client.go:67",
		},
		{
			Timestamp: t(45),
			Severity:  "FATAL",
			Message:   "connection pool exhausted: failed to acquire connection to postgres-payment.db.internal:5432 after 30000ms",
			Source:    "pool.go:214",
		},
		{
			Timestamp: t(30),
			Severity:  "FATAL",
			Message:   "panic: runtime error: invalid memory address or nil pointer dereference",
			Source:    "server.go:142",
		},
		{
			Timestamp: t(29),
			Severity:  "FATAL",
			Message:   "goroutine 42 [running]: github.com/boutique/payment/server.(*PaymentServer).ProcessPayment(0xc00010e000, 0xc000124000)",
			Source:    "server.go:142",
		},
		{
			Timestamp: t(28),
			Severity:  "FATAL",
			Message:   "github.com/boutique/payment/server.handler(0xc00010e000, {0x8b3200, 0xc000124000}) at /go/src/payment/server.go:88 +0x65",
			Source:    "server.go:88",
		},
		{
			Timestamp: t(15),
			Severity:  "ERROR",
			Message:   "Container terminated with exit code 2 (SIGSEGV)",
			Source:    "kubelet",
		},
		{
			Timestamp: t(5),
			Severity:  "WARNING",
			Message:   "Back-off restarting failed container payment-service in pod payment-service-84f7b6_production (restarts=14)",
			Source:    "kubelet",
		},
	}

	if len(rawLogs) > limit {
		rawLogs = rawLogs[len(rawLogs)-limit:]
	}

	return &api.TelemetryData{
		ResourceURI: resourceURI,
		PodID:       "pod-payment-service-84f7b6",
		Metrics: map[string]string{
			"status":    "CrashLoopBackOff",
			"restarts":  "14",
			"cpu":       "980m",
			"memory":    "1.8Gi",
			"oom_kills": "2",
			"exit_code": "2",
		},
		Logs: rawLogs,
	}
}

func (m *MockProvider) healthyServiceLogs(resourceURI string, limit int) *api.TelemetryData {
	now := time.Now().UTC()
	t := func(offsetSeconds int) string {
		return now.Add(time.Duration(-offsetSeconds) * time.Second).Format("2006-01-02T15:04:05.000Z")
	}

	rawLogs := []api.LogEntry{
		{
			Timestamp: t(60),
			Severity:  "INFO",
			Message:   "Service health check OK (200 OK, latency=4ms)",
			Source:    "healthz.go:19",
		},
		{
			Timestamp: t(40),
			Severity:  "INFO",
			Message:   "Handled 142 HTTP requests in last 30s window (p99=12ms, errors=0)",
			Source:    "metrics.go:55",
		},
		{
			Timestamp: t(10),
			Severity:  "INFO",
			Message:   "Service mesh ingress mTLS handshake successful (upstream=envoy-sidecar)",
			Source:    "mesh.go:82",
		},
	}

	if len(rawLogs) > limit {
		rawLogs = rawLogs[len(rawLogs)-limit:]
	}

	return &api.TelemetryData{
		ResourceURI: resourceURI,
		PodID:       "pod-healthy-service",
		Metrics: map[string]string{
			"status":   "Running",
			"restarts": "0",
			"cpu":      "120m",
			"memory":   "256Mi",
		},
		Logs: rawLogs,
	}
}
