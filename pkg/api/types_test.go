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

package api

import (
	"encoding/json"
	"testing"
)

func TestClientMessageSerialization(t *testing.T) {
	msg := ClientMessage{
		Type:           MsgTypePrompt,
		SelectedNodeID: "pod-payment-123",
		ResourceURI:    "gke://production/payment-service",
		Prompt:         "Why is this crashing?",
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ClientMessage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Type != MsgTypePrompt {
		t.Errorf("expected type %s, got %s", MsgTypePrompt, decoded.Type)
	}
	if decoded.SelectedNodeID != msg.SelectedNodeID {
		t.Errorf("expected node ID %s, got %s", msg.SelectedNodeID, decoded.SelectedNodeID)
	}
	if decoded.Prompt != msg.Prompt {
		t.Errorf("expected prompt %s, got %s", msg.Prompt, decoded.Prompt)
	}
}

func TestServerMessageSerialization(t *testing.T) {
	msg := ServerMessage{
		Type:    MsgTypeTopology,
		Message: "ready",
		Topology: &TopologyData{
			Clusters: []ClusterNode{
				{
					Name:      "test-cluster",
					ProjectID: "test-project",
					Location:  "us-central1",
					Namespaces: []NamespaceNode{
						{
							Name: "default",
							Pods: []PodNode{
								{
									ID:        "pod-1",
									Name:      "frontend",
									Namespace: "default",
									Status:    StatusRunning,
								},
							},
						},
					},
				},
			},
		},
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ServerMessage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Type != MsgTypeTopology {
		t.Errorf("expected type %s, got %s", MsgTypeTopology, decoded.Type)
	}
	if decoded.Topology == nil || len(decoded.Topology.Clusters) != 1 {
		t.Fatalf("expected 1 cluster in topology, got %+v", decoded.Topology)
	}
	if decoded.Topology.Clusters[0].Namespaces[0].Pods[0].Status != StatusRunning {
		t.Errorf("expected pod status Running, got %s", decoded.Topology.Clusters[0].Namespaces[0].Pods[0].Status)
	}
}
