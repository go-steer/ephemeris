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
				Name:      "production-us-central1",
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
								Cluster:     "production-us-central1",
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
								Cluster:      "production-us-central1",
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
								Cluster:     "production-us-central1",
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
								Cluster:      "production-us-central1",
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
								Cluster:      "production-us-central1",
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
								Cluster:     "production-us-central1",
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
								Cluster:      "production-us-central1",
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
								Cluster:      "production-us-central1",
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
			{
				Name:      "staging-us-east4",
				ProjectID: "ephemeris-staging",
				Location:  "us-east4",
				Namespaces: []api.NamespaceNode{
					{
						Name: "staging",
						Pods: []api.PodNode{
							{
								ID:          "pod-stage-frontend-8e2a1",
								Name:        "stage-frontend",
								Namespace:   "staging",
								Cluster:     "staging-us-east4",
								Status:      api.StatusRunning,
								Restarts:    0,
								CPUUsage:    "45m",
								MemoryUsage: "110Mi",
								Dependencies: []string{
									"pod-stage-auth-3c9f4",
								},
								Labels: map[string]string{"app": "frontend", "env": "stage"},
							},
							{
								ID:           "pod-stage-auth-3c9f4",
								Name:         "stage-auth",
								Namespace:    "staging",
								Cluster:      "staging-us-east4",
								Status:       api.StatusRunning,
								Restarts:     0,
								CPUUsage:     "35m",
								MemoryUsage:  "95Mi",
								Dependencies: nil,
								Labels:       map[string]string{"app": "auth", "env": "stage"},
							},
							{
								ID:           "pod-stage-payment-7b1d2",
								Name:         "stage-payment",
								Namespace:    "staging",
								Cluster:      "staging-us-east4",
								Status:       api.StatusRunning,
								Restarts:     0,
								CPUUsage:     "50m",
								MemoryUsage:  "120Mi",
								Dependencies: nil,
								Labels:       map[string]string{"app": "payment", "env": "stage"},
							},
						},
					},
					{
						Name: "kube-system",
						Pods: []api.PodNode{
							{
								ID:           "pod-stage-coredns-99aa1",
								Name:         "coredns",
								Namespace:    "kube-system",
								Cluster:      "staging-us-east4",
								Status:       api.StatusRunning,
								Restarts:     0,
								CPUUsage:     "30m",
								MemoryUsage:  "80Mi",
								Dependencies: nil,
								Labels:       map[string]string{"k8s-app": "kube-dns"},
							},
						},
					},
				},
			},
			{
				Name:      "analytics-europe-west1",
				ProjectID: "ephemeris-analytics",
				Location:  "europe-west1",
				Namespaces: []api.NamespaceNode{
					{
						Name: "spark-jobs",
						Pods: []api.PodNode{
							{
								ID:          "pod-spark-master-01",
								Name:        "spark-master",
								Namespace:   "spark-jobs",
								Cluster:     "analytics-europe-west1",
								Status:      api.StatusRunning,
								Restarts:    0,
								CPUUsage:    "620m",
								MemoryUsage: "1.2Gi",
								Dependencies: []string{
									"pod-spark-worker-01",
									"pod-spark-worker-02",
								},
								Labels: map[string]string{"app": "spark-master", "role": "coordinator"},
							},
							{
								ID:           "pod-spark-worker-01",
								Name:         "spark-worker-01",
								Namespace:    "spark-jobs",
								Cluster:      "analytics-europe-west1",
								Status:       api.StatusRunning,
								Restarts:     0,
								CPUUsage:     "1850m",
								MemoryUsage:  "3.8Gi",
								Dependencies: nil,
								Labels:       map[string]string{"app": "spark-worker", "role": "worker"},
							},
							{
								ID:           "pod-spark-worker-02",
								Name:         "spark-worker-02",
								Namespace:    "spark-jobs",
								Cluster:      "analytics-europe-west1",
								Status:       api.StatusRunning,
								Restarts:     0,
								CPUUsage:     "1720m",
								MemoryUsage:  "3.6Gi",
								Dependencies: nil,
								Labels:       map[string]string{"app": "spark-worker", "role": "worker"},
							},
							{
								ID:           "pod-batch-ingestor-03",
								Name:         "batch-ingestor",
								Namespace:    "spark-jobs",
								Cluster:      "analytics-europe-west1",
								Status:       api.StatusPending,
								Restarts:     0,
								CPUUsage:     "0m",
								MemoryUsage:  "0Mi",
								Dependencies: nil,
								Labels:       map[string]string{"app": "batch-ingestor", "role": "pipeline"},
							},
						},
					},
					{
						Name: "kube-system",
						Pods: []api.PodNode{
							{
								ID:           "pod-analytics-fluentbit-01",
								Name:         "fluentbit",
								Namespace:    "kube-system",
								Cluster:      "analytics-europe-west1",
								Status:       api.StatusRunning,
								Restarts:     0,
								CPUUsage:     "55m",
								MemoryUsage:  "110Mi",
								Dependencies: nil,
								Labels:       map[string]string{"k8s-app": "fluentbit-logging"},
							},
						},
					},
				},
			},
		},
	}
}
