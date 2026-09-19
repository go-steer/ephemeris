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

// Package main implements the standalone Live GKE Chaos Simulator CLI (dev/tools/chaos).
// It operates exclusively inside the isolated "ephemeris-chaos" namespace on target GKE clusters.
package main

import (
	"context"
	"encoding/base64"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/container/v1"
	"google.golang.org/api/option"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

const (
	chaosNamespace = "ephemeris-chaos"
	managedByKey   = "app.kubernetes.io/managed-by"
	managedByVal   = "ephemeris-chaos"
	busyboxImage   = "registry.k8s.io/busybox:1.27"
)

func main() {
	log.SetFlags(0)
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	subcmd := os.Args[1]
	var scenario string
	flagArgs := os.Args[2:]
	if subcmd == "inject" {
		if len(flagArgs) > 0 && !strings.HasPrefix(flagArgs[0], "-") {
			scenario = flagArgs[0]
			flagArgs = flagArgs[1:]
		} else {
			scenario = "crashloop"
		}
	}

	fs := flag.NewFlagSet(subcmd, flag.ExitOnError)
	projectID := fs.String("project", envOrDefault("GOOGLE_CLOUD_PROJECT", "gke-demos-345619"), "GCP Project ID")
	clustersCSV := fs.String("cluster", "std-stable-1-35", "Comma-separated GKE cluster name(s) to target")
	_ = fs.Parse(flagArgs)

	targetNames := splitCSV(*clustersCSV)
	if len(targetNames) == 0 {
		log.Fatalf("error: at least one --cluster name is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	clients, err := connectToClusters(ctx, *projectID, targetNames)
	if err != nil {
		log.Fatalf("error connecting to GKE clusters: %v", err)
	}

	for clusterName, cs := range clients {
		switch subcmd {
		case "inject":
			if err := runInject(ctx, clusterName, cs, scenario); err != nil {
				log.Fatalf("[%s] inject %s failed: %v", clusterName, scenario, err)
			}
		case "heal":
			if err := runHeal(ctx, clusterName, cs); err != nil {
				log.Fatalf("[%s] heal failed: %v", clusterName, err)
			}
		case "status":
			if err := runStatus(ctx, clusterName, cs); err != nil {
				log.Fatalf("[%s] status failed: %v", clusterName, err)
			}
		case "clean", "rollback", "reset":
			if err := runClean(ctx, clusterName, cs); err != nil {
				log.Fatalf("[%s] %s failed: %v", clusterName, subcmd, err)
			}
		default:
			printUsage()
			os.Exit(1)
		}
	}
}

func printUsage() {
	fmt.Println(`Usage: dev/tools/chaos <command> [scenario] [--cluster=std-stable-1-35] [--project=gke-demos-345619]

Commands:
  inject crashloop       Deploy Service + StatefulSet (redis-ledger) + crashing Deployment (payment-gateway) in namespace 'ephemeris-chaos'
  inject oom-cascade     Deploy OOM-exiting StatefulSet (redis-cache) + ImagePullBackOff Deployment (checkout-worker) + Healthy Frontend
  inject pending-quota   Deploy unschedulable Deployment (llm-batch-trainer) requesting 128 CPUs to trigger Pending / FailedScheduling
  heal                   Patch all workloads in 'ephemeris-chaos' to healthy running containers (live GKE rolling update)
  rollback               Roll back and delete the 'ephemeris-chaos' namespace and all injected chaos resources (alias: clean, reset)
  status                 Print live status of all 'ephemeris-chaos' resources on target cluster(s)
  clean                  Delete the 'ephemeris-chaos' namespace and all chaos resources`)
}

func connectToClusters(ctx context.Context, projectID string, targetNames []string) (map[string]*kubernetes.Clientset, error) {
	ts, err := google.DefaultTokenSource(ctx, container.CloudPlatformScope)
	if err != nil {
		return nil, fmt.Errorf("acquire ADC token source: %w", err)
	}
	tok, err := ts.Token()
	if err != nil {
		return nil, fmt.Errorf("obtain ADC access token: %w", err)
	}

	svc, err := container.NewService(ctx, option.WithTokenSource(ts))
	if err != nil {
		return nil, fmt.Errorf("create GKE container/v1 client: %w", err)
	}

	parent := fmt.Sprintf("projects/%s/locations/-", projectID)
	resp, err := svc.Projects.Locations.Clusters.List(parent).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("list GKE clusters in %s: %w", parent, err)
	}

	wanted := make(map[string]bool, len(targetNames))
	for _, n := range targetNames {
		wanted[n] = true
	}

	out := make(map[string]*kubernetes.Clientset)
	for _, c := range resp.Clusters {
		if c == nil || !wanted[c.Name] {
			continue
		}
		var caData []byte
		isDNS := strings.HasSuffix(c.Endpoint, ".gke.goog")
		if !isDNS && c.MasterAuth != nil && c.MasterAuth.ClusterCaCertificate != "" {
			caData, _ = base64.StdEncoding.DecodeString(c.MasterAuth.ClusterCaCertificate)
		}
		restCfg := &rest.Config{
			Host:        "https://" + c.Endpoint,
			BearerToken: tok.AccessToken,
			TLSClientConfig: rest.TLSClientConfig{
				CAData:   caData,
				Insecure: !isDNS && len(caData) == 0,
			},
			Timeout: 10 * time.Second,
		}
		cs, err := kubernetes.NewForConfig(restCfg)
		if err != nil {
			return nil, fmt.Errorf("create client-go for %s: %w", c.Name, err)
		}
		out[c.Name] = cs
	}

	for _, name := range targetNames {
		if _, ok := out[name]; !ok {
			return nil, fmt.Errorf("cluster %q not found in project %s", name, projectID)
		}
	}
	return out, nil
}

func ensureChaosNamespace(ctx context.Context, cs *kubernetes.Clientset) error {
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: chaosNamespace,
			Labels: map[string]string{
				managedByKey: managedByVal,
			},
		},
	}
	_, err := cs.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{})
	if err != nil && !apierrors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

func runInject(ctx context.Context, clusterName string, cs *kubernetes.Clientset, scenario string) error {
	fmt.Printf("⚡ [%s] Ensuring isolated namespace %q...\n", clusterName, chaosNamespace)
	if err := ensureChaosNamespace(ctx, cs); err != nil {
		return fmt.Errorf("ensure namespace: %w", err)
	}

	switch scenario {
	case "crashloop", "payment-crashloop":
		// 1. Healthy StatefulSet redis-ledger (1 replica)
		sts := buildStatefulSet("redis-ledger", 1, busyboxImage, []string{
			"sh", "-c",
			`while true; do echo '{"severity":"INFO","service":"redis-ledger","msg":"AOF rewrite complete, 1420 active connections"}'; sleep 8; done`,
		}, "25m", "32Mi")
		if err := applyStatefulSet(ctx, cs, sts); err != nil {
			return err
		}

		// 2. Crashing Deployment payment-gateway (2 replicas -> exits 1 after emitting JSON stack trace)
		dep := buildDeployment("payment-gateway", 2, busyboxImage, []string{
			"sh", "-c",
			`echo '{"severity":"INFO","service":"payment-gateway","msg":"Starting gRPC settlement listener on :8080"}';
sleep 1;
echo '{"severity":"ERROR","service":"payment-gateway","msg":"redis connection pool exhausted: dial tcp redis-ledger.ephemeris-chaos.svc:6379: i/o timeout"}' >&2;
echo '{"severity":"FATAL","service":"payment-gateway","msg":"panic: runtime error: invalid memory address or nil pointer dereference in main.processSettlement(settlement.go:142)"}' >&2;
exit 1`,
		}, "25m", "32Mi")
		if err := applyDeployment(ctx, cs, dep); err != nil {
			return err
		}

		// 3. Service fronting payment-gateway
		svc := buildService("payment-gateway", map[string]string{"app": "payment-gateway"}, 8080)
		if err := applyService(ctx, cs, svc); err != nil {
			return err
		}

		fmt.Printf("✓ [%s] Injected scenario %q in namespace %q:\n", clusterName, scenario, chaosNamespace)
		fmt.Printf("  • StatefulSet/redis-ledger (1 replica, Running)\n")
		fmt.Printf("  • Deployment/payment-gateway (2 replicas, entering CrashLoopBackOff with JSON stack traces)\n")
		fmt.Printf("  • Service/payment-gateway (-> payment-gateway pods)\n")

	case "oom-cascade", "redis-oom":
		// 1. OOM-exiting StatefulSet redis-cache (exit 137)
		sts := buildStatefulSet("redis-cache", 1, busyboxImage, []string{
			"sh", "-c",
			`echo '{"severity":"WARNING","service":"redis-cache","msg":"used_memory_rss=4294967296 exceeds maxmemory_limit=4294967296"}' >&2;
echo '{"severity":"FATAL","service":"redis-cache","msg":"Out of memory: Killed process 1 (redis-server) total-vm:4194304kB, anon-rss:4194304kB, exit_code=137"}' >&2;
exit 137`,
		}, "25m", "32Mi")
		if err := applyStatefulSet(ctx, cs, sts); err != nil {
			return err
		}

		// 2. ImagePullBackOff Deployment checkout-worker
		depErr := buildDeployment("checkout-worker", 2, "registry.k8s.io/invalid-ephemeris-image/checkout-worker:v0.0.0-broken", nil, "25m", "32Mi")
		if err := applyDeployment(ctx, cs, depErr); err != nil {
			return err
		}

		// 3. Healthy Deployment frontend-web + Service
		depOK := buildDeployment("frontend-web", 2, busyboxImage, []string{
			"sh", "-c",
			`while true; do echo '{"severity":"WARNING","service":"frontend-web","msg":"upstream checkout-worker unavailable (HTTP 503), serving degraded cart UI"}'; sleep 6; done`,
		}, "25m", "32Mi")
		if err := applyDeployment(ctx, cs, depOK); err != nil {
			return err
		}
		svc := buildService("frontend-web", map[string]string{"app": "frontend-web"}, 80)
		if err := applyService(ctx, cs, svc); err != nil {
			return err
		}

		fmt.Printf("✓ [%s] Injected scenario %q in namespace %q:\n", clusterName, scenario, chaosNamespace)
		fmt.Printf("  • StatefulSet/redis-cache (1 replica, exit 137 OOMKilled loop)\n")
		fmt.Printf("  • Deployment/checkout-worker (2 replicas, ImagePullBackOff)\n")
		fmt.Printf("  • Deployment/frontend-web + Service/frontend-web (2 replicas, Running)\n")

	case "pending-quota":
		// Unschedulable Deployment requesting 128 CPUs & 512Gi RAM
		dep := buildDeployment("llm-batch-trainer", 2, busyboxImage, []string{
			"sh", "-c", "sleep 3600",
		}, "128000m", "512Gi")
		if err := applyDeployment(ctx, cs, dep); err != nil {
			return err
		}
		fmt.Printf("✓ [%s] Injected scenario %q in namespace %q:\n", clusterName, scenario, chaosNamespace)
		fmt.Printf("  • Deployment/llm-batch-trainer (2 replicas requesting 128 CPU / 512Gi -> Pending / FailedScheduling)\n")

	default:
		return fmt.Errorf("unknown scenario %q (supported: crashloop, oom-cascade, pending-quota)", scenario)
	}

	return nil
}

func runHeal(ctx context.Context, clusterName string, cs *kubernetes.Clientset) error {
	healthyCmd := []string{
		"sh", "-c",
		`while true; do echo '{"severity":"INFO","service":"ephemeris-chaos","msg":"Remediation verified: workload healthy, p99 latency 4.2ms"}'; sleep 10; done`,
	}

	deps, err := cs.AppsV1().Deployments(chaosNamespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("%s=%s", managedByKey, managedByVal),
	})
	if err != nil {
		return err
	}
	for i := range deps.Items {
		d := &deps.Items[i]
		for cIdx := range d.Spec.Template.Spec.Containers {
			d.Spec.Template.Spec.Containers[cIdx].Image = busyboxImage
			d.Spec.Template.Spec.Containers[cIdx].Command = healthyCmd
			d.Spec.Template.Spec.Containers[cIdx].Resources = corev1.ResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("20m"),
					corev1.ResourceMemory: resource.MustParse("32Mi"),
				},
			}
		}
		if d.Spec.Template.Annotations == nil {
			d.Spec.Template.Annotations = map[string]string{}
		}
		d.Spec.Template.Annotations["ephemeris.io/healed-at"] = time.Now().UTC().Format(time.RFC3339)
		if _, err := cs.AppsV1().Deployments(chaosNamespace).Update(ctx, d, metav1.UpdateOptions{}); err != nil {
			return fmt.Errorf("update deployment %s: %w", d.Name, err)
		}
		fmt.Printf("🟢 [%s] Healed Deployment/%s -> rolling update to Running\n", clusterName, d.Name)
	}

	stss, err := cs.AppsV1().StatefulSets(chaosNamespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("%s=%s", managedByKey, managedByVal),
	})
	if err != nil {
		return err
	}
	for i := range stss.Items {
		s := &stss.Items[i]
		for cIdx := range s.Spec.Template.Spec.Containers {
			s.Spec.Template.Spec.Containers[cIdx].Image = busyboxImage
			s.Spec.Template.Spec.Containers[cIdx].Command = healthyCmd
		}
		if s.Spec.Template.Annotations == nil {
			s.Spec.Template.Annotations = map[string]string{}
		}
		s.Spec.Template.Annotations["ephemeris.io/healed-at"] = time.Now().UTC().Format(time.RFC3339)
		if _, err := cs.AppsV1().StatefulSets(chaosNamespace).Update(ctx, s, metav1.UpdateOptions{}); err != nil {
			return fmt.Errorf("update statefulset %s: %w", s.Name, err)
		}
		fmt.Printf("🟢 [%s] Healed StatefulSet/%s -> rolling update to Running\n", clusterName, s.Name)
	}
	return nil
}

func runStatus(ctx context.Context, clusterName string, cs *kubernetes.Clientset) error {
	pods, err := cs.CoreV1().Pods(chaosNamespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return err
	}
	fmt.Printf("=== [%s] Namespace %q (%d pods) ===\n", clusterName, chaosNamespace, len(pods.Items))
	for _, p := range pods.Items {
		state := string(p.Status.Phase)
		var restarts int32
		for _, cs := range p.Status.ContainerStatuses {
			restarts += cs.RestartCount
			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				state = cs.State.Waiting.Reason
			} else if cs.State.Terminated != nil && cs.State.Terminated.Reason != "" {
				state = fmt.Sprintf("%s(exit=%d)", cs.State.Terminated.Reason, cs.State.Terminated.ExitCode)
			}
		}
		fmt.Printf("  • Pod/%-38s Status: %-20s Restarts: %d\n", p.Name, state, restarts)
	}
	return nil
}

func runClean(ctx context.Context, clusterName string, cs *kubernetes.Clientset) error {
	err := cs.CoreV1().Namespaces().Delete(ctx, chaosNamespace, metav1.DeleteOptions{})
	if err != nil && !apierrors.IsNotFound(err) {
		return err
	}
	fmt.Printf("🧹 [%s] Deleted namespace %q and all chaos resources.\n", clusterName, chaosNamespace)
	return nil
}

func buildDeployment(name string, replicas int32, image string, cmd []string, cpuReq, memReq string) *appsv1.Deployment {
	labels := map[string]string{
		"app":        name,
		managedByKey: managedByVal,
	}
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: chaosNamespace,
			Labels:    labels,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": name}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:    name,
							Image:   image,
							Command: cmd,
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse(cpuReq),
									corev1.ResourceMemory: resource.MustParse(memReq),
								},
							},
						},
					},
				},
			},
		},
	}
}

func buildStatefulSet(name string, replicas int32, image string, cmd []string, cpuReq, memReq string) *appsv1.StatefulSet {
	labels := map[string]string{
		"app":        name,
		managedByKey: managedByVal,
	}
	return &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: chaosNamespace,
			Labels:    labels,
		},
		Spec: appsv1.StatefulSetSpec{
			ServiceName: name,
			Replicas:    &replicas,
			Selector:    &metav1.LabelSelector{MatchLabels: map[string]string{"app": name}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:    name,
							Image:   image,
							Command: cmd,
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse(cpuReq),
									corev1.ResourceMemory: resource.MustParse(memReq),
								},
							},
						},
					},
				},
			},
		},
	}
}

func buildService(name string, selector map[string]string, port int32) *corev1.Service {
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: chaosNamespace,
			Labels: map[string]string{
				"app":        name,
				managedByKey: managedByVal,
			},
		},
		Spec: corev1.ServiceSpec{
			Selector: selector,
			Ports: []corev1.ServicePort{
				{
					Name:       "http",
					Port:       port,
					TargetPort: intstr.FromInt32(port),
				},
			},
		},
	}
}

func applyDeployment(ctx context.Context, cs *kubernetes.Clientset, dep *appsv1.Deployment) error {
	_, err := cs.AppsV1().Deployments(chaosNamespace).Create(ctx, dep, metav1.CreateOptions{})
	if apierrors.IsAlreadyExists(err) {
		_, err = cs.AppsV1().Deployments(chaosNamespace).Update(ctx, dep, metav1.UpdateOptions{})
	}
	return err
}

func applyStatefulSet(ctx context.Context, cs *kubernetes.Clientset, sts *appsv1.StatefulSet) error {
	_, err := cs.AppsV1().StatefulSets(chaosNamespace).Create(ctx, sts, metav1.CreateOptions{})
	if apierrors.IsAlreadyExists(err) {
		_, err = cs.AppsV1().StatefulSets(chaosNamespace).Update(ctx, sts, metav1.UpdateOptions{})
	}
	return err
}

func applyService(ctx context.Context, cs *kubernetes.Clientset, svc *corev1.Service) error {
	existing, err := cs.CoreV1().Services(chaosNamespace).Get(ctx, svc.Name, metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		_, err = cs.CoreV1().Services(chaosNamespace).Create(ctx, svc, metav1.CreateOptions{})
		return err
	}
	if err != nil {
		return err
	}
	svc.ResourceVersion = existing.ResourceVersion
	svc.Spec.ClusterIP = existing.Spec.ClusterIP
	_, err = cs.CoreV1().Services(chaosNamespace).Update(ctx, svc, metav1.UpdateOptions{})
	return err
}

func envOrDefault(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
