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

package mcp

import (
	"context"
	"strings"
	"testing"

	"github.com/go-steer/ephemeris/pkg/api"
)

func TestSanitizeFinding(t *testing.T) {
	raw := "Connection failed with password=mysecretpass and token=abc123xyz"
	clean := SanitizeFinding(raw)
	if strings.Contains(clean, "mysecretpass") || strings.Contains(clean, "abc123xyz") {
		t.Fatalf("expected secrets to be redacted, got: %s", clean)
	}
	if !strings.Contains(clean, "password=[REDACTED]") {
		t.Fatalf("expected password=[REDACTED], got: %s", clean)
	}
}

func TestLookoutClient_RunLookoutCheck(t *testing.T) {
	client := NewLookoutClient(nil)
	topo := &api.TopologyData{
		ScenarioID: "redis-oom",
		Clusters: []api.ClusterNode{
			{
				Name: "production-us-central1",
				Namespaces: []api.NamespaceNode{
					{
						Name: "production",
						Pods: []api.PodNode{
							{
								ID:          "pod-redis-cart-6d9a2",
								Name:        "redis-cart",
								Namespace:   "production",
								Status:      api.StatusError,
								Restarts:    5,
								CPUUsage:    "950m",
								MemoryUsage: "4.0Gi",
							},
							{
								ID:          "pod-cart-service-5f8c2",
								Name:        "cart-service",
								Namespace:   "production",
								Status:      api.StatusError,
								Restarts:    3,
								CPUUsage:    "210m",
								MemoryUsage: "290Mi",
							},
						},
					},
				},
			},
		},
	}

	findings, envelope, err := client.RunLookoutCheck(context.Background(), "lookout_triage", topo, nil, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(findings) != 2 {
		t.Fatalf("expected 2 findings, got %d", len(findings))
	}
	if findings[0].Kind != "oom_killed" {
		t.Errorf("expected first finding kind=oom_killed, got %s", findings[0].Kind)
	}
	if !strings.HasPrefix(findings[0].Fingerprint, "lk8s-") {
		t.Errorf("expected fingerprint prefix lk8s-, got %s", findings[0].Fingerprint)
	}
	if !strings.Contains(envelope, "scanned=2 findings=2") {
		t.Errorf("expected envelope scanned=2 findings=2, got %s", envelope)
	}

	// Verify read-only guardrail blocks non-whitelisted tools
	_, _, err = client.RunLookoutCheck(context.Background(), "delete_pod", topo, nil, "")
	if err == nil {
		t.Fatalf("expected guardrail error for delete_pod")
	}
}
