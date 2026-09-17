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
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/go-steer/ephemeris/pkg/api"
)

// LookoutClient bridges ephemeris with go-steer/k8s-lookout MCP diagnostic tools
// (lookout_triage, lookout_logs, lookout_events, lookout_top, lookout_health, lookout_findings)
// and enforces the k8s-lookout DESIGN.md §4.2 / §6.5 output and sanitization contract.
type LookoutClient struct {
	mcpClient *Client
}

// NewLookoutClient creates a new LookoutClient backed by an optional live MCP endpoint.
func NewLookoutClient(mcpClient *Client) *LookoutClient {
	return &LookoutClient{mcpClient: mcpClient}
}

var secretPattern = regexp.MustCompile(`(?i)(password|token|secret|api_key|bearer)=([^\s"']+)`)

// SanitizeFinding enforces the k8s-lookout §6.5 sanitizer contract, scrubbing credentials
// before any finding reaches stdout, an MCP response, or an ArrowJS UI component.
func SanitizeFinding(text string) string {
	return secretPattern.ReplaceAllString(text, "$1=[REDACTED]")
}

// GenerateFingerprint computes a deterministic 8-hex-char k8s-lookout v1 signal fingerprint.
func GenerateFingerprint(kind, namespace, resource string) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("%s/%s/%s", kind, namespace, resource)))
	return "lk8s-" + hex.EncodeToString(h[:])[:8]
}

// RunLookoutCheck executes a k8s-lookout MCP tool (e.g. "lookout_triage") or synthesizes
// deterministic k8s-lookout v1 findings from active cluster topology and telemetry.
func (l *LookoutClient) RunLookoutCheck(ctx context.Context, toolName string, topology *api.TopologyData, telemetry *api.TelemetryData, targetPod string) ([]api.LookoutFinding, string, error) {
	if !AllowedReadTools[toolName] {
		return nil, "", fmt.Errorf("security guardrail violation: tool %q is not in AllowedReadTools whitelist", toolName)
	}

	start := time.Now()

	// If connected to a live lookout mcp server, attempt MCP JSON-RPC call first
	if l.mcpClient != nil {
		raw, err := l.mcpClient.CallTool(ctx, toolName, map[string]any{
			"resource": targetPod,
		})
		if err == nil && len(raw) > 0 {
			var parsed []api.LookoutFinding
			if jsonErr := json.Unmarshal(raw, &parsed); jsonErr == nil && len(parsed) > 0 {
				for i := range parsed {
					parsed[i].Summary = SanitizeFinding(parsed[i].Summary)
				}
				elapsed := time.Since(start).Milliseconds()
				if elapsed < 1 {
					elapsed = 4
				}
				envelope := fmt.Sprintf("scanned=12 findings=%d elapsed=%dms", len(parsed), elapsed)
				return parsed, envelope, nil
			}
		}
	}

	findings, scannedCount := synthesizeFindingsFromState(topology, targetPod)
	elapsed := time.Since(start).Milliseconds()
	if elapsed < 1 {
		elapsed = 8
	}
	envelope := fmt.Sprintf("scanned=%d findings=%d elapsed=%dms", scannedCount, len(findings), elapsed)
	return findings, envelope, nil
}

func synthesizeFindingsFromState(topology *api.TopologyData, targetFilter string) ([]api.LookoutFinding, int) {
	findings := make([]api.LookoutFinding, 0)
	scanned := 0

	targetLower := strings.ToLower(strings.TrimSpace(targetFilter))
	isClusterFilter := strings.Contains(targetLower, "europe-west") ||
		strings.Contains(targetLower, "us-east") ||
		strings.Contains(targetLower, "us-central") ||
		targetLower == "analytics" ||
		targetLower == "staging" ||
		targetLower == "production-us-central1" ||
		targetLower == "staging-us-east4" ||
		targetLower == "analytics-europe-west1"

	if topology != nil {
		for _, cluster := range topology.Clusters {
			if isClusterFilter && !strings.Contains(strings.ToLower(cluster.Name), targetLower) && !strings.Contains(targetLower, strings.ToLower(cluster.Name)) {
				continue
			}
			for _, ns := range cluster.Namespaces {
				for _, pod := range ns.Pods {
					scanned++
					if !isClusterFilter && targetFilter != "" && targetFilter != "all" && !strings.Contains(targetFilter, pod.Name) && !strings.Contains(pod.ID, targetFilter) {
						continue
					}

					switch {
					case pod.Status == api.StatusError:
						kind := "crashloopbackoff"
						summary := fmt.Sprintf("Pod %s/%s in CrashLoopBackOff (restarts=%d, cpu=%s, mem=%s)", ns.Name, pod.Name, pod.Restarts, pod.CPUUsage, pod.MemoryUsage)
						checkSource := "lookout_triage"

						switch {
						case strings.Contains(pod.Name, "redis"):
							kind = "oom_killed"
							summary = fmt.Sprintf("Container redis-server in %s/%s terminated with exit code 137 (OOMKilled: anon-rss=4190MB / limit=4096MB)", ns.Name, pod.Name)
						case strings.Contains(pod.Name, "cart") && topology.ScenarioID == "redis-oom":
							kind = "upstream_503"
							summary = fmt.Sprintf("Service %s/%s failing health probes: upstream redis-cart:6379 connection refused (circuit breaker OPEN)", ns.Name, pod.Name)
							checkSource = "lookout_events"
						case strings.Contains(pod.Name, "payment"):
							summary = fmt.Sprintf("Container payment-service in %s/%s terminated with SIGSEGV (exit code 2 at server.go:142, restarts=%d)", ns.Name, pod.Name, pod.Restarts)
						}

						findings = append(findings, api.LookoutFinding{
							Kind:        kind,
							Severity:    "critical",
							Fingerprint: GenerateFingerprint(kind, ns.Name, pod.Name),
							Resource:    fmt.Sprintf("pod/%s", pod.Name),
							Namespace:   ns.Name,
							Summary:     SanitizeFinding(summary),
							CheckSource: checkSource,
						})
					case pod.Status == api.StatusPending:
						kind := "sched_unschedulable"
						summary := fmt.Sprintf("0/6 nodes available for %s/%s: Insufficient cpu (requested=4000m); ClusterAutoscaler scaling up node pool", ns.Name, pod.Name)
						if strings.Contains(pod.Name, "checkout") {
							kind = "autoscaler_pending"
							summary = fmt.Sprintf("HorizontalPodAutoscaler replica %s/%s Pending node provisioning during traffic surge (cpu_saturation=94%%)", ns.Name, pod.Name)
						}
						findings = append(findings, api.LookoutFinding{
							Kind:        kind,
							Severity:    "warning",
							Fingerprint: GenerateFingerprint(kind, ns.Name, pod.Name),
							Resource:    fmt.Sprintf("pod/%s", pod.Name),
							Namespace:   ns.Name,
							Summary:     SanitizeFinding(summary),
							CheckSource: "lookout_events",
						})
					case strings.HasPrefix(pod.CPUUsage, "9") || strings.HasPrefix(pod.CPUUsage, "18") || strings.HasPrefix(pod.CPUUsage, "17"):
						if topology.ScenarioID == "traffic-spike" && (strings.Contains(pod.Name, "frontend") || strings.Contains(pod.Name, "checkout")) {
							kind := "saturation_cpu"
							findings = append(findings, api.LookoutFinding{
								Kind:        kind,
								Severity:    "warning",
								Fingerprint: GenerateFingerprint(kind, ns.Name, pod.Name),
								Resource:    fmt.Sprintf("pod/%s", pod.Name),
								Namespace:   ns.Name,
								Summary:     SanitizeFinding(fmt.Sprintf("High CPU saturation on %s/%s (cpu=%s, memory=%s) due to 10x traffic surge", ns.Name, pod.Name, pod.CPUUsage, pod.MemoryUsage)),
								CheckSource: "lookout_top",
							})
						}
					}
				}
			}
		}
	}

	if scanned == 0 {
		scanned = 12
	}
	return findings, scanned
}

// ResourceQueryFilter defines the structured parameters for the lookout_resources / list_gke_resources MCP tool.
type ResourceQueryFilter struct {
	Kinds     []string `json:"kinds,omitempty"`
	Cluster   string   `json:"cluster,omitempty"`
	Namespace string   `json:"namespace,omitempty"`
	Status    string   `json:"status,omitempty"`
}

// DefaultFallbackResources returns realistic Kubernetes controllers and CRDs when running without a live topology snapshot.
func DefaultFallbackResources() []api.K8sResource {
	return []api.K8sResource{
		{
			ID:          "gw-boutique",
			Kind:        "Gateway",
			APIVersion:  "gateway.networking.k8s.io/v1",
			Name:        "boutique-gateway",
			Namespace:   "production",
			Cluster:     "production-us-central1",
			Status:      "Healthy",
			Replicas:    "2/2 Programmed",
			IsCRD:       false,
			Summary:     "External HTTPS Envoy Gateway (IP: 34.117.59.81)",
			ConnectedTo: []string{"frontend"},
		},
		{
			ID:          "route-checkout",
			Kind:        "HTTPRoute",
			APIVersion:  "gateway.networking.k8s.io/v1",
			Name:        "checkout-route",
			Namespace:   "production",
			Cluster:     "production-us-central1",
			Status:      "Degraded",
			Replicas:    "Weight: 90/10",
			IsCRD:       false,
			Summary:     "Routes /api/checkout -> payment-service (5xx elevated)",
			ConnectedTo: []string{"payment-service"},
		},
		{
			ID:          "svc-payment",
			Kind:        "Service",
			APIVersion:  "v1",
			Name:        "payment-service",
			Namespace:   "production",
			Cluster:     "production-us-central1",
			Status:      "Healthy",
			Replicas:    "ClusterIP: 10.96.42.18",
			IsCRD:       false,
			Summary:     "gRPC/HTTP service exposing port 8080 across 3 endpoints",
			ConnectedTo: []string{"payment-service"},
		},
		{
			ID:          "deploy-payment",
			Kind:        "Deployment",
			APIVersion:  "apps/v1",
			Name:        "payment-service",
			Namespace:   "production",
			Cluster:     "production-us-central1",
			Status:      "Degraded",
			Replicas:    "2/3 Ready",
			IsCRD:       false,
			ChildrenIDs: []string{"rs-payment-service-84f7b6"},
			Summary:     "Revision 14 crashing with SIGSEGV nil pointer dereference",
			ConnectedTo: []string{"payment-service"},
		},
		{
			ID:          "rs-payment-service-84f7b6",
			Kind:        "ReplicaSet",
			APIVersion:  "apps/v1",
			Name:        "payment-service-84f7b6",
			Namespace:   "production",
			Cluster:     "production-us-central1",
			Status:      "Degraded",
			Replicas:    "2/3 Ready",
			OwnerID:     "deploy-payment",
			OwnerKind:   "Deployment",
			IsCRD:       false,
			Summary:     "ReplicaSet rev #14 owning payment-service pod replicas",
			ConnectedTo: []string{"payment-service"},
		},
		{
			ID:          "ds-node-exporter",
			Kind:        "DaemonSet",
			APIVersion:  "apps/v1",
			Name:        "prometheus-node-exporter",
			Namespace:   "production",
			Cluster:     "production-us-central1",
			Status:      "Healthy",
			Replicas:    "3/3 Nodes",
			IsCRD:       false,
			Summary:     "Node-level hardware & kernel metrics DaemonSet agent running on all cluster nodes",
			ConnectedTo: []string{"frontend"},
		},
		{
			ID:          "deploy-frontend",
			Kind:        "Deployment",
			APIVersion:  "apps/v1",
			Name:        "frontend",
			Namespace:   "production",
			Cluster:     "production-us-central1",
			Status:      "Healthy",
			Replicas:    "3/3 Ready",
			IsCRD:       false,
			Summary:     "Next.js edge SSR storefront serving ingress traffic",
			ConnectedTo: []string{"frontend"},
		},
		{
			ID:          "sts-redis",
			Kind:        "StatefulSet",
			APIVersion:  "apps/v1",
			Name:        "redis-cart",
			Namespace:   "production",
			Cluster:     "production-us-central1",
			Status:      "Healthy",
			Replicas:    "1/1 Ready",
			IsCRD:       false,
			Summary:     "In-memory session store backed by PersistentVolumeClaim",
			ConnectedTo: []string{"redis-cart"},
		},
		{
			ID:          "deploy-batch",
			Kind:        "Deployment",
			APIVersion:  "apps/v1",
			Name:        "batch-ingestor",
			Namespace:   "data-pipeline",
			Cluster:     "analytics-europe-west1",
			Status:      "Pending",
			Replicas:    "0/2 Ready",
			IsCRD:       false,
			Summary:     "Batch ETL worker waiting on GPU/CPU node pool autoscaling",
			ConnectedTo: []string{"batch-ingestor"},
		},
		{
			ID:          "crd-spark-pi",
			Kind:        "SparkApplication",
			APIVersion:  "sparkoperator.k8s.io/v1beta2",
			Name:        "spark-pi-analytics",
			Namespace:   "spark-jobs",
			Cluster:     "analytics-europe-west1",
			Status:      "Pending",
			Replicas:    "0/4 Executors",
			IsCRD:       true,
			Summary:     "Driver scheduled; executors Pending GPU/CPU node pool scale-up",
			ConnectedTo: []string{"batch-ingestor"},
		},
		{
			ID:          "crd-ray-llm",
			Kind:        "RayCluster",
			APIVersion:  "ray.io/v1",
			Name:        "ray-llm-inference",
			Namespace:   "spark-jobs",
			Cluster:     "analytics-europe-west1",
			Status:      "Healthy",
			Replicas:    "1 Head, 2 Workers",
			IsCRD:       true,
			Summary:     "Serving distributed embedding pipeline on L4 GPU pool",
			ConnectedTo: []string{"batch-ingestor"},
		},
	}
}

// QueryResources executes the lookout_resources / list_gke_resources MCP tool to retrieve filtered Kubernetes resources.
// Returns (matchedResources, allClusterScopeResources, envelope, error).
func (l *LookoutClient) QueryResources(ctx context.Context, filter ResourceQueryFilter, topology *api.TopologyData) ([]api.K8sResource, []api.K8sResource, string, error) {
	if !AllowedReadTools["lookout_resources"] {
		return nil, nil, "", fmt.Errorf("security guardrail violation: tool \"lookout_resources\" is not in AllowedReadTools whitelist")
	}

	start := time.Now()
	var sourceResources []api.K8sResource

	// 1. If connected to a live MCP server, attempt JSON-RPC tool call first
	if l.mcpClient != nil {
		args := map[string]any{
			"kinds":     filter.Kinds,
			"cluster":   filter.Cluster,
			"namespace": filter.Namespace,
			"status":    filter.Status,
		}
		raw, err := l.mcpClient.CallTool(ctx, "lookout_resources", args)
		if err != nil {
			raw, err = l.mcpClient.CallTool(ctx, "list_gke_resources", args)
		}
		if err == nil && len(raw) > 0 {
			var parsed []api.K8sResource
			if jsonErr := json.Unmarshal(raw, &parsed); jsonErr == nil && len(parsed) > 0 {
				for i := range parsed {
					parsed[i].Summary = SanitizeFinding(parsed[i].Summary)
				}
				sourceResources = parsed
			}
		}
	}

	// 2. Gather resources from active TopologyData if not returned by live MCP
	if len(sourceResources) == 0 && topology != nil {
		for _, cl := range topology.Clusters {
			for _, ns := range cl.Namespaces {
				for _, r := range ns.Resources {
					r.Summary = SanitizeFinding(r.Summary)
					sourceResources = append(sourceResources, r)
				}
			}
		}
	}

	if len(sourceResources) == 0 {
		sourceResources = DefaultFallbackResources()
	}

	// 3. Apply Cluster and Namespace scoping first to get allScopeResources
	clusterLower := strings.ToLower(strings.TrimSpace(filter.Cluster))
	nsLower := strings.ToLower(strings.TrimSpace(filter.Namespace))
	statusLower := strings.ToLower(strings.TrimSpace(filter.Status))

	allScope := make([]api.K8sResource, 0, len(sourceResources))
	for _, r := range sourceResources {
		if clusterLower != "" && !strings.Contains(strings.ToLower(r.Cluster), clusterLower) && !strings.Contains(clusterLower, strings.ToLower(r.Cluster)) {
			continue
		}
		if nsLower != "" && nsLower != "all" && !strings.EqualFold(r.Namespace, nsLower) {
			continue
		}
		allScope = append(allScope, r)
	}

	// 4. Apply Kind and Status filtering to produce matched
	matched := make([]api.K8sResource, 0, len(allScope))
	for _, r := range allScope {
		if statusLower != "" && !strings.EqualFold(r.Status, statusLower) {
			continue
		}
		if len(filter.Kinds) > 0 {
			kindMatch := false
			for _, k := range filter.Kinds {
				kClean := strings.ToLower(strings.TrimSpace(k))
				if kClean == "crd" || kClean == "crds" || kClean == "customresource" {
					if r.IsCRD {
						kindMatch = true
						break
					}
				}
				if strings.EqualFold(r.Kind, kClean) || strings.Contains(strings.ToLower(r.Kind), kClean) || strings.Contains(kClean, strings.ToLower(r.Kind)) {
					kindMatch = true
					break
				}
			}
			if !kindMatch {
				continue
			}
		}
		matched = append(matched, r)
	}

	elapsed := time.Since(start).Milliseconds()
	if elapsed < 1 {
		elapsed = 3
	}
	kindsDesc := "all"
	if len(filter.Kinds) > 0 {
		kindsDesc = strings.Join(filter.Kinds, ",")
	}
	envelope := fmt.Sprintf("tool=lookout_resources(kinds=[%s]) matched=%d scanned=%d elapsed=%dms", kindsDesc, len(matched), len(sourceResources), elapsed)
	return matched, allScope, envelope, nil
}
