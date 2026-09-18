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

    // Verify inner container hexagon (radialSegments: 6, 50% reduced compact height)
    expect(runningPod.geometry.parameters.radialSegments).toBe(6);
    expect(runningPod.geometry.parameters.height).toBeCloseTo(0.34 * 0.72, 2);

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

  it('highlights connected pods and conduits in amber on highlightBlastRadius and restores on clearBlastRadius', () => {
    activeTopology.clusters[0].namespaces[0].pods.push({
      id: 'pod-cart',
      name: 'cart-service',
      status: 'Running',
    });
    topology.build(activeTopology);

    // Initial state: blastRadiusPods is empty
    expect(topology.blastRadiusPods.size).toBe(0);

    // Call highlightBlastRadius on payment-service
    topology.highlightBlastRadius('payment-service');

    // Conduits connected to payment-service should be highlighted amber (0xfbbc04)
    expect(topology.blastRadiusConduits.size).toBeGreaterThan(0);
    for (const conduit of topology.blastRadiusConduits) {
      expect(conduit.line.material.color.getHex()).toBe(0xfbbc04);
    }

    // Connected caller (cart-service) should be highlighted in blastRadiusPods
    expect(topology.blastRadiusPods.size).toBeGreaterThan(0);

    // Clear blast radius
    topology.clearBlastRadius();
    expect(topology.blastRadiusPods.size).toBe(0);
    expect(topology.blastRadiusConduits.size).toBe(0);
  });

  it('adjusts conduit flow and opacity on setTrafficDrain', () => {
    activeTopology.clusters[0].namespaces[0].pods.push({
      id: 'pod-cart',
      name: 'cart-service',
      status: 'Running',
    });
    topology.build(activeTopology);

    topology.setTrafficDrain('payment-service', 20);
    expect(topology.trafficDrainMap.get('payment-service')).toBe(20);

    const conduits = topology.podConduits.get('payment-service');
    expect(conduits).toBeDefined();
    expect(conduits.length).toBeGreaterThan(0);
    expect(conduits[0].flowSpeedFactor).toBeCloseTo(0.2, 1);
    expect(conduits[0].line.material.opacity).toBeLessThan(0.5);

    // Drain to 0%
    topology.setTrafficDrain('payment-service', 0);
    expect(topology.trafficDrainMap.get('payment-service')).toBe(0);
    expect(conduits[0].flowSpeedFactor).toBe(0);
  });

  it('renders and rotates a 3D selection targeting reticle around selected pod and clears it cleanly', () => {
    topology.build(activeTopology);
    expect(topology.selectionReticle).toBeNull();

    // Select crashing payment-service pod
    topology.setSelectedPod('payment-service');
    expect(topology.selectionReticle).toBeDefined();
    expect(topology.selectionReticle).not.toBeNull();
    expect(topology.selectedPodMesh).toBeDefined();
    expect(topology.selectedPodMesh.userData.pod.name).toBe('payment-service');

    // Outer ring should be Google Red (0xea4335) for crashing pod
    const outerRing = topology.selectionReticle.children[0];
    expect(outerRing.material.color.getHex()).toBe(0xea4335);

    // Update should rotate the reticle
    topology.update(1000);
    expect(topology.selectionReticle.rotation.z).toBeCloseTo(1.8, 1);

    // Clear selection
    topology.clearSelectedPod();
    expect(topology.selectionReticle).toBeNull();
    expect(topology.selectedPodMesh).toBeNull();
  });

  it('renders stratified 3D Kubernetes resources (Deployment, ReplicaSet, Gateway) and connects them with ownership beams', () => {
    activeTopology.clusters[0].namespaces[0].resources = [
      {
        id: 'rs-payment-84f7b6',
        kind: 'ReplicaSet',
        name: 'payment-service-84f7b6',
        status: 'Degraded',
        owner_id: 'deploy-payment',
        children_ids: ['payment-service'],
      },
      {
        id: 'deploy-payment',
        kind: 'Deployment',
        name: 'payment-service',
        status: 'Degraded',
        children_ids: ['rs-payment-84f7b6'],
      },
      {
        id: 'gw-ingress',
        kind: 'Gateway',
        name: 'prod-ingress-gw',
        status: 'Healthy',
      },
    ];

    topology.build(activeTopology);

    expect(topology.resourceMeshes.length).toBe(3);
    expect(topology.ownershipBeams.length).toBe(2);

    const stats = topology.getPerformanceStats();
    expect(stats.totalObjects).toBe(6); // 3 pods + 3 resources

    // Layer filter: 'pods' hides controllers
    topology.setLayerFilter('pods');
    const rsMesh = topology.resourceMap.get('rs-payment-84f7b6');
    expect(rsMesh.userData.podGroup.visible).toBe(false);

    // Layer filter: 'hierarchy' shows ReplicaSet/Deployment but hides Gateway
    topology.setLayerFilter('hierarchy');
    expect(rsMesh.userData.podGroup.visible).toBe(true);
    const gwMesh = topology.resourceMap.get('gw-ingress');
    expect(gwMesh.userData.podGroup.visible).toBe(false);

    // Highlight ownership chain when selecting Deployment
    topology.setLayerFilter('all');
    topology.highlightOwnershipChain('deploy-payment');
    const activeBeam = topology.ownershipBeams.find((b) => b.parentId === 'deploy-payment');
    expect(activeBeam.line.material.opacity).toBe(0.95);
  });

  it('supports hover-trouble default mode, pointer flyover chain reveal, close-up zoom reveal, and compact billboard world scale', () => {
    activeTopology.clusters[0].namespaces[0].resources = [
      {
        id: 'rs-frontend',
        kind: 'ReplicaSet',
        name: 'frontend-rs',
        status: 'Healthy',
        children_ids: ['frontend'],
      },
    ];
    topology.build(activeTopology);

    const rsMesh = topology.resourceMap.get('rs-frontend');
    const runningPod = topology
      .getInteractiveObjects()
      .find((m) => m.userData.pod.name === 'frontend');
    const crashPod = topology.getInteractiveObjects().find((m) => m.userData.isCrashLoop);

    // Compact billboard height (~0.25 world units)
    expect(rsMesh.userData.nameSprite.scale.y).toBeCloseTo(0.25, 2);

    // Default mode is 'hover-trouble': healthy Pod and ReplicaSet labels are hidden at overview distance, while crashing pod label is visible
    expect(topology.labelMode).toBe('hover-trouble');
    expect(runningPod.userData.nameSprite.visible).toBe(false);
    expect(rsMesh.userData.nameSprite.visible).toBe(false);
    expect(crashPod.userData.nameSprite.visible).toBe(true);

    // Pointer flyover (hover) on ReplicaSet immediately reveals both RS and its owned Pod in the chain
    topology.setHoveredNode(rsMesh.userData);
    expect(rsMesh.userData.nameSprite.visible).toBe(true);
    expect(runningPod.userData.nameSprite.visible).toBe(true);

    // Unhover hides healthy labels again
    topology.setHoveredNode(null);
    expect(rsMesh.userData.nameSprite.visible).toBe(false);
    expect(runningPod.userData.nameSprite.visible).toBe(false);

    // Zooming camera close (< 18 world units) automatically reveals nearby healthy labels
    const closeCamera = new THREE.PerspectiveCamera();
    closeCamera.position
      .copy(runningPod.userData.podGroup.position)
      .add(new THREE.Vector3(0, 5, 8));
    topology.update(1000, closeCamera);
    expect(runningPod.userData.nameSprite.visible).toBe(true);

    // Moving camera back to overview hides healthy labels again in hover-trouble mode
    const farCamera = new THREE.PerspectiveCamera();
    farCamera.position.set(0, 40, 65);
    topology.update(1000, farCamera);
    expect(runningPod.userData.nameSprite.visible).toBe(false);

    // In 'all' mode, all labels within LOD become visible
    topology.setLabelMode('all');
    expect(rsMesh.userData.nameSprite.visible).toBe(true);

    // In 'off' mode, all node labels (even crashing) are hidden unless hovered
    topology.setLabelMode('off');
    expect(crashPod.userData.nameSprite.visible).toBe(false);
    topology.setHoveredNode(crashPod.userData);
    expect(crashPod.userData.nameSprite.visible).toBe(true);
  });

  it('attaches official K8s SVG icon emblems to Pods and Controllers and tracks 4 semantic zoom bands', () => {
    activeTopology.clusters[0].namespaces[0].resources = [
      {
        id: 'deploy-frontend',
        kind: 'Deployment',
        name: 'frontend-deploy',
        status: 'Healthy',
        children_ids: ['rs-frontend'],
      },
      {
        id: 'rs-frontend',
        kind: 'ReplicaSet',
        name: 'frontend-rs',
        status: 'Healthy',
        children_ids: ['frontend'],
      },
      {
        id: 'svc-frontend',
        kind: 'Service',
        name: 'frontend-svc',
        status: 'Healthy',
        connected_to: ['frontend'],
      },
      {
        id: 'gw-frontend',
        kind: 'Gateway',
        name: 'frontend-gw',
        status: 'Healthy',
        connected_to: ['svc-frontend'],
      },
    ];
    topology.build(activeTopology);

    const runningPod = topology
      .getInteractiveObjects()
      .find((m) => m.userData.pod.name === 'frontend');
    const deployMesh = topology.resourceMap.get('deploy-frontend');
    const rsMesh = topology.resourceMap.get('rs-frontend');
    const svcMesh = topology.resourceMap.get('svc-frontend');
    const gwMesh = topology.resourceMap.get('gw-frontend');
    const clusterMonolith = topology.clusterMonoliths[0];

    // Cluster monolith has official control-plane.svg Top-Cap + Front-Face medallions
    expect(clusterMonolith.userData.topMedallion).toBeDefined();
    expect(clusterMonolith.userData.topMedallion.userData.isTopMedallion).toBe(true);
    expect(clusterMonolith.userData.frontMedallion).toBeDefined();
    expect(clusterMonolith.userData.frontMedallion.userData.isFrontMedallion).toBe(true);

    // Every Pod and Controller has both Top-Cap and Front-Face K8s SVG medallions attached
    expect(runningPod.userData.topMedallion).toBeDefined();
    expect(runningPod.userData.frontMedallion).toBeDefined();
    expect(runningPod.userData.iconEmblem.userData.isFrontMedallion).toBe(true);
    expect(deployMesh.userData.topMedallion).toBeDefined();
    expect(deployMesh.userData.frontMedallion).toBeDefined();
    expect(rsMesh.userData.topMedallion).toBeDefined();
    expect(rsMesh.userData.frontMedallion).toBeDefined();
    expect(svcMesh.userData.topMedallion).toBeDefined();
    expect(gwMesh.userData.topMedallion).toBeDefined();
    expect(topology.iconSprites.length).toBeGreaterThanOrEqual(12);

    // Verify 4 semantic zoom bands (Macro > 75, Cluster 35-75, Namespace 18-35, Micro <= 18)
    const cam = new THREE.PerspectiveCamera();

    cam.position.set(0, 60, 65); // dist ~88.4 -> Macro
    topology.update(1000, cam);
    expect(topology.getPerformanceStats().zoomBand).toBe('Macro');

    cam.position.set(0, 30, 40); // dist = 50 -> Cluster
    topology.update(1000, cam);
    expect(topology.getPerformanceStats().zoomBand).toBe('Cluster');

    cam.position.set(0, 15, 20); // dist = 25 -> Namespace
    topology.update(1000, cam);
    expect(topology.getPerformanceStats().zoomBand).toBe('Namespace');

    cam.position.set(0, 8, 10); // dist ~12.8 -> Micro
    topology.update(1000, cam);
    expect(topology.getPerformanceStats().zoomBand).toBe('Micro');
  });
});
