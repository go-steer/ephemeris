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

// Package api defines the WebSocket message protocol and domain models
// for ephemeris.
package api

// ClientMessageType represents incoming messages from the browser client.
type ClientMessageType string

const (
	// MsgTypeInit requests initial cluster topology on client connect.
	MsgTypeInit ClientMessageType = "init"
	// MsgTypeSelectNode updates the currently focused resource in the 3D scene.
	MsgTypeSelectNode ClientMessageType = "select_node"
	// MsgTypePrompt submits an SRE natural language triage prompt.
	MsgTypePrompt ClientMessageType = "prompt"
	// MsgTypeRemediate executes a stateful remediation action on a target workload.
	MsgTypeRemediate ClientMessageType = "remediate"
	// MsgTypeScenario switches the active cluster chaos incident scenario.
	MsgTypeScenario ClientMessageType = "scenario"
)

// ClientMessage is sent from the browser client over WebSocket.
type ClientMessage struct {
	Type              ClientMessageType `json:"type"`
	SelectedNodeID    string            `json:"selected_node_id,omitempty"`
	ResourceURI       string            `json:"resource_uri,omitempty"`
	Prompt            string            `json:"prompt,omitempty"`
	ScenarioID        string            `json:"scenario_id,omitempty"`
	RemediationAction string            `json:"remediation_action,omitempty"`
}

// ServerMessageType represents messages pushed to the browser client.
type ServerMessageType string

const (
	// MsgTypeTopology delivers the hierarchical GKE cluster mesh.
	MsgTypeTopology ServerMessageType = "topology"
	// MsgTypeStatus reports progress updates (e.g. fetching telemetry, compiling UI).
	MsgTypeStatus ServerMessageType = "status"
	// MsgTypeTelemetry delivers telemetry logs and metrics for a resource.
	MsgTypeTelemetry ServerMessageType = "telemetry"
	// MsgTypeUIComponent delivers compiled ArrowJS template code and bound data.
	MsgTypeUIComponent ServerMessageType = "ui_component"
	// MsgTypeError reports errors to the user.
	MsgTypeError ServerMessageType = "error"
)

// ServerMessage is pushed from the orchestrator over WebSocket.
type ServerMessage struct {
	Type      ServerMessageType `json:"type"`
	Message   string            `json:"message,omitempty"`
	Topology  *TopologyData     `json:"topology,omitempty"`
	Telemetry *TelemetryData    `json:"telemetry,omitempty"`
	UI        *UIComponentData  `json:"ui,omitempty"`
}

// NodeStatus represents the operational state of a Kubernetes pod.
type NodeStatus string

const (
	StatusRunning NodeStatus = "Running"
	StatusError   NodeStatus = "CrashLoopBackOff"
	StatusPending NodeStatus = "Pending"
)

// PodNode represents a pod in the 3D topology.
type PodNode struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Namespace    string            `json:"namespace"`
	Cluster      string            `json:"cluster"`
	Status       NodeStatus        `json:"status"`
	Restarts     int               `json:"restarts"`
	CPUUsage     string            `json:"cpu_usage"`
	MemoryUsage  string            `json:"memory_usage"`
	Dependencies []string          `json:"dependencies"`
	Labels       map[string]string `json:"labels"`
}

// K8sResource represents a Kubernetes core controller object (Deployment, Service, Gateway, HTTPRoute, StatefulSet) or Custom Resource Definition (CRD).
type K8sResource struct {
	ID          string   `json:"id"`
	Kind        string   `json:"kind"`        // Deployment, Service, Gateway, HTTPRoute, StatefulSet, SparkApplication, RayCluster
	APIVersion  string   `json:"api_version"` // e.g. apps/v1, gateway.networking.k8s.io/v1, sparkoperator.k8s.io/v1beta2
	Name        string   `json:"name"`
	Namespace   string   `json:"namespace"`
	Cluster     string   `json:"cluster"`
	Status      string   `json:"status"`             // Healthy, Progressing, Degraded, CrashLoopBackOff
	Replicas    string   `json:"replicas,omitempty"` // e.g. "3/3", "0/1"
	IsCRD       bool     `json:"is_crd,omitempty"`   // true if CustomResourceDefinition
	Summary     string   `json:"summary"`
	ConnectedTo []string `json:"connected_to,omitempty"`
}

// NamespaceNode represents a namespace grouping pods and K8s/CRD resources in the 3D topology.
type NamespaceNode struct {
	Name      string        `json:"name"`
	Pods      []PodNode     `json:"pods"`
	Resources []K8sResource `json:"resources,omitempty"`
}

// ClusterNode represents a GKE cluster root node.
type ClusterNode struct {
	Name       string          `json:"name"`
	ProjectID  string          `json:"project_id"`
	Location   string          `json:"location"`
	Namespaces []NamespaceNode `json:"namespaces"`
}

// TopologyData contains the full cluster hierarchy.
type TopologyData struct {
	ScenarioID string        `json:"scenario_id,omitempty"`
	Clusters   []ClusterNode `json:"clusters"`
}

// LogEntry represents an individual log line with severity and timestamp.
type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Severity  string `json:"severity"` // INFO, WARNING, ERROR, FATAL
	Message   string `json:"message"`
	Source    string `json:"source"`
}

// LookoutFinding represents a token-dense, secret-sanitized diagnostic finding from go-steer/k8s-lookout.
type LookoutFinding struct {
	Kind        string `json:"kind"`         // e.g. "crashloopbackoff", "oom_killed", "quota_exceeded", "upstream_503"
	Severity    string `json:"severity"`     // "critical", "warning", "info"
	Fingerprint string `json:"fingerprint"`  // e.g. "lk8s-9f8a32b1"
	Resource    string `json:"resource"`     // e.g. "pod/payment-service"
	Namespace   string `json:"namespace"`    // e.g. "production"
	Summary     string `json:"summary"`      // Secret-sanitized finding summary
	CheckSource string `json:"check_source"` // e.g. "lookout_triage", "lookout_events", "lookout_top"
}

// TelemetryData contains metrics, logs, and k8s-lookout diagnostic findings for an active resource.
type TelemetryData struct {
	ResourceURI     string            `json:"resource_uri"`
	PodID           string            `json:"pod_id"`
	Metrics         map[string]string `json:"metrics"`
	Logs            []LogEntry        `json:"logs"`
	LookoutFindings []LookoutFinding  `json:"lookout_findings,omitempty"`
	LookoutEnvelope string            `json:"lookout_envelope,omitempty"`
	Topology        *TopologyData     `json:"topology,omitempty"`
}

// UIComponentData contains compiled ArrowJS template code and bound telemetry.
type UIComponentData struct {
	ResourceURI     string         `json:"resource_uri"`
	Prompt          string         `json:"prompt"`
	Archetype       string         `json:"archetype,omitempty"`
	TargetCluster   string         `json:"target_cluster,omitempty"`
	TargetNamespace string         `json:"target_namespace,omitempty"`
	TargetPod       string         `json:"target_pod,omitempty"`
	Code            string         `json:"code"`
	Telemetry       *TelemetryData `json:"telemetry"`
}
