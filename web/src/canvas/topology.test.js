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

  let activeTopology;

  beforeEach(() => {
    scene = new THREE.Scene();
    topology = new TopologyMesh(scene);
    activeTopology = JSON.parse(JSON.stringify(mockTopology));
  });

  it('builds cluster core, namespaces, and pod meshes', () => {
    topology.build(activeTopology);

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
    topology.build(activeTopology);
    expect(() => topology.update(1000)).not.toThrow();
    expect(() => topology.update(2000)).not.toThrow();
  });

  it('clears all meshes and resets state', () => {
    topology.build(activeTopology);
    expect(topology.getInteractiveObjects().length).toBe(3);

    topology.clear();
    expect(topology.getInteractiveObjects().length).toBe(0);
    expect(topology.group.children.length).toBe(0);
  });

  it('supports multi-cluster topology layout and positions', () => {
    const multiCluster = {
      clusters: [
        {
          name: 'prod-cluster',
          namespaces: [{ name: 'prod', pods: [{ name: 'api', status: 'Running' }] }],
        },
        {
          name: 'stage-cluster',
          namespaces: [{ name: 'stage', pods: [{ name: 'web', status: 'Running' }] }],
        },
      ],
    };

    topology.build(multiCluster);
    expect(topology.getInteractiveObjects().length).toBe(2);

    const prodPos = topology.getClusterPosition('prod-cluster');
    const stagePos = topology.getClusterPosition('stage-cluster');
    expect(prodPos).toBeDefined();
    expect(stagePos).toBeDefined();
    expect(prodPos.equals(stagePos)).toBe(false);
  });

  it('remediates a pod and updates status to Running, transitioning cluster and namespace alert labels', () => {
    topology.build(activeTopology);
    const crashPod = topology.getInteractiveObjects().find((m) => m.userData.isCrashLoop);
    expect(crashPod).toBeDefined();

    // Check pre-remediation cluster and namespace alert state
    const clusterSlit = topology.clusterSlits.get('test-cluster');
    expect(clusterSlit).toBeDefined();
    expect(clusterSlit.material.color.getHex()).toBe(0xea4335);

    const nsEntry = topology.namespacePlaques.get('test-cluster/production');
    expect(nsEntry).toBeDefined();
    expect(nsEntry.rimLine.material.color.getHex()).toBe(0xea4335);

    topology.remediatePod('payment-service', 'Running');
    expect(crashPod.userData.isCrashLoop).toBe(false);
    expect(crashPod.userData.pod.status).toBe('Running');

    // Verify cluster LED slit transitioned to Google Green (0x34a853)
    expect(clusterSlit.material.color.getHex()).toBe(0x34a853);
    expect(clusterSlit.material.emissive.getHex()).toBe(0x34a853);

    // Verify namespace rim line transitioned to Google Blue (0x4285f4)
    expect(nsEntry.rimLine.material.color.getHex()).toBe(0x4285f4);

    // Verify cluster plaque sprite was recreated
    const clusterPlaque = topology.clusterPlaques.get('test-cluster');
    expect(clusterPlaque).toBeDefined();
    expect(clusterPlaque.sprite).toBeDefined();
  });

  it('renders canonical 3D Kubernetes Pod shapes (hexagon container + heptagon boundary) and Google status colors', () => {
    topology.build(activeTopology);
    const pods = topology.getInteractiveObjects();
    const runningPod = pods.find((m) => m.userData.pod.name === 'frontend');
    const crashPod = pods.find((m) => m.userData.pod.name === 'payment-service');

    // Verify inner container hexagon (radialSegments: 6)
    expect(runningPod.geometry.parameters.radialSegments).toBe(6);
    expect(runningPod.geometry.parameters.height).toBe(1.1);

    // Verify outer pod boundary heptagon (radialSegments: 7)
    expect(runningPod.userData.podBoundary).toBeDefined();
    expect(runningPod.userData.podBoundary.geometry).toBeDefined();

    // Verify authentic Google/K8s status colors: Green 0x34a853 and Red 0xea4335
    expect(runningPod.userData.baseColor).toBe(0x34a853);
    expect(crashPod.userData.baseColor).toBe(0xea4335);
  });

  it('renders vibrant billboard sprites matching HUD status colors with sRGB, disabled tone mapping, and disabled fog', () => {
    topology.build(activeTopology);
    const pods = topology.getInteractiveObjects();
    const crashPod = pods.find((m) => m.userData.pod.name === 'payment-service');

    expect(crashPod.userData.nameSprite).toBeDefined();
    const mat = crashPod.userData.nameSprite.material;
    expect(mat.toneMapped).toBe(false);
    expect(mat.fog).toBe(false);
    expect(mat.map.colorSpace).toBe(THREE.SRGBColorSpace);

    const oldSprite = crashPod.userData.nameSprite;
    topology.remediatePod('payment-service', 'Running');
    expect(crashPod.userData.nameSprite).toBeDefined();
    expect(crashPod.userData.nameSprite).not.toBe(oldSprite);
  });
});
