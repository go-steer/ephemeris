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

func TestMockProvider_GetTopology(t *testing.T) {
	provider := NewMockProvider()
	ctx := context.Background()

	topo, err := provider.GetTopology(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(topo.Clusters) != 1 {
		t.Fatalf("expected 1 cluster, got %d", len(topo.Clusters))
	}

	cluster := topo.Clusters[0]
	if cluster.Name != "production-cluster" {
		t.Errorf("expected production-cluster, got %s", cluster.Name)
	}

	// Verify namespaces
	nsMap := make(map[string]api.NamespaceNode)
	for _, ns := range cluster.Namespaces {
		nsMap[ns.Name] = ns
	}

	if _, ok := nsMap["production"]; !ok {
		t.Errorf("expected namespace 'production'")
	}
	if _, ok := nsMap["kube-system"]; !ok {
		t.Errorf("expected namespace 'kube-system'")
	}

	// Verify payment-service has CrashLoopBackOff
	prodNS := nsMap["production"]
	var paymentPod *api.PodNode
	for _, pod := range prodNS.Pods {
		if pod.Name == "payment-service" {
			paymentPod = &pod
			break
		}
	}

	if paymentPod == nil {
		t.Fatalf("expected to find payment-service pod in production")
	}
	if paymentPod.Status != api.StatusError {
		t.Errorf("expected status %s, got %s", api.StatusError, paymentPod.Status)
	}
	if paymentPod.Restarts < 10 {
		t.Errorf("expected restarts >= 10, got %d", paymentPod.Restarts)
	}
}

func TestMockProvider_GetPodDetails(t *testing.T) {
	provider := NewMockProvider()
	ctx := context.Background()

	// Lookup by URI
	pod, err := provider.GetPodDetails(ctx, "gke://production/payment-service")
	if err != nil {
		t.Fatalf("failed to find pod by URI: %v", err)
	}
	if pod.Name != "payment-service" {
		t.Errorf("expected payment-service, got %s", pod.Name)
	}

	// Lookup by ID
	podByID, err := provider.GetPodDetails(ctx, "pod-payment-service-84f7b6")
	if err != nil {
		t.Fatalf("failed to find pod by ID: %v", err)
	}
	if podByID.ID != "pod-payment-service-84f7b6" {
		t.Errorf("expected pod-payment-service-84f7b6, got %s", podByID.ID)
	}

	// Lookup non-existent
	_, err = provider.GetPodDetails(ctx, "gke://production/non-existent")
	if err == nil {
		t.Errorf("expected error for non-existent pod, got nil")
	}
}
