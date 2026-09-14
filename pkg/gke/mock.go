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
	"fmt"
	"strings"
	"sync"

	"github.com/go-steer/ephemeris/pkg/api"
)

// MockProvider implements Provider with a deterministic, rich GKE topology
// containing both healthy microservices and an actively failing pod.
type MockProvider struct {
	mu       sync.RWMutex
	topology *api.TopologyData
}

// NewMockProvider creates a new MockProvider populated with microservice topology.
func NewMockProvider() *MockProvider {
	return &MockProvider{
		topology: buildDefaultMockTopology(),
	}
}

// GetTopology returns the full mock GKE cluster hierarchy.
func (m *MockProvider) GetTopology(_ context.Context) (*api.TopologyData, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.topology, nil
}

// GetPodDetails finds a pod by its resource URI (e.g. gke://production/payment-service).
func (m *MockProvider) GetPodDetails(_ context.Context, resourceURI string) (*api.PodNode, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, cluster := range m.topology.Clusters {
		for _, ns := range cluster.Namespaces {
			for _, pod := range ns.Pods {
				podURI := fmt.Sprintf("gke://%s/%s", ns.Name, pod.Name)
				if podURI == resourceURI || pod.ID == resourceURI || strings.HasSuffix(resourceURI, pod.Name) {
					copied := pod
					return &copied, nil
				}
			}
		}
	}
	return nil, fmt.Errorf("pod not found for resource URI: %q", resourceURI)
}

func buildDefaultMockTopology() *api.TopologyData {
	return &api.TopologyData{
		Clusters: []api.ClusterNode{
			{
				Name:      "production-cluster",
				ProjectID: "ephemeris-prod",
				Location:  "us-central1",
				Namespaces: []api.NamespaceNode{
					{
						Name: "production",
						Pods: []api.PodNode{
							{
								ID:          "pod-frontend-6b7d9",
								Name:        "frontend",
								Namespace:   "production",
								Cluster:     "production-cluster",
								Status:      api.StatusRunning,
								Restarts:    0,
								CPUUsage:    "120m",
								MemoryUsage: "256Mi",
								Dependencies: []string{
									"pod-cart-service-5f8c2",
									"pod-catalog-service-7d4a1",
								},
								Labels: map[string]string{"app": "frontend", "tier": "web"},
							},
							{
								ID:           "pod-cart-service-5f8c2",
								Name:         "cart-service",
								Namespace:    "production",
								Cluster:      "production-cluster",
								Status:       api.StatusRunning,
								Restarts:     1,
								CPUUsage:     "80m",
								MemoryUsage:  "180Mi",
								Dependencies: nil,
								Labels:       map[string]string{"app": "cart-service", "tier": "backend"},
							},
							{
								ID:          "pod-checkout-service-9a1b3",
								Name:        "checkout-service",
								Namespace:   "production",
								Cluster:     "production-cluster",
								Status:      api.StatusRunning,
								Restarts:    0,
								CPUUsage:    "190m",
								MemoryUsage: "320Mi",
								Dependencies: []string{
									"pod-payment-service-84f7b6",
								},
								Labels: map[string]string{"app": "checkout-service", "tier": "backend"},
							},
							{
								ID:           "pod-catalog-service-7d4a1",
								Name:         "catalog-service",
								Namespace:    "production",
								Cluster:      "production-cluster",
								Status:       api.StatusRunning,
								Restarts:     0,
								CPUUsage:     "60m",
								MemoryUsage:  "150Mi",
								Dependencies: nil,
								Labels:       map[string]string{"app": "catalog-service", "tier": "backend"},
							},
							{
								ID:           "pod-payment-service-84f7b6",
								Name:         "payment-service",
								Namespace:    "production",
								Cluster:      "production-cluster",
								Status:       api.StatusError,
								Restarts:     14,
								CPUUsage:     "980m",
								MemoryUsage:  "1.8Gi",
								Dependencies: nil,
								Labels:       map[string]string{"app": "payment-service", "tier": "critical-backend"},
							},
						},
					},
					{
						Name: "default",
						Pods: []api.PodNode{
							{
								ID:          "pod-loadgenerator-3c5e8",
								Name:        "loadgenerator",
								Namespace:   "default",
								Cluster:     "production-cluster",
								Status:      api.StatusRunning,
								Restarts:    0,
								CPUUsage:    "210m",
								MemoryUsage: "128Mi",
								Dependencies: []string{
									"pod-frontend-6b7d9",
								},
								Labels: map[string]string{"app": "loadgenerator"},
							},
						},
					},
					{
						Name: "kube-system",
						Pods: []api.PodNode{
							{
								ID:           "pod-coredns-1a2b3",
								Name:         "coredns",
								Namespace:    "kube-system",
								Cluster:      "production-cluster",
								Status:       api.StatusRunning,
								Restarts:     0,
								CPUUsage:     "40m",
								MemoryUsage:  "90Mi",
								Dependencies: nil,
								Labels:       map[string]string{"k8s-app": "kube-dns"},
							},
							{
								ID:           "pod-kube-proxy-4d5e6",
								Name:         "kube-proxy",
								Namespace:    "kube-system",
								Cluster:      "production-cluster",
								Status:       api.StatusRunning,
								Restarts:     0,
								CPUUsage:     "50m",
								MemoryUsage:  "100Mi",
								Dependencies: nil,
								Labels:       map[string]string{"k8s-app": "kube-proxy"},
							},
						},
					},
				},
			},
		},
	}
}
