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
)

// ClientMessage is sent from the browser client over WebSocket.
type ClientMessage struct {
	Type           ClientMessageType `json:"type"`
	SelectedNodeID string            `json:"selected_node_id,omitempty"`
	ResourceURI    string            `json:"resource_uri,omitempty"`
	Prompt         string            `json:"prompt,omitempty"`
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

// NamespaceNode represents a namespace grouping pods in the 3D topology.
type NamespaceNode struct {
	Name string    `json:"name"`
	Pods []PodNode `json:"pods"`
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
	Clusters []ClusterNode `json:"clusters"`
}

// LogEntry represents an individual log line with severity and timestamp.
type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Severity  string `json:"severity"` // INFO, WARNING, ERROR, FATAL
	Message   string `json:"message"`
	Source    string `json:"source"`
}

// TelemetryData contains metrics and logs for an active resource.
type TelemetryData struct {
	ResourceURI string            `json:"resource_uri"`
	PodID       string            `json:"pod_id"`
	Metrics     map[string]string `json:"metrics"`
	Logs        []LogEntry        `json:"logs"`
}

// UIComponentData contains compiled ArrowJS template code and bound telemetry.
type UIComponentData struct {
	ResourceURI string         `json:"resource_uri"`
	Prompt      string         `json:"prompt"`
	Code        string         `json:"code"`
	Telemetry   *TelemetryData `json:"telemetry"`
}
