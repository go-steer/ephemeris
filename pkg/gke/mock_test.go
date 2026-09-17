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

package gke

import (
	"context"
	"testing"

	"github.com/go-steer/ephemeris/pkg/api"
)

func TestMockProvider_ApplyScaleTest(t *testing.T) {
	ctx := context.Background()
	m := NewMockProvider()

	// 1. Default standard topology has ReplicaSet and DaemonSet hierarchy links
	topo, err := m.GetTopology(ctx)
	if err != nil {
		t.Fatalf("GetTopology failed: %v", err)
	}
	foundReplicaSet := false
	foundDaemonSet := false
	for _, cl := range topo.Clusters {
		for _, ns := range cl.Namespaces {
			for _, r := range ns.Resources {
				if r.Kind == "ReplicaSet" && r.OwnerKind == "Deployment" {
					foundReplicaSet = true
				}
				if r.Kind == "DaemonSet" {
					foundDaemonSet = true
				}
			}
		}
	}
	if !foundReplicaSet {
		t.Errorf("expected default topology to contain ReplicaSet with OwnerKind=Deployment")
	}
	if !foundDaemonSet {
		t.Errorf("expected default topology to contain DaemonSet")
	}

	// 2. Large scale stress test (12 clusters, 600+ objects)
	largeTopo, err := m.ApplyScaleTest(ctx, api.ScaleTestConfig{Preset: "large"})
	if err != nil {
		t.Fatalf("ApplyScaleTest(large) failed: %v", err)
	}
	if len(largeTopo.Clusters) != 12 {
		t.Errorf("expected 12 clusters in large scale test, got %d", len(largeTopo.Clusters))
	}

	totalObjects := 0
	for _, cl := range largeTopo.Clusters {
		for _, ns := range cl.Namespaces {
			totalObjects += len(ns.Pods) + len(ns.Resources)
		}
	}
	if totalObjects < 600 {
		t.Errorf("expected at least 600 objects in large scale test, got %d", totalObjects)
	}

	// 3. Reset back to standard
	resetTopo, err := m.ApplyScaleTest(ctx, api.ScaleTestConfig{Preset: "standard"})
	if err != nil {
		t.Fatalf("ApplyScaleTest(standard) failed: %v", err)
	}
	if len(resetTopo.Clusters) != 3 {
		t.Errorf("expected 3 clusters after standard reset, got %d", len(resetTopo.Clusters))
	}
}
