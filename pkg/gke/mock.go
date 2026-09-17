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

// RemediatePod transitions a failing or pending workload to Running and resets its error counters.
func (m *MockProvider) RemediatePod(_ context.Context, podIDOrName string, _ string) (*api.PodNode, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	target := strings.ToLower(strings.TrimSpace(podIDOrName))
	var remediated *api.PodNode

	for cIdx := range m.topology.Clusters {
		for nIdx := range m.topology.Clusters[cIdx].Namespaces {
			for pIdx := range m.topology.Clusters[cIdx].Namespaces[nIdx].Pods {
				pod := &m.topology.Clusters[cIdx].Namespaces[nIdx].Pods[pIdx]
				if strings.ToLower(pod.ID) == target || strings.ToLower(pod.Name) == target || strings.Contains(strings.ToLower(pod.ID), target) || strings.Contains(target, strings.ToLower(pod.Name)) {
					pod.Status = api.StatusRunning
					pod.Restarts = 0
					pod.CPUUsage = "140m"
					pod.MemoryUsage = "240Mi"
					copied := *pod
					remediated = &copied
				}
			}
			for rIdx := range m.topology.Clusters[cIdx].Namespaces[nIdx].Resources {
				res := &m.topology.Clusters[cIdx].Namespaces[nIdx].Resources[rIdx]
				if strings.Contains(strings.ToLower(res.Name), target) || strings.Contains(target, strings.ToLower(res.Name)) || (strings.Contains(target, "payment") && res.Name == "checkout-route") {
					res.Status = "Healthy"
					if res.Replicas == "0/1" {
						res.Replicas = "1/1"
					}
				}
			}
		}
	}

	// If remediating redis-cart during redis-oom cascade, also recover downstream cart-service and checkout-service
	if remediated != nil && strings.Contains(remediated.Name, "redis") && m.topology.ScenarioID == "redis-oom" {
		for cIdx := range m.topology.Clusters {
			for nIdx := range m.topology.Clusters[cIdx].Namespaces {
				for pIdx := range m.topology.Clusters[cIdx].Namespaces[nIdx].Pods {
					pod := &m.topology.Clusters[cIdx].Namespaces[nIdx].Pods[pIdx]
					if pod.Name == "cart-service" || pod.Name == "checkout-service" {
						pod.Status = api.StatusRunning
						pod.Restarts = 0
						pod.CPUUsage = "160m"
						pod.MemoryUsage = "280Mi"
					}
				}
			}
		}
	}

	if remediated == nil {
		return nil, fmt.Errorf("workload %q not found for remediation", podIDOrName)
	}
	return remediated, nil
}

// ApplyScenario mutates the cluster topology to simulate multi-pod cloud incident scenarios.
func (m *MockProvider) ApplyScenario(_ context.Context, scenarioID string) (*api.TopologyData, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if scenarioID == "" {
		scenarioID = "default"
	}
	topo := buildDefaultMockTopology()
	topo.ScenarioID = scenarioID

	switch scenarioID {
	case "redis-oom":
		for cIdx := range topo.Clusters {
			for nIdx := range topo.Clusters[cIdx].Namespaces {
				for pIdx := range topo.Clusters[cIdx].Namespaces[nIdx].Pods {
					pod := &topo.Clusters[cIdx].Namespaces[nIdx].Pods[pIdx]
					switch pod.Name {
					case "redis-cart":
						pod.Status = api.StatusError
						pod.Restarts = 9
						pod.CPUUsage = "960m"
						pod.MemoryUsage = "4.0Gi"
					case "cart-service":
						pod.Status = api.StatusError
						pod.Restarts = 4
						pod.CPUUsage = "340m"
						pod.MemoryUsage = "420Mi"
					case "checkout-service":
						pod.Status = api.StatusPending
						pod.Restarts = 2
						pod.CPUUsage = "520m"
						pod.MemoryUsage = "680Mi"
					case "payment-service", "batch-ingestor":
						pod.Status = api.StatusRunning
						pod.Restarts = 0
						pod.CPUUsage = "150m"
						pod.MemoryUsage = "260Mi"
					}
				}
			}
		}
	case "traffic-spike":
		for cIdx := range topo.Clusters {
			for nIdx := range topo.Clusters[cIdx].Namespaces {
				ns := &topo.Clusters[cIdx].Namespaces[nIdx]
				for pIdx := range ns.Pods {
					pod := &ns.Pods[pIdx]
					switch pod.Name {
					case "frontend":
						pod.Status = api.StatusRunning
						pod.CPUUsage = "980m"
						pod.MemoryUsage = "1.4Gi"
					case "checkout-service":
						pod.Status = api.StatusRunning
						pod.CPUUsage = "940m"
						pod.MemoryUsage = "1.6Gi"
					case "payment-service", "batch-ingestor":
						pod.Status = api.StatusRunning
						pod.Restarts = 0
						pod.CPUUsage = "180m"
						pod.MemoryUsage = "310Mi"
					}
				}
				if ns.Name == "production" {
					ns.Pods = append(ns.Pods, api.PodNode{
						ID:           "pod-checkout-scale-2",
						Name:         "checkout-service-scale-2",
						Namespace:    "production",
						Cluster:      "production-us-central1",
						Status:       api.StatusPending,
						Restarts:     0,
						CPUUsage:     "0m",
						MemoryUsage:  "0Mi",
						Dependencies: []string{"pod-payment-service-84f7b6"},
						Labels:       map[string]string{"app": "checkout-service", "tier": "backend", "autoscaled": "true"},
					})
				}
			}
		}
	case "healthy":
		for cIdx := range topo.Clusters {
			for nIdx := range topo.Clusters[cIdx].Namespaces {
				for pIdx := range topo.Clusters[cIdx].Namespaces[nIdx].Pods {
					pod := &topo.Clusters[cIdx].Namespaces[nIdx].Pods[pIdx]
					pod.Status = api.StatusRunning
					pod.Restarts = 0
					if pod.CPUUsage == "0m" || pod.CPUUsage == "980m" {
						pod.CPUUsage = "145m"
						pod.MemoryUsage = "250Mi"
					}
				}
				for rIdx := range topo.Clusters[cIdx].Namespaces[nIdx].Resources {
					res := &topo.Clusters[cIdx].Namespaces[nIdx].Resources[rIdx]
					res.Status = "Healthy"
					if res.Replicas == "0/1" {
						res.Replicas = "1/1"
					}
				}
			}
		}
	}

	m.topology = topo
	return m.topology, nil
}

func buildDefaultMockTopology() *api.TopologyData {
	return &api.TopologyData{
		ScenarioID: "default",
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
								ID:          "pod-cart-service-5f8c2",
								Name:        "cart-service",
								Namespace:   "production",
								Cluster:     "production-us-central1",
								Status:      api.StatusRunning,
								Restarts:    1,
								CPUUsage:    "80m",
								MemoryUsage: "180Mi",
								Dependencies: []string{
									"pod-redis-cart-6d9a2",
								},
								Labels: map[string]string{"app": "cart-service", "tier": "backend"},
							},
							{
								ID:           "pod-redis-cart-6d9a2",
								Name:         "redis-cart",
								Namespace:    "production",
								Cluster:      "production-us-central1",
								Status:       api.StatusRunning,
								Restarts:     0,
								CPUUsage:     "95m",
								MemoryUsage:  "512Mi",
								Dependencies: nil,
								Labels:       map[string]string{"app": "redis-cart", "tier": "cache"},
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
						Resources: []api.K8sResource{
							{
								ID:          "gw-boutique-gateway",
								Kind:        "Gateway",
								APIVersion:  "gateway.networking.k8s.io/v1",
								Name:        "boutique-gateway",
								Namespace:   "production",
								Cluster:     "production-us-central1",
								Status:      "Healthy",
								Summary:     "External HTTPS Ingress Gateway (gke-l7-global-external-managed, 34.120.55.10)",
								ConnectedTo: []string{"httproute-checkout"},
							},
							{
								ID:          "httproute-checkout",
								Kind:        "HTTPRoute",
								APIVersion:  "gateway.networking.k8s.io/v1",
								Name:        "checkout-route",
								Namespace:   "production",
								Cluster:     "production-us-central1",
								Status:      "Degraded",
								Summary:     "Routes /api/v1/checkout -> checkout-service:8080, /api/v1/pay -> payment-service:8080 (502 Bad Gateway)",
								ConnectedTo: []string{"svc-checkout-service", "svc-payment-service"},
							},
							{
								ID:          "svc-payment-service",
								Kind:        "Service",
								APIVersion:  "v1",
								Name:        "payment-service",
								Namespace:   "production",
								Cluster:     "production-us-central1",
								Status:      "Degraded",
								Summary:     "ClusterIP 10.96.42.18:8080 -> selector app=payment-service (0/1 ready endpoints)",
								ConnectedTo: []string{"deploy-payment-service"},
							},
							{
								ID:          "deploy-payment-service",
								Kind:        "Deployment",
								APIVersion:  "apps/v1",
								Name:        "payment-service",
								Namespace:   "production",
								Cluster:     "production-us-central1",
								Status:      "CrashLoopBackOff",
								Replicas:    "0/1",
								Summary:     "RollingUpdate (image: gcr.io/boutique/payment:v2.1.4) — replica crashing on SIGSEGV at server.go:142",
								ConnectedTo: []string{"pod-payment-service-84f7b6"},
							},
							{
								ID:          "sts-redis-cart",
								Kind:        "StatefulSet",
								APIVersion:  "apps/v1",
								Name:        "redis-cart",
								Namespace:   "production",
								Cluster:     "production-us-central1",
								Status:      "Healthy",
								Replicas:    "1/1",
								Summary:     "Persistent Redis cache (volumeClaimTemplates: redis-data-pvc 10Gi ssd-pd)",
								ConnectedTo: []string{"pod-redis-cart-6d9a2"},
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
						Resources: []api.K8sResource{
							{
								ID:          "crd-spark-pi",
								Kind:        "SparkApplication",
								APIVersion:  "sparkoperator.k8s.io/v1beta2",
								Name:        "spark-pi-analytics",
								Namespace:   "spark-jobs",
								Cluster:     "analytics-europe-west1",
								Status:      "Healthy",
								Replicas:    "3/3",
								IsCRD:       true,
								Summary:     "Distributed Spark SQL ETL job (driver: spark-master, executors: 2x spark-worker)",
								ConnectedTo: []string{"pod-spark-master-01", "pod-spark-worker-01", "pod-spark-worker-02"},
							},
							{
								ID:         "crd-ray-llm",
								Kind:       "RayCluster",
								APIVersion: "ray.io/v1",
								Name:       "ray-llm-inference",
								Namespace:  "spark-jobs",
								Cluster:    "analytics-europe-west1",
								Status:     "Healthy",
								Replicas:   "4/4",
								IsCRD:      true,
								Summary:    "KubeRay GPU inference cluster (head + 3x L4 worker group)",
							},
							{
								ID:          "deploy-batch-ingestor",
								Kind:        "Deployment",
								APIVersion:  "apps/v1",
								Name:        "batch-ingestor",
								Namespace:   "spark-jobs",
								Cluster:     "analytics-europe-west1",
								Status:      "Pending",
								Replicas:    "0/1",
								Summary:     "Pending CPU quota allocation on europe-west1 node pool (requested: 4000m)",
								ConnectedTo: []string{"pod-batch-ingestor-03"},
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
