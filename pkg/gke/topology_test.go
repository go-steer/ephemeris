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

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	"github.com/go-steer/ephemeris/pkg/api"
)

func TestMockProvider_GetTopology(t *testing.T) {
	provider := NewMockProvider()
	ctx := context.Background()

	topo, err := provider.GetTopology(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(topo.Clusters) != 3 {
		t.Fatalf("expected 3 clusters, got %d", len(topo.Clusters))
	}

	cluster := topo.Clusters[0]
	if cluster.Name != "production-us-central1" {
		t.Errorf("expected production-us-central1, got %s", cluster.Name)
	}

	stagingCluster := topo.Clusters[1]
	if stagingCluster.Name != "staging-us-east4" {
		t.Errorf("expected staging-us-east4, got %s", stagingCluster.Name)
	}

	analyticsCluster := topo.Clusters[2]
	if analyticsCluster.Name != "analytics-europe-west1" {
		t.Errorf("expected analytics-europe-west1, got %s", analyticsCluster.Name)
	}

	// Verify namespaces in primary cluster
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

func TestBuildNamespacesFromTypedLists_GatewayHTTPRoute(t *testing.T) {
	replicas := int32(1)
	gwKind := "Gateway"
	port80 := int32(80)

	depList := &appsv1.DeploymentList{
		Items: []appsv1.Deployment{
			{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "nginx-deployment-gw",
					Namespace: "default",
					UID:       types.UID("uid-dep-1"),
				},
				Spec: appsv1.DeploymentSpec{Replicas: &replicas},
				Status: appsv1.DeploymentStatus{
					Replicas:      1,
					ReadyReplicas: 1,
				},
			},
		},
	}

	rsList := &appsv1.ReplicaSetList{
		Items: []appsv1.ReplicaSet{
			{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "nginx-deployment-gw-67d47f7585",
					Namespace: "default",
					UID:       types.UID("uid-rs-1"),
					OwnerReferences: []metav1.OwnerReference{
						{UID: types.UID("uid-dep-1"), Kind: "Deployment", Name: "nginx-deployment-gw"},
					},
				},
				Spec: appsv1.ReplicaSetSpec{Replicas: &replicas},
				Status: appsv1.ReplicaSetStatus{
					Replicas:      1,
					ReadyReplicas: 1,
				},
			},
		},
	}

	podList := &corev1.PodList{
		Items: []corev1.Pod{
			{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "nginx-deployment-gw-67d47f7585-tjq7k",
					Namespace: "default",
					UID:       types.UID("uid-pod-1"),
					Labels:    map[string]string{"app": "nginx-gw"},
					OwnerReferences: []metav1.OwnerReference{
						{UID: types.UID("uid-rs-1"), Kind: "ReplicaSet", Name: "nginx-deployment-gw-67d47f7585"},
					},
				},
				Status: corev1.PodStatus{Phase: corev1.PodRunning},
			},
		},
	}

	svcList := &corev1.ServiceList{
		Items: []corev1.Service{
			{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "nginx-service-gw",
					Namespace: "default",
				},
				Spec: corev1.ServiceSpec{
					Type:     corev1.ServiceTypeNodePort,
					Selector: map[string]string{"app": "nginx-gw"},
					Ports:    []corev1.ServicePort{{Port: 80, Protocol: corev1.ProtocolTCP}},
				},
			},
		},
	}

	gwList := &k8sGatewayList{
		APIVersion: "gateway.networking.k8s.io/v1",
		Items: []k8sGateway{
			{
				Metadata: metav1.ObjectMeta{
					Name:      "external-gateway",
					Namespace: "default",
				},
			},
		},
	}
	gwList.Items[0].Spec.GatewayClassName = "gke-l7-gxlb"

	routeList := &k8sHTTPRouteList{
		APIVersion: "gateway.networking.k8s.io/v1",
		Items: []k8sHTTPRoute{
			{
				Metadata: metav1.ObjectMeta{
					Name:      "nginx-external-route",
					Namespace: "default",
				},
			},
		},
	}
	routeList.Items[0].Spec.Hostnames = []string{"iap-gw.demo.gke.ninja"}
	routeList.Items[0].Spec.ParentRefs = append(routeList.Items[0].Spec.ParentRefs, struct {
		Group     *string `json:"group,omitempty"`
		Kind      *string `json:"kind,omitempty"`
		Namespace *string `json:"namespace,omitempty"`
		Name      string  `json:"name"`
	}{
		Kind: &gwKind,
		Name: "external-gateway",
	})
	routeList.Items[0].Spec.Rules = append(routeList.Items[0].Spec.Rules, struct {
		BackendRefs []struct {
			Group     *string `json:"group,omitempty"`
			Kind      *string `json:"kind,omitempty"`
			Namespace *string `json:"namespace,omitempty"`
			Name      string  `json:"name"`
			Port      *int32  `json:"port,omitempty"`
		} `json:"backendRefs"`
	}{
		BackendRefs: []struct {
			Group     *string `json:"group,omitempty"`
			Kind      *string `json:"kind,omitempty"`
			Namespace *string `json:"namespace,omitempty"`
			Name      string  `json:"name"`
			Port      *int32  `json:"port,omitempty"`
		}{
			{Name: "nginx-service-gw", Port: &port80},
		},
	})

	namespaces := buildNamespacesFromTypedLists(
		"ap-iap-testing",
		podList,
		depList,
		rsList,
		nil,
		nil,
		svcList,
		nil,
		gwList,
		routeList,
	)

	if len(namespaces) != 1 {
		t.Fatalf("expected 1 namespace, got %d", len(namespaces))
	}
	ns := namespaces[0]
	resMap := make(map[string]api.K8sResource)
	for _, r := range ns.Resources {
		resMap[r.ID] = r
	}

	gwID := "gw-ap-iap-testing-default-external-gateway"
	routeID := "route-ap-iap-testing-default-nginx-external-route"
	svcID := "svc-ap-iap-testing-default-nginx-service-gw"
	depID := "dep-ap-iap-testing-default-nginx-deployment-gw"

	gw, ok := resMap[gwID]
	if !ok {
		t.Fatalf("missing Gateway %s in resources", gwID)
	}
	if len(gw.ChildrenIDs) != 1 || gw.ChildrenIDs[0] != routeID {
		t.Errorf("expected Gateway child %s, got %v", routeID, gw.ChildrenIDs)
	}

	route, ok := resMap[routeID]
	if !ok {
		t.Fatalf("missing HTTPRoute %s in resources", routeID)
	}
	if route.OwnerID != gwID {
		t.Errorf("expected HTTPRoute owner %s, got %s", gwID, route.OwnerID)
	}
	if len(route.ChildrenIDs) != 1 || route.ChildrenIDs[0] != svcID {
		t.Errorf("expected HTTPRoute child %s, got %v", svcID, route.ChildrenIDs)
	}

	svc, ok := resMap[svcID]
	if !ok {
		t.Fatalf("missing Service %s in resources", svcID)
	}
	if svc.OwnerID != routeID {
		t.Errorf("expected Service owner %s, got %s", routeID, svc.OwnerID)
	}
	if len(svc.ChildrenIDs) != 1 || svc.ChildrenIDs[0] != depID {
		t.Errorf("expected Service child %s, got %v", depID, svc.ChildrenIDs)
	}
}
