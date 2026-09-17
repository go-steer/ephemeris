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

package orchestrator

import (
	"context"
	"strings"
	"testing"

	"github.com/go-steer/ephemeris/pkg/api"
	"github.com/go-steer/ephemeris/pkg/mcp"
)

func TestMastHarness_RunLookoutSpecialist(t *testing.T) {
	harness := NewMastHarness(mcp.NewLookoutClient(nil))
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
								Restarts:    9,
								CPUUsage:    "960m",
								MemoryUsage: "4.0Gi",
							},
						},
					},
				},
			},
		},
	}

	var statusUpdates []string
	findings, envelope := harness.RunLookoutSpecialist(context.Background(), LLMIntentResult{
		Archetype: ArchetypeIssuesFleetMatrix,
	}, topo, nil, func(s string) {
		statusUpdates = append(statusUpdates, s)
	})

	if len(findings) != 1 {
		t.Fatalf("expected 1 finding, got %d", len(findings))
	}
	if !strings.Contains(envelope, "scanned=1 findings=1") {
		t.Errorf("expected scanned=1 findings=1 envelope, got %s", envelope)
	}
	if len(statusUpdates) < 2 {
		t.Errorf("expected status updates from mast specialist, got %d", len(statusUpdates))
	}

	harness.RecordIntentStep(LLMIntentResult{Archetype: ArchetypeIssuesFleetMatrix}, 12)
	harness.RecordCompilerStep(ArchetypeIssuesFleetMatrix, 2048, 4)

	transcript := harness.Transcript()
	if len(transcript) != 3 {
		t.Fatalf("expected 3 transcript entries, got %d", len(transcript))
	}
}
