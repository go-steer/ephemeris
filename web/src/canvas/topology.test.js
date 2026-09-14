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

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TopologyMesh } from './topology.js';

describe('TopologyMesh', () => {
  let scene;
  let topology;

  const mockTopology = {
    clusters: [
      {
        name: 'test-cluster',
        location: 'us-central1',
        namespaces: [
          {
            name: 'production',
            pods: [
              {
                id: 'pod-frontend',
                name: 'frontend',
                status: 'Running',
              },
              {
                id: 'pod-payment',
                name: 'payment-service',
                status: 'CrashLoopBackOff',
              },
            ],
          },
          {
            name: 'kube-system',
            pods: [
              {
                id: 'pod-coredns',
                name: 'coredns',
                status: 'Running',
              },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    scene = new THREE.Scene();
    topology = new TopologyMesh(scene);
  });

  it('builds cluster core, namespaces, and pod meshes', () => {
    topology.build(mockTopology);

    const interactive = topology.getInteractiveObjects();
    expect(interactive.length).toBe(3);

    // Find failing pod
    const crashPod = interactive.find((m) => m.userData.isCrashLoop);
    expect(crashPod).toBeDefined();
    expect(crashPod.userData.pod.name).toBe('payment-service');
    expect(crashPod.userData.pod.status).toBe('CrashLoopBackOff');

    // Find running pod
    const runningPod = interactive.find((m) => m.userData.pod.name === 'frontend');
    expect(runningPod).toBeDefined();
    expect(runningPod.userData.isCrashLoop).toBe(false);
  });

  it('updates animation loop without errors', () => {
    topology.build(mockTopology);
    expect(() => topology.update(1000)).not.toThrow();
    expect(() => topology.update(2000)).not.toThrow();
  });

  it('clears all meshes and resets state', () => {
    topology.build(mockTopology);
    expect(topology.getInteractiveObjects().length).toBe(3);

    topology.clear();
    expect(topology.getInteractiveObjects().length).toBe(0);
    expect(topology.group.children.length).toBe(0);
  });
});
