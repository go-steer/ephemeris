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

import * as THREE from 'three';

// Google Cloud & Kubernetes standard status color tokens
const STATUS_COLORS = {
  Running: { color: 0x34a853, emissive: 0x137333, text: '#34a853' },
  CrashLoopBackOff: { color: 0xea4335, emissive: 0xd93025, text: '#ea4335' },
  Pending: { color: 0xfbbc04, emissive: 0xf9ab00, text: '#fbbc04' },
  Failed: { color: 0xea4335, emissive: 0xd93025, text: '#ea4335' },
  Unknown: { color: 0x9aa0a6, emissive: 0x5f6368, text: '#9aa0a6' },
};

/**
 * Creates a crisp billboard text sprite formatted in Google Cloud / K8s typography.
 * Dynamically sizes the canvas to eliminate text overflow and clipping.
 */
function createTextSprite(text, color = '#e8eaed', fontSize = 16, badge = '') {
  const displayText = badge ? `${text}  •  ${badge}` : text;

  // Use a measurement canvas
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) return new THREE.Object3D();

  measureCtx.font = `600 ${fontSize}px "Google Sans", Roboto, -apple-system, BlinkMacSystemFont, monospace`;
  const textWidth = measureCtx.measureText(displayText).width;

  const padX = 16;
  const padY = 7;
  const canvasWidth = Math.max(128, Math.ceil(textWidth + padX * 2));
  const canvasHeight = Math.ceil(fontSize + padY * 2);

  // Render on high-DPR canvas for razor-sharp text
  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth * dpr;
  canvas.height = canvasHeight * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Object3D();

  if (typeof ctx.scale === 'function') {
    ctx.scale(dpr, dpr);
  }

  // Background pill in Google Cloud dark surface
  ctx.fillStyle = 'rgba(32, 33, 36, 0.92)';
  ctx.beginPath();
  ctx.roundRect(1, 1, canvasWidth - 2, canvasHeight - 2, 5);
  ctx.fill();

  // Subtle border hairline matching status or K8s blue
  const isRed = color === '#ea4335' || color === '#f28b82';
  const isGreen = color === '#34a853' || color === '#81c995';
  const isYellow = color === '#fbbc04' || color === '#fdd663';
  ctx.strokeStyle = isRed
    ? 'rgba(234, 67, 53, 0.85)'
    : isGreen
      ? 'rgba(52, 168, 83, 0.85)'
      : isYellow
        ? 'rgba(251, 188, 4, 0.85)'
        : 'rgba(50, 108, 229, 0.7)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Draw text centered
  ctx.font = `600 ${fontSize}px "Google Sans", Roboto, -apple-system, BlinkMacSystemFont, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(displayText, canvasWidth / 2, canvasHeight / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMaterial);

  // Proportional world scale
  const worldHeight = fontSize >= 18 ? 0.85 : 0.6;
  const worldWidth = worldHeight * (canvasWidth / canvasHeight);
  sprite.scale.set(worldWidth, worldHeight, 1);
  return sprite;
}

/**
 * TopologyMesh renders the multi-cluster architectural 3D graph of GKE infrastructure.
 */
export class TopologyMesh {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.podMeshes = [];
    this.crashPods = [];
    this.clusterMonoliths = [];
    this.curveParticles = [];
    this.podMap = new Map(); // pod.id / name -> podMesh
    this.clusterPositions = new Map(); // cluster.name -> Vector3
  }

  /**
   * Build the 3D multi-cluster architectural topology from cluster hierarchy.
   * @param {object} topologyData
   */
  build(topologyData) {
    this.clear();

    if (!topologyData || !topologyData.clusters || topologyData.clusters.length === 0) {
      return;
    }

    const clusters = topologyData.clusters;
    const clusterCount = clusters.length;

    clusters.forEach((cluster, idx) => {
      // Position multiple clusters spatially across the grid
      let cx = 0;
      let cz = 0;
      if (clusterCount > 1) {
        if (idx === 0) {
          cx = 0;
          cz = 0;
        } else {
          const angle = ((idx - 1) / (clusterCount - 1)) * Math.PI + Math.PI / 6;
          const dist = 48;
          cx = Math.cos(angle) * dist;
          cz = Math.sin(angle) * dist;
        }
      }

      const clusterPos = new THREE.Vector3(cx, 0, cz);
      this.clusterPositions.set(cluster.name, clusterPos);

      this._buildClusterPlatform(cluster, clusterPos);
      this._buildNamespacesAndPods(cluster, clusterPos);
    });

    this._buildDependencyCurves();
  }

  _buildClusterPlatform(cluster, center) {
    const clusterGroup = new THREE.Group();
    clusterGroup.position.copy(center);

    // 1. Base Hexagonal Pedestal (Tiered architectural slab in Google Cloud Console Slate)
    const platformGeo = new THREE.CylinderGeometry(15, 16, 0.8, 6);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x2d3139,
      roughness: 0.65,
      metalness: 0.35,
    });
    const platformMesh = new THREE.Mesh(platformGeo, platformMat);
    platformMesh.position.y = 0.4;
    platformMesh.receiveShadow = true;
    clusterGroup.add(platformMesh);

    // Platform upper rim loop in Kubernetes Brand Blue (#326ce5)
    const rimPoints = [];
    for (let i = 0; i <= 6; i++) {
      const theta = (i / 6) * Math.PI * 2;
      rimPoints.push(new THREE.Vector3(Math.cos(theta) * 15.05, 0.82, Math.sin(theta) * 15.05));
    }
    const rimGeo = new THREE.BufferGeometry().setFromPoints(rimPoints);
    const rimMat = new THREE.LineBasicMaterial({
      color: 0x326ce5,
      transparent: true,
      opacity: 0.85,
    });
    const rimLine = new THREE.Line(rimGeo, rimMat);
    clusterGroup.add(rimLine);

    // 2. Central Kubernetes Control Plane Master Node (Sleek totem)
    const monolithGeo = new THREE.BoxGeometry(1.4, 3.2, 1.4);
    const monolithMat = new THREE.MeshStandardMaterial({
      color: 0x326ce5,
      roughness: 0.35,
      metalness: 0.5,
    });
    const monolithMesh = new THREE.Mesh(monolithGeo, monolithMat);
    monolithMesh.position.y = 2.0;
    clusterGroup.add(monolithMesh);

    // Vertical status LED slit
    const hasCrash = (cluster.namespaces || []).some((ns) =>
      (ns.pods || []).some((p) => p.status === 'CrashLoopBackOff' || p.status === 'Failed')
    );
    const slitColor = hasCrash ? 0xea4335 : 0x4285f4;

    const slitGeo = new THREE.BoxGeometry(0.12, 2.8, 1.44);
    const slitMat = new THREE.MeshStandardMaterial({
      color: slitColor,
      emissive: slitColor,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    const slitMesh = new THREE.Mesh(slitGeo, slitMat);
    slitMesh.position.y = 2.0;
    clusterGroup.add(slitMesh);

    this.clusterMonoliths.push(monolithMesh);

    // 3. Cluster Plaque Billboard
    const statusLabel = hasCrash ? '1 ALERT' : 'HEALTHY';
    const statusTextColor = hasCrash ? '#ea4335' : '#34a853';
    const plaqueSprite = createTextSprite(cluster.name, statusTextColor, 18, statusLabel);
    plaqueSprite.position.set(0, 4.3, 0);
    clusterGroup.add(plaqueSprite);

    this.group.add(clusterGroup);
  }

  _buildNamespacesAndPods(cluster, clusterCenter) {
    const namespaces = cluster.namespaces || [];
    const nsCount = namespaces.length;
    if (nsCount === 0) return;

    // Distribute namespace zones around the cluster monolith
    namespaces.forEach((ns, nsIdx) => {
      let nx = 0;
      let nz = 0;

      if (nsCount === 1) {
        nx = 0;
        nz = 0;
      } else {
        const nsAngle = (nsIdx / nsCount) * Math.PI * 2;
        const nsDistance = 8.5;
        nx = Math.cos(nsAngle) * nsDistance;
        nz = Math.sin(nsAngle) * nsDistance;
      }

      const zoneCenter = new THREE.Vector3(
        clusterCenter.x + nx,
        clusterCenter.y,
        clusterCenter.z + nz
      );

      // Namespace territory platform zone
      const nsPadGeo = new THREE.CylinderGeometry(5.2, 5.6, 0.2, 6);
      const nsPadMat = new THREE.MeshStandardMaterial({
        color: 0x252a36,
        roughness: 0.7,
        metalness: 0.3,
      });
      const nsPadMesh = new THREE.Mesh(nsPadGeo, nsPadMat);
      nsPadMesh.position.set(zoneCenter.x, 0.9, zoneCenter.z);
      this.group.add(nsPadMesh);

      // Namespace border line (Kubernetes accent)
      const nsRimPoints = [];
      for (let i = 0; i <= 6; i++) {
        const theta = (i / 6) * Math.PI * 2;
        nsRimPoints.push(
          new THREE.Vector3(
            zoneCenter.x + Math.cos(theta) * 5.3,
            1.02,
            zoneCenter.z + Math.sin(theta) * 5.3
          )
        );
      }
      const nsRimGeo = new THREE.BufferGeometry().setFromPoints(nsRimPoints);
      const nsRimMat = new THREE.LineBasicMaterial({
        color: 0x326ce5,
        transparent: true,
        opacity: 0.65,
      });
      this.group.add(new THREE.Line(nsRimGeo, nsRimMat));

      // Namespace header sprite tag
      const nsSprite = createTextSprite(`ns: ${ns.name}`, '#9aa0a6', 14);
      nsSprite.position.set(zoneCenter.x, 1.5, zoneCenter.z - 4.4);
      this.group.add(nsSprite);

      // Pods within this namespace territory
      this._buildPodNodes(ns, zoneCenter, cluster.name);
    });
  }

  _buildPodNodes(ns, zoneCenter, clusterName) {
    const pods = ns.pods || [];
    const podCount = pods.length;
    if (podCount === 0) return;

    pods.forEach((pod, i) => {
      let px = zoneCenter.x;
      let pz = zoneCenter.z;

      if (podCount > 1) {
        const angle = (i / podCount) * Math.PI * 2;
        const radius = Math.min(3.2, 1.4 + podCount * 0.4);
        px = zoneCenter.x + Math.cos(angle) * radius;
        pz = zoneCenter.z + Math.sin(angle) * radius;
      }

      const status = pod.status || 'Running';
      const colorScheme = STATUS_COLORS[status] || STATUS_COLORS.Unknown;
      const isCrash = status === 'CrashLoopBackOff' || status === 'Failed';

      // Pod Architectural Compute Node (Proportional container + top status LED)
      const podGroup = new THREE.Group();
      podGroup.position.set(px, 1.0, pz);

      // Main container chassis in Google Cloud container slate
      const chassisGeo = new THREE.BoxGeometry(1.2, 1.4, 1.2);
      const chassisMat = new THREE.MeshStandardMaterial({
        color: 0x3c4043,
        roughness: 0.4,
        metalness: 0.45,
      });
      const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
      chassisMesh.position.y = 0.7;
      chassisMesh.castShadow = true;
      podGroup.add(chassisMesh);

      // Bevel edge highlight colored by Kubernetes/Google status
      const edgesGeo = new THREE.EdgesGeometry(chassisGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: colorScheme.color,
        transparent: true,
        opacity: isCrash ? 0.9 : 0.6,
      });
      const edges = new THREE.LineSegments(edgesGeo, edgeMat);
      edges.position.y = 0.7;
      podGroup.add(edges);

      // Top Status LED Cap
      const capGeo = new THREE.BoxGeometry(1.0, 0.2, 1.0);
      const capMat = new THREE.MeshStandardMaterial({
        color: colorScheme.color,
        emissive: colorScheme.emissive,
        emissiveIntensity: isCrash ? 1.6 : 1.0,
        roughness: 0.2,
      });
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.y = 1.45;
      podGroup.add(capMesh);

      // Pulsing alert wireframe beacon for CrashLoopBackOff
      let alertBeacon = null;
      if (isCrash) {
        const beaconGeo = new THREE.BoxGeometry(1.6, 1.8, 1.6);
        const beaconMat = new THREE.MeshBasicMaterial({
          color: 0xea4335,
          wireframe: true,
          transparent: true,
          opacity: 0.6,
        });
        alertBeacon = new THREE.Mesh(beaconGeo, beaconMat);
        alertBeacon.position.y = 0.7;
        podGroup.add(alertBeacon);
      }

      // Metadata on interactive mesh (chassisMesh is raycast target)
      chassisMesh.userData = {
        type: 'pod',
        pod: pod,
        namespaceName: ns.name,
        clusterName: clusterName,
        baseColor: colorScheme.color,
        baseEmissive: colorScheme.emissive,
        isCrashLoop: isCrash,
        podGroup: podGroup,
        capMesh: capMesh,
        edgeMesh: edges,
        alertBeacon: alertBeacon,
      };

      if (isCrash) {
        this.crashPods.push(chassisMesh);
      }

      // Pod name billboard tag
      const subtitle = pod.restarts > 0 ? `${pod.restarts} restarts` : '';
      const nameSprite = createTextSprite(pod.name, colorScheme.text, 13, subtitle);
      nameSprite.position.set(0, 2.05, 0);
      podGroup.add(nameSprite);

      this.group.add(podGroup);
      this.podMeshes.push(chassisMesh);
      if (pod.name) this.podMap.set(pod.name, chassisMesh);
      if (pod.id) this.podMap.set(pod.id, chassisMesh);
    });
  }

  _buildDependencyCurves() {
    const connections = [
      { from: 'frontend', to: 'cart-service', color: 0x4285f4 },
      { from: 'cart-service', to: 'payment-service', color: 0xea4335 },
      { from: 'frontend', to: 'catalog-service', color: 0x34a853 },
      { from: 'spark-master', to: 'spark-worker-01', color: 0x4285f4 },
      { from: 'spark-master', to: 'spark-worker-02', color: 0x4285f4 },
      { from: 'stage-frontend', to: 'stage-auth', color: 0x34a853 },
    ];

    connections.forEach(({ from, to, color }) => {
      let fromMesh = null;
      let toMesh = null;

      for (const [key, mesh] of this.podMap.entries()) {
        if (typeof key === 'string') {
          if (key.includes(from) && !fromMesh) fromMesh = mesh;
          if (key.includes(to) && !toMesh) toMesh = mesh;
        }
      }

      if (fromMesh && toMesh) {
        const start = new THREE.Vector3();
        fromMesh.getWorldPosition(start);
        start.y += 0.7;

        const end = new THREE.Vector3();
        toMesh.getWorldPosition(end);
        end.y += 0.7;

        this._createCurve(start, end, color);
      }
    });
  }

  _createCurve(start, end, colorHex) {
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.y += 1.6;

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const points = curve.getPoints(40);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.5,
    });
    const line = new THREE.Line(geometry, material);
    this.group.add(line);

    // Particle flow animation along curve
    const particleCount = 3;
    for (let i = 0; i < particleCount; i++) {
      const pGeo = new THREE.SphereGeometry(0.1, 8, 8);
      const pMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.85,
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      this.group.add(pMesh);

      this.curveParticles.push({
        mesh: pMesh,
        curve: curve,
        offset: i / particleCount,
      });
    }
  }

  /**
   * Updates animations for glowing nodes, crash beacons, and dependency flow.
   * @param {number} time
   */
  update(time) {
    // Pulse crash beacons
    const pulseFactor = (Math.sin(time * 0.005) + 1) / 2;
    for (const mesh of this.crashPods) {
      if (mesh.userData && mesh.userData.alertBeacon) {
        mesh.userData.alertBeacon.material.opacity = 0.25 + pulseFactor * 0.55;
        const s = 1.0 + pulseFactor * 0.18;
        mesh.userData.alertBeacon.scale.set(s, s, s);
      }
      if (mesh.userData && mesh.userData.capMesh) {
        mesh.userData.capMesh.material.emissiveIntensity = 0.8 + pulseFactor * 1.2;
      }
    }

    // Animate data flow particles along conduits
    for (const p of this.curveParticles) {
      const progress = (time * 0.00035 + p.offset) % 1;
      const pos = p.curve.getPoint(progress);
      p.mesh.position.copy(pos);
    }
  }

  /**
   * Remediates a pod node in real time (e.g. after SRE rollback).
   * @param {string} podId
   * @param {string} status
   */
  remediatePod(podId, status = 'Running') {
    let targetMesh = this.podMap.get(podId);
    if (!targetMesh) {
      for (const [key, mesh] of this.podMap.entries()) {
        if (key.includes(podId) || podId.includes(key)) {
          targetMesh = mesh;
          break;
        }
      }
    }

    if (!targetMesh) return;

    const colorScheme = STATUS_COLORS[status] || STATUS_COLORS.Running;
    targetMesh.userData.isCrashLoop = false;
    targetMesh.userData.pod.status = status;

    // Remove from crashPods
    this.crashPods = this.crashPods.filter((m) => m !== targetMesh);

    // Hide alert beacon
    if (targetMesh.userData.alertBeacon) {
      targetMesh.userData.alertBeacon.visible = false;
    }

    // Turn top cap to green
    if (targetMesh.userData.capMesh) {
      targetMesh.userData.capMesh.material.color.setHex(colorScheme.color);
      targetMesh.userData.capMesh.material.emissive.setHex(colorScheme.emissive);
      targetMesh.userData.capMesh.material.emissiveIntensity = 1.0;
    }

    // Turn edge highlight to green
    if (targetMesh.userData.edgeMesh) {
      targetMesh.userData.edgeMesh.material.color.setHex(colorScheme.color);
      targetMesh.userData.edgeMesh.material.opacity = 0.6;
    }
  }

  /**
   * Returns spatial coordinates for a given cluster name.
   * @param {string} clusterName
   * @returns {THREE.Vector3|null}
   */
  getClusterPosition(clusterName) {
    return this.clusterPositions.get(clusterName) || null;
  }

  getInteractiveObjects() {
    return this.podMeshes;
  }

  clear() {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    this.podMeshes = [];
    this.crashPods = [];
    this.clusterMonoliths = [];
    this.curveParticles = [];
    this.podMap.clear();
    this.clusterPositions.clear();
  }
}
