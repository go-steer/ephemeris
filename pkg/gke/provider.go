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

// Package gke provides Kubernetes cluster topology discovery and querying.
package gke

import (
	"context"

	"github.com/go-steer/ephemeris/pkg/api"
)

// Provider abstracts GKE topology discovery across mock and MCP backends.
type Provider interface {
	// GetTopology returns the cluster, namespace, and pod hierarchy.
	GetTopology(ctx context.Context) (*api.TopologyData, error)

	// GetPodDetails retrieves details for a specific pod by its resource URI.
	GetPodDetails(ctx context.Context, resourceURI string) (*api.PodNode, error)
}
