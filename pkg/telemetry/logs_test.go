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
	"testing"
)

func TestMockProvider_PaymentCrashLogs(t *testing.T) {
	provider := NewMockProvider()
	ctx := context.Background()

	data, err := provider.QueryLogs(ctx, "gke://production/payment-service", 50)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if data.Metrics["status"] != "CrashLoopBackOff" {
		t.Errorf("expected CrashLoopBackOff, got %s", data.Metrics["status"])
	}

	hasFatal := false
	for _, entry := range data.Logs {
		if entry.Severity == "FATAL" {
			hasFatal = true
			break
		}
	}

	if !hasFatal {
		t.Errorf("expected payment logs to contain FATAL entries")
	}
}

func TestMockProvider_HealthyLogs(t *testing.T) {
	provider := NewMockProvider()
	ctx := context.Background()

	data, err := provider.QueryLogs(ctx, "gke://production/frontend", 50)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if data.Metrics["status"] != "Running" {
		t.Errorf("expected Running, got %s", data.Metrics["status"])
	}

	for _, entry := range data.Logs {
		if entry.Severity == "FATAL" {
			t.Errorf("did not expect FATAL in healthy logs: %s", entry.Message)
		}
	}
}
