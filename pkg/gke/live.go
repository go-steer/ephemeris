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
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/container/v1"
	"google.golang.org/api/option"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/go-steer/ephemeris/pkg/api"
	"github.com/go-steer/ephemeris/pkg/mcp"
)

// LiveProvider discovers real GKE clusters and Kubernetes workloads using the native
// Google Cloud GKE Go SDK (google.golang.org/api/container/v1) and Kubernetes Go client
// (k8s.io/client-go/kubernetes), with fallback to the GKE control-plane MCP bridge for
// private-endpoint clusters.
type LiveProvider struct {
	projectID   string
	tokenSource oauth2.TokenSource
	mcpClient   *mcp.Client
	fallback    *MockProvider

	mu          sync.RWMutex
	cachedTopo  *api.TopologyData
	cachedAt    time.Time
	cacheTTL    time.Duration
	clientsets  map[string]*kubernetes.Clientset
	clusterLocs map[string]string
}

// NewLiveProvider creates a native Google Cloud GKE + Kubernetes client-go provider.
func NewLiveProvider(ctx context.Context, projectID string, mcpClient *mcp.Client) (*LiveProvider, error) {
	if projectID == "" {
		return nil, fmt.Errorf("gcp project ID is required for LiveProvider")
	}

	ts, err := google.DefaultTokenSource(ctx, container.CloudPlatformScope)
	if err != nil {
		return nil, fmt.Errorf("failed to acquire ADC token source for GKE SDK: %w", err)
	}

	return &LiveProvider{
		projectID:   projectID,
		tokenSource: ts,
		mcpClient:   mcpClient,
		fallback:    NewMockProvider(),
		cacheTTL:    6 * time.Second,
		clientsets:  make(map[string]*kubernetes.Clientset),
		clusterLocs: make(map[string]string),
	}, nil
}

// ClientsetForCluster returns the cached in-memory k8s.io/client-go Clientset for a cluster.
func (p *LiveProvider) ClientsetForCluster(clusterName string) (*kubernetes.Clientset, string) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.clientsets[clusterName], p.clusterLocs[clusterName]
}

// GetTopology queries the native GKE Cluster Manager API and concurrently inspects
// each running cluster via k8s.io/client-go.
func (p *LiveProvider) GetTopology(ctx context.Context) (*api.TopologyData, error) {
	p.mu.RLock()
	if p.cachedTopo != nil && time.Since(p.cachedAt) < p.cacheTTL {
		topo := p.cachedTopo
		p.mu.RUnlock()
		return topo, nil
	}
	p.mu.RUnlock()

	svc, err := container.NewService(ctx, option.WithTokenSource(p.tokenSource))
	if err != nil {
		return nil, fmt.Errorf("failed to create GKE container/v1 service: %w", err)
	}

	parent := fmt.Sprintf("projects/%s/locations/-", p.projectID)
	listCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	resp, err := svc.Projects.Locations.Clusters.List(parent).Context(listCtx).Do()
	if err != nil {
		return nil, fmt.Errorf("GKE Clusters.List(%s) failed: %w", parent, err)
	}

	var runningClusters []*container.Cluster
	for _, c := range resp.Clusters {
		if c != nil && (c.Status == "RUNNING" || c.Status == "RECONCILING" || c.Status == "DEGRADED") {
			runningClusters = append(runningClusters, c)
		}
	}

	sort.Slice(runningClusters, func(i, j int) bool {
		return runningClusters[i].Name < runningClusters[j].Name
	})

	tok, err := p.tokenSource.Token()
	if err != nil {
		return nil, fmt.Errorf("failed to obtain ADC bearer token for client-go: %w", err)
	}

	clusterNodes := make([]api.ClusterNode, len(runningClusters))
	var wg sync.WaitGroup

	for i, c := range runningClusters {
		wg.Add(1)
		go func(idx int, cluster *container.Cluster) {
			defer wg.Done()
			cctx, ccancel := context.WithTimeout(ctx, 4*time.Second)
			defer ccancel()

			node, cs := p.inspectCluster(cctx, cluster, tok.AccessToken)
			clusterNodes[idx] = node

			if cs != nil {
				p.mu.Lock()
				p.clientsets[cluster.Name] = cs
				p.clusterLocs[cluster.Name] = cluster.Location
				p.mu.Unlock()
			}
		}(i, c)
	}

	wg.Wait()

	topo := &api.TopologyData{
		Mode:       "live",
		ProjectID:  p.projectID,
		ScenarioID: "live:" + p.projectID,
		Clusters:   clusterNodes,
	}

	p.mu.Lock()
	p.cachedTopo = topo
	p.cachedAt = time.Now()
	p.mu.Unlock()

	log.Printf("[gke/live] Synchronized %d live GKE clusters from project %s via native container/v1 + client-go", len(clusterNodes), p.projectID)
	return topo, nil
}

func (p *LiveProvider) inspectCluster(ctx context.Context, cluster *container.Cluster, bearerToken string) (api.ClusterNode, *kubernetes.Clientset) {
	node := api.ClusterNode{
		Name:      cluster.Name,
		ProjectID: p.projectID,
		Location:  cluster.Location,
	}

	if cluster.Endpoint != "" {
		var caData []byte
		isDNSEndpoint := strings.HasSuffix(cluster.Endpoint, ".gke.goog")
		if !isDNSEndpoint && cluster.MasterAuth != nil && cluster.MasterAuth.ClusterCaCertificate != "" {
			caData, _ = base64.StdEncoding.DecodeString(cluster.MasterAuth.ClusterCaCertificate)
		}

		restCfg := &rest.Config{
			Host:        "https://" + cluster.Endpoint,
			BearerToken: bearerToken,
			TLSClientConfig: rest.TLSClientConfig{
				CAData:   caData,
				Insecure: !isDNSEndpoint && len(caData) == 0,
			},
			Timeout: 3500 * time.Millisecond,
		}

		if cs, err := kubernetes.NewForConfig(restCfg); err == nil {
			if namespaces, err := p.fetchClusterViaClientGo(ctx, cluster.Name, cs); err == nil && len(namespaces) > 0 {
				node.Namespaces = namespaces
				return node, cs
			}
		}
	}

	// Fallback 1: If cluster endpoint is private/DNS-restricted, query via Google GKE MCP control-plane bridge
	if p.mcpClient != nil {
		if namespaces, err := p.fetchClusterViaMCPBridge(ctx, cluster); err == nil && len(namespaces) > 0 {
			node.Namespaces = namespaces
			return node, nil
		}
	}

	// Fallback 2: Synthesize node pool representation from GKE container/v1 metadata so cluster renders cleanly
	node.Namespaces = synthesizeNodePoolTopology(cluster)
	return node, nil
}

func (p *LiveProvider) fetchClusterViaClientGo(ctx context.Context, clusterName string, cs *kubernetes.Clientset) ([]api.NamespaceNode, error) {
	var (
		podList *corev1.PodList
		depList *appsv1.DeploymentList
		rsList  *appsv1.ReplicaSetList
		stsList *appsv1.StatefulSetList
		dsList  *appsv1.DaemonSetList
		svcList *corev1.ServiceList
		podErr  error
	)

	var wg sync.WaitGroup
	wg.Add(6)
	go func() {
		defer wg.Done()
		podList, podErr = cs.CoreV1().Pods("").List(ctx, metav1.ListOptions{Limit: 250})
	}()
	go func() {
		defer wg.Done()
		depList, _ = cs.AppsV1().Deployments("").List(ctx, metav1.ListOptions{Limit: 150})
	}()
	go func() {
		defer wg.Done()
		rsList, _ = cs.AppsV1().ReplicaSets("").List(ctx, metav1.ListOptions{Limit: 200})
	}()
	go func() {
		defer wg.Done()
		stsList, _ = cs.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{Limit: 100})
	}()
	go func() {
		defer wg.Done()
		dsList, _ = cs.AppsV1().DaemonSets("").List(ctx, metav1.ListOptions{Limit: 100})
	}()
	go func() {
		defer wg.Done()
		svcList, _ = cs.CoreV1().Services("").List(ctx, metav1.ListOptions{Limit: 150})
	}()
	wg.Wait()

	if podErr != nil || podList == nil {
		return nil, fmt.Errorf("client-go Pods.List failed: %w", podErr)
	}

	return buildNamespacesFromTypedLists(clusterName, podList, depList, rsList, stsList, dsList, svcList), nil
}

func isSystemNamespace(ns string) bool {
	return ns == "kube-system" || ns == "kube-public" || ns == "kube-node-lease" ||
		strings.HasPrefix(ns, "gke-")
}

func buildNamespacesFromTypedLists(
	clusterName string,
	podList *corev1.PodList,
	depList *appsv1.DeploymentList,
	rsList *appsv1.ReplicaSetList,
	stsList *appsv1.StatefulSetList,
	dsList *appsv1.DaemonSetList,
	svcList *corev1.ServiceList,
) []api.NamespaceNode {
	nsPods := make(map[string][]api.PodNode)
	nsRawPods := make(map[string][]corev1.Pod)
	nsRes := make(map[string]map[string]*api.K8sResource)
	uidToResID := make(map[string]string)

	ensureNS := func(ns string) {
		if _, ok := nsRes[ns]; !ok {
			nsRes[ns] = make(map[string]*api.K8sResource)
		}
	}

	// 1. Deployments
	if depList != nil {
		for _, d := range depList.Items {
			ensureNS(d.Namespace)
			id := fmt.Sprintf("dep-%s-%s-%s", clusterName, d.Namespace, d.Name)
			uidToResID[string(d.UID)] = id
			replicas := int32(1)
			if d.Spec.Replicas != nil {
				replicas = *d.Spec.Replicas
			}
			status := "Healthy"
			if d.Status.ReadyReplicas < replicas {
				status = "Degraded"
			}
			nsRes[d.Namespace][id] = &api.K8sResource{
				ID:         id,
				Kind:       "Deployment",
				APIVersion: "apps/v1",
				Name:       d.Name,
				Namespace:  d.Namespace,
				Cluster:    clusterName,
				Status:     status,
				Replicas:   fmt.Sprintf("%d/%d", d.Status.ReadyReplicas, replicas),
				Summary:    fmt.Sprintf("Deployment %s (%d/%d ready)", d.Name, d.Status.ReadyReplicas, replicas),
			}
		}
	}

	// 2. ReplicaSets (only active ReplicaSets with replicas > 0)
	if rsList != nil {
		for _, rs := range rsList.Items {
			replicas := int32(0)
			if rs.Spec.Replicas != nil {
				replicas = *rs.Spec.Replicas
			}
			if replicas == 0 && rs.Status.Replicas == 0 {
				continue
			}
			ensureNS(rs.Namespace)
			id := fmt.Sprintf("rs-%s-%s-%s", clusterName, rs.Namespace, rs.Name)
			uidToResID[string(rs.UID)] = id
			status := "Healthy"
			if rs.Status.ReadyReplicas < rs.Status.Replicas {
				status = "Degraded"
			}
			var ownerID, ownerKind string
			for _, o := range rs.OwnerReferences {
				if parentID, ok := uidToResID[string(o.UID)]; ok {
					ownerID = parentID
					ownerKind = o.Kind
					if parentRes, exists := nsRes[rs.Namespace][parentID]; exists {
						parentRes.ChildrenIDs = append(parentRes.ChildrenIDs, id)
					}
					break
				}
			}
			nsRes[rs.Namespace][id] = &api.K8sResource{
				ID:         id,
				Kind:       "ReplicaSet",
				APIVersion: "apps/v1",
				Name:       rs.Name,
				Namespace:  rs.Namespace,
				Cluster:    clusterName,
				Status:     status,
				Replicas:   fmt.Sprintf("%d/%d", rs.Status.ReadyReplicas, rs.Status.Replicas),
				OwnerID:    ownerID,
				OwnerKind:  ownerKind,
				Summary:    fmt.Sprintf("ReplicaSet %s (%d/%d ready)", rs.Name, rs.Status.ReadyReplicas, rs.Status.Replicas),
			}
		}
	}

	// 3. StatefulSets
	if stsList != nil {
		for _, sts := range stsList.Items {
			ensureNS(sts.Namespace)
			id := fmt.Sprintf("sts-%s-%s-%s", clusterName, sts.Namespace, sts.Name)
			uidToResID[string(sts.UID)] = id
			replicas := int32(1)
			if sts.Spec.Replicas != nil {
				replicas = *sts.Spec.Replicas
			}
			status := "Healthy"
			if sts.Status.ReadyReplicas < replicas {
				status = "Degraded"
			}
			nsRes[sts.Namespace][id] = &api.K8sResource{
				ID:         id,
				Kind:       "StatefulSet",
				APIVersion: "apps/v1",
				Name:       sts.Name,
				Namespace:  sts.Namespace,
				Cluster:    clusterName,
				Status:     status,
				Replicas:   fmt.Sprintf("%d/%d", sts.Status.ReadyReplicas, replicas),
				Summary:    fmt.Sprintf("StatefulSet %s (%d/%d ready)", sts.Name, sts.Status.ReadyReplicas, replicas),
			}
		}
	}

	// 4. DaemonSets
	if dsList != nil {
		for _, ds := range dsList.Items {
			ensureNS(ds.Namespace)
			id := fmt.Sprintf("ds-%s-%s-%s", clusterName, ds.Namespace, ds.Name)
			uidToResID[string(ds.UID)] = id
			status := "Healthy"
			if ds.Status.NumberReady < ds.Status.DesiredNumberScheduled {
				status = "Degraded"
			}
			nsRes[ds.Namespace][id] = &api.K8sResource{
				ID:         id,
				Kind:       "DaemonSet",
				APIVersion: "apps/v1",
				Name:       ds.Name,
				Namespace:  ds.Namespace,
				Cluster:    clusterName,
				Status:     status,
				Replicas:   fmt.Sprintf("%d/%d", ds.Status.NumberReady, ds.Status.DesiredNumberScheduled),
				Summary:    fmt.Sprintf("DaemonSet %s (%d/%d ready)", ds.Name, ds.Status.NumberReady, ds.Status.DesiredNumberScheduled),
			}
		}
	}

	// 5. Pods (cap healthy system pods per namespace to keep 10-cluster canvas crisp)
	sysHealthyCount := make(map[string]int)
	for _, pod := range podList.Items {
		status := classifyPodStatus(&pod)
		if isSystemNamespace(pod.Namespace) && status == api.StatusRunning {
			if sysHealthyCount[pod.Namespace] >= 8 {
				continue
			}
			sysHealthyCount[pod.Namespace]++
		}

		ensureNS(pod.Namespace)
		podID := fmt.Sprintf("pod-%s-%s-%s", clusterName, pod.Namespace, pod.Name)
		var restarts int
		for _, cs := range pod.Status.ContainerStatuses {
			restarts += int(cs.RestartCount)
		}

		var ownerID, ownerKind string
		for _, o := range pod.OwnerReferences {
			if parentID, ok := uidToResID[string(o.UID)]; ok {
				ownerID = parentID
				ownerKind = o.Kind
				if parentRes, exists := nsRes[pod.Namespace][parentID]; exists {
					parentRes.ChildrenIDs = append(parentRes.ChildrenIDs, podID)
				}
				break
			}
		}

		cpuStr, memStr := extractPodResourceRequests(&pod)
		nsPods[pod.Namespace] = append(nsPods[pod.Namespace], api.PodNode{
			ID:          podID,
			Name:        pod.Name,
			Namespace:   pod.Namespace,
			Cluster:     clusterName,
			Status:      status,
			Restarts:    restarts,
			CPUUsage:    cpuStr,
			MemoryUsage: memStr,
			OwnerID:     ownerID,
			OwnerKind:   ownerKind,
			Labels:      pod.Labels,
		})
		nsRawPods[pod.Namespace] = append(nsRawPods[pod.Namespace], pod)
	}

	// 6. Services (match Pod label selectors)
	if svcList != nil {
		for _, svc := range svcList.Items {
			if svc.Name == "kubernetes" && svc.Namespace == "default" {
				continue
			}
			if _, hasPods := nsPods[svc.Namespace]; !hasPods {
				continue
			}
			ensureNS(svc.Namespace)
			id := fmt.Sprintf("svc-%s-%s-%s", clusterName, svc.Namespace, svc.Name)
			var children []string
			if len(svc.Spec.Selector) > 0 {
				sel := labels.SelectorFromSet(svc.Spec.Selector)
				for _, p := range nsRawPods[svc.Namespace] {
					if sel.Matches(labels.Set(p.Labels)) {
						children = append(children, fmt.Sprintf("pod-%s-%s-%s", clusterName, p.Namespace, p.Name))
					}
				}
			}
			nsRes[svc.Namespace][id] = &api.K8sResource{
				ID:          id,
				Kind:        "Service",
				APIVersion:  "v1",
				Name:        svc.Name,
				Namespace:   svc.Namespace,
				Cluster:     clusterName,
				Status:      "Healthy",
				ChildrenIDs: children,
				ConnectedTo: children,
				Summary:     fmt.Sprintf("Service %s (%s)", svc.Name, svc.Spec.Type),
			}
		}
	}

	var result []api.NamespaceNode
	for ns, pods := range nsPods {
		if len(pods) == 0 {
			continue
		}
		var resources []api.K8sResource
		for _, r := range nsRes[ns] {
			// Skip system controllers that have no visible pods after system capping
			if isSystemNamespace(ns) && r.Kind != "Service" && len(r.ChildrenIDs) == 0 {
				continue
			}
			resources = append(resources, *r)
		}
		sort.Slice(resources, func(i, j int) bool {
			return resources[i].Name < resources[j].Name
		})
		result = append(result, api.NamespaceNode{
			Name:      ns,
			Pods:      pods,
			Resources: resources,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		// Sort application namespaces ahead of system namespaces
		sysI := isSystemNamespace(result[i].Name)
		sysJ := isSystemNamespace(result[j].Name)
		if sysI != sysJ {
			return !sysI
		}
		return result[i].Name < result[j].Name
	})

	return result
}

func classifyPodStatus(pod *corev1.Pod) api.NodeStatus {
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Waiting != nil {
			reason := cs.State.Waiting.Reason
			if strings.Contains(reason, "BackOff") || strings.Contains(reason, "Error") || strings.Contains(reason, "Invalid") {
				return api.StatusError
			}
		}
		if cs.State.Terminated != nil && cs.State.Terminated.ExitCode != 0 {
			return api.StatusError
		}
	}
	switch pod.Status.Phase {
	case corev1.PodFailed:
		return api.StatusError
	case corev1.PodPending:
		return api.StatusPending
	default:
		return api.StatusRunning
	}
}

func extractPodResourceRequests(pod *corev1.Pod) (string, string) {
	var cpuMillis int64
	var memMiB int64
	for _, c := range pod.Spec.Containers {
		if cpu, ok := c.Resources.Requests[corev1.ResourceCPU]; ok {
			cpuMillis += cpu.MilliValue()
		}
		if mem, ok := c.Resources.Requests[corev1.ResourceMemory]; ok {
			memMiB += mem.Value() / (1024 * 1024)
		}
	}
	if cpuMillis <= 0 {
		cpuMillis = 100
	}
	if memMiB <= 0 {
		memMiB = 128
	}
	return fmt.Sprintf("%dm", cpuMillis), fmt.Sprintf("%dMi", memMiB)
}

// fetchClusterViaMCPBridge uses container.googleapis.com/mcp's get_k8s_resource (outputFormat: wide)
// for clusters whose Kubernetes API server uses a private IP or GKE DNS control plane bridge.
func (p *LiveProvider) fetchClusterViaMCPBridge(ctx context.Context, cluster *container.Cluster) ([]api.NamespaceNode, error) {
	parent := fmt.Sprintf("projects/%s/locations/%s/clusters/%s", p.projectID, cluster.Location, cluster.Name)
	raw, err := p.mcpClient.CallTool(ctx, "get_k8s_resource", map[string]interface{}{
		"parent":       parent,
		"resourceType": "pods",
		"outputFormat": "wide",
	})
	if err != nil {
		return nil, err
	}

	var out struct {
		Output string `json:"output"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || strings.TrimSpace(out.Output) == "" {
		return nil, fmt.Errorf("empty wide pod table")
	}

	lines := strings.Split(strings.TrimSpace(out.Output), "\n")
	if len(lines) <= 1 {
		return nil, fmt.Errorf("no pod rows")
	}

	nsPods := make(map[string][]api.PodNode)
	sysCount := make(map[string]int)
	for _, line := range lines[1:] {
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}
		ns, name, statusStr, restartsStr := fields[0], fields[1], fields[3], fields[4]
		status := api.StatusRunning
		if strings.Contains(statusStr, "BackOff") || strings.Contains(statusStr, "Error") || strings.Contains(statusStr, "Failed") || strings.Contains(statusStr, "OOM") {
			status = api.StatusError
		} else if strings.Contains(statusStr, "Pending") || strings.Contains(statusStr, "Creating") || strings.Contains(statusStr, "Init") {
			status = api.StatusPending
		}

		if isSystemNamespace(ns) && status == api.StatusRunning {
			if sysCount[ns] >= 8 {
				continue
			}
			sysCount[ns]++
		}

		restarts := 0
		_, _ = fmt.Sscanf(restartsStr, "%d", &restarts)
		nsPods[ns] = append(nsPods[ns], api.PodNode{
			ID:          fmt.Sprintf("pod-%s-%s-%s", cluster.Name, ns, name),
			Name:        name,
			Namespace:   ns,
			Cluster:     cluster.Name,
			Status:      status,
			Restarts:    restarts,
			CPUUsage:    "125m",
			MemoryUsage: "256Mi",
		})
	}

	var result []api.NamespaceNode
	for ns, pods := range nsPods {
		result = append(result, api.NamespaceNode{
			Name: ns,
			Pods: pods,
		})
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result, nil
}

func synthesizeNodePoolTopology(cluster *container.Cluster) []api.NamespaceNode {
	var pods []api.PodNode
	for _, np := range cluster.NodePools {
		if np == nil {
			continue
		}
		status := api.StatusRunning
		if np.Status != "RUNNING" && np.Status != "" {
			status = api.StatusPending
		}
		pods = append(pods, api.PodNode{
			ID:          fmt.Sprintf("pod-%s-nodepool-%s", cluster.Name, np.Name),
			Name:        "pool-" + np.Name,
			Namespace:   "gke-nodepools",
			Cluster:     cluster.Name,
			Status:      status,
			CPUUsage:    "250m",
			MemoryUsage: "512Mi",
		})
	}
	if len(pods) == 0 {
		pods = append(pods, api.PodNode{
			ID:          fmt.Sprintf("pod-%s-control-plane", cluster.Name),
			Name:        "gke-autopilot-runtime",
			Namespace:   "kube-system",
			Cluster:     cluster.Name,
			Status:      api.StatusRunning,
			CPUUsage:    "200m",
			MemoryUsage: "512Mi",
		})
	}
	return []api.NamespaceNode{
		{
			Name: "kube-system",
			Pods: pods,
		},
	}
}

// GetPodDetails locates a pod across the cached live GKE topology.
func (p *LiveProvider) GetPodDetails(ctx context.Context, resourceURI string) (*api.PodNode, error) {
	topo, err := p.GetTopology(ctx)
	if err != nil {
		return nil, err
	}
	for _, c := range topo.Clusters {
		for _, ns := range c.Namespaces {
			for _, pod := range ns.Pods {
				if strings.Contains(resourceURI, pod.Name) || strings.Contains(resourceURI, pod.ID) {
					cp := pod
					return &cp, nil
				}
			}
		}
	}
	return p.fallback.GetPodDetails(ctx, resourceURI)
}

// RemediatePod delegates simulated remediation in read-only live mode.
func (p *LiveProvider) RemediatePod(ctx context.Context, podIDOrName string, action string) (*api.PodNode, error) {
	return p.fallback.RemediatePod(ctx, podIDOrName, action)
}

// ApplyScenario invalidates the live cache and refreshes live topology.
func (p *LiveProvider) ApplyScenario(ctx context.Context, scenarioID string) (*api.TopologyData, error) {
	p.mu.Lock()
	p.cachedTopo = nil
	p.mu.Unlock()
	return p.GetTopology(ctx)
}

// ApplyScaleTest delegates synthetic scale test generation to the fallback provider.
func (p *LiveProvider) ApplyScaleTest(ctx context.Context, cfg api.ScaleTestConfig) (*api.TopologyData, error) {
	return p.fallback.ApplyScaleTest(ctx, cfg)
}
