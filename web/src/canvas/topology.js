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

// Google Cloud status color tokens (matching Pantheon / Cloud Console)
const STATUS_COLORS = {
  Running: { color: 0x81c995, emissive: 0x81c995, text: '#81c995' },
  CrashLoopBackOff: { color: 0xf28b82, emissive: 0xf28b82, text: '#f28b82' },
  Pending: { color: 0xfdd663, emissive: 0xfdd663, text: '#fdd663' },
  Failed: { color: 0xf28b82, emissive: 0xf28b82, text: '#f28b82' },
  Unknown: { color: 0x9aa0a6, emissive: 0x5f6368, text: '#9aa0a6' },
};

/**
 * Creates a crisp billboard text sprite formatted in Google Cloud Console typography.
 */
function createTextSprite(text, color = '#e8eaed', fontSize = 26, badge = '') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Object3D();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 ${fontSize}px "Google Sans", Roboto, -apple-system, BlinkMacSystemFont, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const displayText = badge ? `${text} [${badge}]` : text;
  const textWidth = ctx.measureText(displayText).width;
  const pillWidth = Math.min(textWidth + 28, 490);
  const pillHeight = fontSize + 16;
  const pillX = (canvas.width - pillWidth) / 2;
  const pillY = (canvas.height - pillHeight) / 2;

  // Google Material dark surface card pill
  ctx.fillStyle = 'rgba(32, 33, 36, 0.88)';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 6);
  ctx.fill();

  // Subtle border hairline
  ctx.strokeStyle = color === '#f28b82' ? 'rgba(242, 139, 130, 0.6)' : 'rgba(138, 180, 248, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fillText(displayText, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(10, 2.5, 1);
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
          const dist = 78;
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

    // 1. Base Hexagonal Pedestal (Tiered architectural slab)
    const platformGeo = new THREE.CylinderGeometry(28, 30, 1.8, 6);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x2a2b2e,
      roughness: 0.75,
      metalness: 0.25,
    });
    const platformMesh = new THREE.Mesh(platformGeo, platformMat);
    platformMesh.position.y = 0.9;
    platformMesh.receiveShadow = true;
    clusterGroup.add(platformMesh);

    // Platform upper rim loop in Google Cloud Grey 700
    const rimPoints = [];
    for (let i = 0; i <= 6; i++) {
      const theta = (i / 6) * Math.PI * 2;
      rimPoints.push(new THREE.Vector3(Math.cos(theta) * 28.1, 1.82, Math.sin(theta) * 28.1));
    }
    const rimGeo = new THREE.BufferGeometry().setFromPoints(rimPoints);
    const rimMat = new THREE.LineBasicMaterial({
      color: 0x5f6368,
      transparent: true,
      opacity: 0.7,
    });
    const rimLine = new THREE.Line(rimGeo, rimMat);
    clusterGroup.add(rimLine);

    // 2. Central Infrastructure Monolith Column (Server Rack Pillar)
    const monolithGeo = new THREE.BoxGeometry(3.6, 8.0, 3.6);
    const monolithMat = new THREE.MeshStandardMaterial({
      color: 0x1f2023,
      roughness: 0.35,
      metalness: 0.65,
    });
    const monolithMesh = new THREE.Mesh(monolithGeo, monolithMat);
    monolithMesh.position.y = 4.9;
    clusterGroup.add(monolithMesh);

    // Subtle vertical LED indicator slit
    const hasCrash = (cluster.namespaces || []).some((ns) =>
      (ns.pods || []).some((p) => p.status === 'CrashLoopBackOff' || p.status === 'Failed')
    );
    const slitColor = hasCrash ? 0xf28b82 : 0x8ab4f8;

    const slitGeo = new THREE.BoxGeometry(0.3, 7.2, 3.65);
    const slitMat = new THREE.MeshStandardMaterial({
      color: slitColor,
      emissive: slitColor,
      emissiveIntensity: 1.2,
      roughness: 0.2,
    });
    const slitMesh = new THREE.Mesh(slitGeo, slitMat);
    slitMesh.position.y = 4.9;
    clusterGroup.add(slitMesh);

    this.clusterMonoliths.push(monolithMesh);

    // 3. Cluster Plaque Billboard
    const statusLabel = hasCrash ? '1 ALERT' : 'HEALTHY';
    const statusTextColor = hasCrash ? '#f28b82' : '#81c995';
    const plaqueSprite = createTextSprite(
      `${cluster.name} [${cluster.location || 'us-central1'}]`,
      statusTextColor,
      26,
      statusLabel
    );
    plaqueSprite.position.set(0, 10.2, 0);
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
        const nsDistance = 14.5;
        nx = Math.cos(nsAngle) * nsDistance;
        nz = Math.sin(nsAngle) * nsDistance;
      }

      const zoneCenter = new THREE.Vector3(
        clusterCenter.x + nx,
        clusterCenter.y,
        clusterCenter.z + nz
      );

      // Namespace territory platform zone
      const nsPadGeo = new THREE.CylinderGeometry(9.5, 10.0, 0.35, 6);
      const nsPadMat = new THREE.MeshStandardMaterial({
        color: 0x242528,
        roughness: 0.8,
        metalness: 0.2,
      });
      const nsPadMesh = new THREE.Mesh(nsPadGeo, nsPadMat);
      nsPadMesh.position.set(zoneCenter.x, 1.95, zoneCenter.z);
      this.group.add(nsPadMesh);

      // Namespace border line
      const nsRimPoints = [];
      for (let i = 0; i <= 6; i++) {
        const theta = (i / 6) * Math.PI * 2;
        nsRimPoints.push(
          new THREE.Vector3(
            zoneCenter.x + Math.cos(theta) * 9.6,
            2.15,
            zoneCenter.z + Math.sin(theta) * 9.6
          )
        );
      }
      const nsRimGeo = new THREE.BufferGeometry().setFromPoints(nsRimPoints);
      const nsRimMat = new THREE.LineBasicMaterial({
        color: 0x3c4043,
        transparent: true,
        opacity: 0.8,
      });
      this.group.add(new THREE.Line(nsRimGeo, nsRimMat));

      // Namespace header sprite tag
      const nsSprite = createTextSprite(`ns: ${ns.name}`, '#bdc1c6', 22);
      nsSprite.position.set(zoneCenter.x, 3.2, zoneCenter.z - 8.5);
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
        const radius = Math.min(5.5, 2.5 + podCount * 0.8);
        px = zoneCenter.x + Math.cos(angle) * radius;
        pz = zoneCenter.z + Math.sin(angle) * radius;
      }

      const status = pod.status || 'Running';
      const colorScheme = STATUS_COLORS[status] || STATUS_COLORS.Unknown;
      const isCrash = status === 'CrashLoopBackOff' || status === 'Failed';

      // Pod Architectural Compute Node (Beveled chassis + top status plate)
      const podGroup = new THREE.Group();
      podGroup.position.set(px, 2.15, pz);

      // Main container chassis
      const chassisGeo = new THREE.BoxGeometry(2.4, 2.8, 2.4);
      const chassisMat = new THREE.MeshStandardMaterial({
        color: 0x2a2b2e,
        roughness: 0.45,
        metalness: 0.55,
      });
      const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
      chassisMesh.position.y = 1.4;
      chassisMesh.castShadow = true;
      podGroup.add(chassisMesh);

      // Bevel edge highlight
      const edgesGeo = new THREE.EdgesGeometry(chassisGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: colorScheme.color,
        transparent: true,
        opacity: isCrash ? 0.8 : 0.4,
      });
      const edges = new THREE.LineSegments(edgesGeo, edgeMat);
      edges.position.y = 1.4;
      podGroup.add(edges);

      // Top Status LED Cap
      const capGeo = new THREE.BoxGeometry(2.0, 0.4, 2.0);
      const capMat = new THREE.MeshStandardMaterial({
        color: colorScheme.color,
        emissive: colorScheme.emissive,
        emissiveIntensity: isCrash ? 1.4 : 0.8,
        roughness: 0.2,
      });
      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.y = 2.9;
      podGroup.add(capMesh);

      // Pulsing alert wireframe beacon for CrashLoopBackOff
      let alertBeacon = null;
      if (isCrash) {
        const beaconGeo = new THREE.BoxGeometry(3.0, 3.4, 3.0);
        const beaconMat = new THREE.MeshBasicMaterial({
          color: 0xf28b82,
          wireframe: true,
          transparent: true,
          opacity: 0.5,
        });
        alertBeacon = new THREE.Mesh(beaconGeo, beaconMat);
        alertBeacon.position.y = 1.4;
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
        alertBeacon: alertBeacon,
      };

      if (isCrash) {
        this.crashPods.push(chassisMesh);
      }

      // Pod name billboard tag
      const subtitle = pod.restarts > 0 ? `${pod.restarts} restarts` : '';
      const nameSprite = createTextSprite(pod.name, colorScheme.text, 22, subtitle);
      nameSprite.position.set(0, 4.2, 0);
      podGroup.add(nameSprite);

      this.group.add(podGroup);
      this.podMeshes.push(chassisMesh);
      if (pod.name) this.podMap.set(pod.name, chassisMesh);
      if (pod.id) this.podMap.set(pod.id, chassisMesh);
    });
  }

  _buildDependencyCurves() {
    const connections = [
      { from: 'frontend', to: 'cart-service', color: 0x8ab4f8 },
      { from: 'cart-service', to: 'payment-service', color: 0xf28b82 },
      { from: 'frontend', to: 'catalog-service', color: 0x81c995 },
      { from: 'spark-master', to: 'spark-worker-01', color: 0x8ab4f8 },
      { from: 'spark-master', to: 'spark-worker-02', color: 0x8ab4f8 },
      { from: 'stage-frontend', to: 'stage-auth', color: 0x81c995 },
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
        start.y += 1.5;

        const end = new THREE.Vector3();
        toMesh.getWorldPosition(end);
        end.y += 1.5;

        this._createCurve(start, end, color);
      }
    });
  }

  _createCurve(start, end, colorHex) {
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.y += 3.8;

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const points = curve.getPoints(40);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.45,
    });
    const line = new THREE.Line(geometry, material);
    this.group.add(line);

    // Particle flow animation along curve
    const particleCount = 4;
    for (let i = 0; i < particleCount; i++) {
      const pGeo = new THREE.SphereGeometry(0.2, 8, 8);
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
