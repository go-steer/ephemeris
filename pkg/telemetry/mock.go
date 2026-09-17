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
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/go-steer/ephemeris/pkg/api"
)

// MockProvider generates realistic container logs with timestamps and severities.
type MockProvider struct {
	mu             sync.RWMutex
	activeScenario string
	remediated     map[string]bool
}

// NewMockProvider creates a new mock telemetry provider.
func NewMockProvider() *MockProvider {
	return &MockProvider{
		activeScenario: "default",
		remediated:     make(map[string]bool),
	}
}

// SetScenario sets the active chaos incident scenario and clears remediation overrides.
func (m *MockProvider) SetScenario(scenarioID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if scenarioID == "" {
		scenarioID = "default"
	}
	m.activeScenario = scenarioID
	m.remediated = make(map[string]bool)
}

// RecordRemediation marks a pod as remediated so subsequent log queries show recovery.
func (m *MockProvider) RecordRemediation(podIDOrName string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	target := strings.ToLower(strings.TrimSpace(podIDOrName))
	m.remediated[target] = true
	if strings.Contains(target, "redis") {
		m.remediated["cart-service"] = true
		m.remediated["checkout-service"] = true
	}
}

func (m *MockProvider) isRemediated(resourceURI string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.activeScenario == "healthy" {
		return true
	}
	lower := strings.ToLower(resourceURI)
	for k, v := range m.remediated {
		if v && strings.Contains(lower, k) {
			return true
		}
	}
	return false
}

// QueryLogs returns realistic container logs based on the requested resource URI and active scenario.
func (m *MockProvider) QueryLogs(_ context.Context, resourceURI string, limit int) (*api.TelemetryData, error) {
	if limit <= 0 {
		limit = 50
	}

	if m.isRemediated(resourceURI) {
		data := m.healthyServiceLogs(resourceURI, limit)
		now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		data.Logs = append(data.Logs, api.LogEntry{
			Timestamp: now,
			Severity:  "INFO",
			Message:   "[REMEDIATION] Executed rollback to stable revision; readiness probe succeeded (200 OK, 0 errors)",
			Source:    "kubelet",
		})
		return data, nil
	}

	m.mu.RLock()
	scenario := m.activeScenario
	m.mu.RUnlock()

	if scenario == "redis-oom" && strings.Contains(resourceURI, "redis") {
		return m.failingRedisOOMLogs(resourceURI, limit), nil
	}
	if scenario == "default" && strings.Contains(resourceURI, "payment-service") {
		return m.failingPaymentLogs(resourceURI, limit), nil
	}
	if scenario == "default" && strings.Contains(resourceURI, "batch-ingestor") {
		return m.pendingBatchLogs(resourceURI, limit), nil
	}

	return m.healthyServiceLogs(resourceURI, limit), nil
}

func (m *MockProvider) failingRedisOOMLogs(resourceURI string, limit int) *api.TelemetryData {
	now := time.Now().UTC()
	t := func(offsetSeconds int) string {
		return now.Add(time.Duration(-offsetSeconds) * time.Second).Format("2006-01-02T15:04:05.000Z")
	}
	rawLogs := []api.LogEntry{
		{Timestamp: t(120), Severity: "INFO", Message: "Redis 7.2.4 (00000000/0) 64 bit, port 6379, maxmemory=4096mb (policy: noeviction)", Source: "redis-server"},
		{Timestamp: t(80), Severity: "WARNING", Message: "Memory usage critical: used_memory_rss=4120MB (98.2% of container memory limit)", Source: "redis-server"},
		{Timestamp: t(45), Severity: "ERROR", Message: "OOM command not allowed when used memory > 'maxmemory' (client: cart-service:58214)", Source: "redis-server"},
		{Timestamp: t(20), Severity: "FATAL", Message: "kernel: Out of memory: Killed process 1 (redis-server), total-vm:4194304kB, anon-rss:4190120kB, OOMKilled", Source: "kernel-oom"},
		{Timestamp: t(10), Severity: "ERROR", Message: "Container redis-server terminated with exit code 137 (OOMKilled)", Source: "kubelet"},
		{Timestamp: t(3), Severity: "WARNING", Message: "Back-off restarting failed container redis-server in pod redis-cart-6d9a2_production (restarts=9)", Source: "kubelet"},
	}
	if len(rawLogs) > limit {
		rawLogs = rawLogs[len(rawLogs)-limit:]
	}
	return &api.TelemetryData{
		ResourceURI: resourceURI,
		PodID:       "pod-redis-cart-6d9a2",
		Metrics: map[string]string{
			"status":    "CrashLoopBackOff",
			"restarts":  "9",
			"cpu":       "960m",
			"memory":    "4.0Gi",
			"oom_kills": "9",
			"exit_code": "137",
		},
		Logs: rawLogs,
	}
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

func (m *MockProvider) pendingBatchLogs(resourceURI string, limit int) *api.TelemetryData {
	now := time.Now().UTC()
	t := func(offsetSeconds int) string {
		return now.Add(time.Duration(-offsetSeconds) * time.Second).Format("2006-01-02T15:04:05.000Z")
	}

	rawLogs := []api.LogEntry{
		{
			Timestamp: t(120),
			Severity:  "INFO",
			Message:   "Pod scheduled event received for batch-ingestor-79d5f-x9pl2",
			Source:    "default-scheduler",
		},
		{
			Timestamp: t(100),
			Severity:  "WARNING",
			Message:   "0/6 nodes are available: 3 Insufficient cpu, 3 node(s) had untolerated taint {node.kubernetes.io/unreachable: }",
			Source:    "default-scheduler",
		},
		{
			Timestamp: t(60),
			Severity:  "WARNING",
			Message:   "Cluster autoscaler: pod didn't trigger scale-up (it wouldn't fit if a new node is added)",
			Source:    "cluster-autoscaler",
		},
		{
			Timestamp: t(20),
			Severity:  "INFO",
			Message:   "Cluster autoscaler triggered scale-up for nodepool-compute-highmem (target: +2 nodes, awaiting GCE instance provisioning)",
			Source:    "cluster-autoscaler",
		},
	}

	if len(rawLogs) > limit {
		rawLogs = rawLogs[len(rawLogs)-limit:]
	}

	return &api.TelemetryData{
		ResourceURI: resourceURI,
		PodID:       "pod-batch-ingestor-79d5f",
		Metrics: map[string]string{
			"status":            "Pending",
			"reason":            "InsufficientResources",
			"pending_duration":  "4m32s",
			"cpu_requested":     "4000m",
			"memory_requested":  "8Gi",
			"autoscaler_status": "ScalingUp (+2 nodes)",
		},
		Logs: rawLogs,
	}
}

func (m *MockProvider) healthyServiceLogs(resourceURI string, limit int) *api.TelemetryData {
	now := time.Now().UTC()
	t := func(offsetSeconds int) string {
		return now.Add(time.Duration(-offsetSeconds) * time.Second).Format("2006-01-02T15:04:05.000Z")
	}

	podName := "service"
	parts := strings.Split(resourceURI, "/")
	if len(parts) > 0 && parts[len(parts)-1] != "" {
		podName = parts[len(parts)-1]
	}

	var rawLogs []api.LogEntry
	switch {
	case strings.Contains(podName, "cart"):
		rawLogs = []api.LogEntry{
			{Timestamp: t(120), Severity: "INFO", Message: "cart-service v1.8.2 initialized Redis cluster pool (redis-cart:6379)", Source: "redis.go:44"},
			{Timestamp: t(95), Severity: "INFO", Message: "GET /cart/user-88412 -> 200 OK (items=3, cache_hit=true, latency=2.1ms)", Source: "handler.go:112"},
			{Timestamp: t(70), Severity: "WARNING", Message: "Upstream gRPC call to payment-service:50051 exceeded deadline (timeout=5000ms, retry=1/3)", Source: "checkout_client.go:79"},
			{Timestamp: t(45), Severity: "ERROR", Message: "Failed to pre-authorize cart checkout via payment-service: rpc error: code = Unavailable desc = connection closed", Source: "checkout_client.go:94"},
			{Timestamp: t(25), Severity: "WARNING", Message: "Circuit breaker Half-Open for downstream target payment-service.default.svc.cluster.local", Source: "breaker.go:53"},
			{Timestamp: t(10), Severity: "INFO", Message: "Health probe /healthz -> 200 OK (redis_latency=0.8ms, active_carts=1420)", Source: "health.go:22"},
		}
	case strings.Contains(podName, "checkout"):
		rawLogs = []api.LogEntry{
			{Timestamp: t(110), Severity: "INFO", Message: "checkout-service orchestrator ready on :5050", Source: "main.go:31"},
			{Timestamp: t(80), Severity: "INFO", Message: "Order #ORD-99201: currency conversion USD->EUR completed via currency-service (3.4ms)", Source: "workflow.go:142"},
			{Timestamp: t(50), Severity: "ERROR", Message: "Order #ORD-99204 failed at step ChargeCard: downstream payment-service returned 503 Service Unavailable", Source: "workflow.go:188"},
			{Timestamp: t(30), Severity: "WARNING", Message: "Queuing order #ORD-99204 for asynchronous retry via pubsub-orders-dlq", Source: "retry.go:61"},
			{Timestamp: t(8), Severity: "INFO", Message: "Metrics scrape completed: active_checkouts=18, failed_payments_5m=14", Source: "metrics.go:29"},
		}
	default:
		rawLogs = []api.LogEntry{
			{Timestamp: t(120), Severity: "INFO", Message: fmt.Sprintf("Starting %s server worker pool (threads=8, env=production)", podName), Source: "main.go:28"},
			{Timestamp: t(90), Severity: "INFO", Message: fmt.Sprintf("Service health check OK (200 OK, latency=4ms, target=%s)", podName), Source: "healthz.go:19"},
			{Timestamp: t(65), Severity: "INFO", Message: fmt.Sprintf("Handled 142 HTTP/gRPC requests in last 30s window (p99=12ms, errors=0, service=%s)", podName), Source: "metrics.go:55"},
			{Timestamp: t(40), Severity: "INFO", Message: " Envoy sidecar mTLS certificate rotation check: valid for 21d 14h", Source: "mesh.go:82"},
			{Timestamp: t(15), Severity: "INFO", Message: fmt.Sprintf("Memory GC cycle completed (freed=18MiB, heap_in_use=194MiB, target=%s)", podName), Source: "runtime.go:104"},
		}
	}

	if len(rawLogs) > limit {
		rawLogs = rawLogs[len(rawLogs)-limit:]
	}

	return &api.TelemetryData{
		ResourceURI: resourceURI,
		PodID:       podName,
		Metrics: map[string]string{
			"status":   "Running",
			"restarts": "0",
			"cpu":      "180m",
			"memory":   "312Mi",
			"uptime":   "9d 14h",
			"p99":      "12ms",
		},
		Logs: rawLogs,
	}
}
