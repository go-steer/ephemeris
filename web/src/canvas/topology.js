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

const STATUS_COLORS = {
  Running: { color: 0x00ff88, emissive: 0x00aa55 },
  CrashLoopBackOff: { color: 0xff0055, emissive: 0xff0044 },
  Pending: { color: 0xffaa00, emissive: 0xcc7700 },
  Failed: { color: 0xff2222, emissive: 0xaa1111 },
  Unknown: { color: 0x8899aa, emissive: 0x334455 },
};

/**
 * Creates a billboard text sprite using an HTML canvas texture.
 */
function createTextSprite(text, color = '#ffffff', fontSize = 28) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Object3D();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Subtle dark background pill for high contrast readability
  const textWidth = ctx.measureText(text).width;
  const pillWidth = Math.min(textWidth + 24, 480);
  const pillHeight = fontSize + 16;
  const pillX = (canvas.width - pillWidth) / 2;
  const pillY = (canvas.height - pillHeight) / 2;

  ctx.fillStyle = 'rgba(7, 10, 16, 0.75)';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 8);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

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
 * TopologyMesh renders the 3D visual graph of GKE clusters, namespaces, and pods.
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
    this.coreMesh = null;
    this.gyroRing1 = null;
    this.gyroRing2 = null;
    this.curveParticles = [];
    this.podMap = new Map(); // pod.id -> podMesh
  }

  /**
   * Build the 3D topology from the received cluster hierarchy.
   * @param {object} topologyData
   */
  build(topologyData) {
    this.clear();

    if (!topologyData || !topologyData.clusters || topologyData.clusters.length === 0) {
      return;
    }

    const cluster = topologyData.clusters[0];
    this._buildClusterCore(cluster.name || 'GKE Cluster');

    const namespaces = cluster.namespaces || [];
    const namespaceRadii = [18, 32, 46];

    namespaces.forEach((ns, nsIdx) => {
      const radius = namespaceRadii[nsIdx] || 18 + nsIdx * 14;
      this._buildNamespaceOrbit(ns, radius, nsIdx);
      this._buildPods(ns, radius, nsIdx, cluster.name);
    });

    this._buildDependencyCurves();
  }

  _buildClusterCore(clusterName) {
    const coreGroup = new THREE.Group();

    // Central dodecahedron solid core
    const coreGeo = new THREE.DodecahedronGeometry(3.5, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x0088cc,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      metalness: 0.85,
      wireframe: false,
    });
    this.coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreGroup.add(this.coreMesh);

    // Outer wireframe shell
    const wireGeo = new THREE.DodecahedronGeometry(4.2, 0);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    coreGroup.add(wireMesh);

    // Rotating gyroscope rings
    const ring1Geo = new THREE.TorusGeometry(5.2, 0.08, 16, 64);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.6,
    });
    this.gyroRing1 = new THREE.Mesh(ring1Geo, ring1Mat);
    coreGroup.add(this.gyroRing1);

    const ring2Geo = new THREE.TorusGeometry(5.8, 0.08, 16, 64);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x7928ca,
      transparent: true,
      opacity: 0.5,
    });
    this.gyroRing2 = new THREE.Mesh(ring2Geo, ring2Mat);
    this.gyroRing2.rotation.x = Math.PI / 3;
    coreGroup.add(this.gyroRing2);

    // Label sprite
    const labelSprite = createTextSprite(clusterName, '#00e5ff', 30);
    labelSprite.position.set(0, 6.8, 0);
    coreGroup.add(labelSprite);

    this.group.add(coreGroup);
  }

  _buildNamespaceOrbit(ns, radius, _nsIdx) {
    const ringGroup = new THREE.Group();

    // Orbital ring line
    const segments = 128;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(points);
    const ringMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.22,
    });
    const ringLine = new THREE.Line(ringGeo, ringMat);
    ringGroup.add(ringLine);

    // Namespace label sprite positioned at north of the orbit
    const labelSprite = createTextSprite(`ns: ${ns.name}`, '#8b949e', 22);
    labelSprite.position.set(0, 1.2, -radius);
    ringGroup.add(labelSprite);

    this.group.add(ringGroup);
  }

  _buildPods(ns, radius, nsIdx, clusterName) {
    const pods = ns.pods || [];
    const count = pods.length;
    if (count === 0) return;

    // Distribute pods evenly with an offset per namespace
    const offsetAngle = nsIdx * 0.5;

    pods.forEach((pod, i) => {
      const angle = (i / count) * Math.PI * 2 + offsetAngle;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = Math.sin(angle * 2.5) * 1.5; // Slight organic 3D wave

      const status = pod.status || 'Running';
      const colorScheme = STATUS_COLORS[status] || STATUS_COLORS.Unknown;

      // Pod sphere
      const sphereGeo = new THREE.SphereGeometry(1.6, 24, 24);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: colorScheme.color,
        emissive: colorScheme.emissive,
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.5,
      });

      const podMesh = new THREE.Mesh(sphereGeo, sphereMat);
      podMesh.position.set(x, y, z);

      // Outer translucent halo glow
      const haloGeo = new THREE.SphereGeometry(2.1, 16, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color: colorScheme.color,
        transparent: true,
        opacity: status === 'CrashLoopBackOff' ? 0.45 : 0.2,
        wireframe: true,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      podMesh.add(haloMesh);

      // Metadata for raycasting and interaction
      podMesh.userData = {
        type: 'pod',
        pod: pod,
        namespaceName: ns.name,
        clusterName: clusterName,
        baseColor: colorScheme.color,
        baseEmissive: colorScheme.emissive,
        isCrashLoop: status === 'CrashLoopBackOff',
        haloMesh: haloMesh,
      };

      if (status === 'CrashLoopBackOff') {
        this.crashPods.push(podMesh);
      }

      // Name sprite billboard
      const nameSprite = createTextSprite(
        pod.name,
        status === 'CrashLoopBackOff' ? '#ff0055' : '#e6edf3',
        20
      );
      nameSprite.position.set(0, 2.8, 0);
      podMesh.add(nameSprite);

      this.group.add(podMesh);
      this.podMeshes.push(podMesh);
      this.podMap.set(pod.name, podMesh);
      this.podMap.set(pod.id, podMesh);
    });
  }

  _buildDependencyCurves() {
    // Define logical service dependency flows in production
    const connections = [
      { from: 'frontend', to: 'cart-service', color: 0x00e5ff },
      { from: 'cart-service', to: 'payment-service', color: 0xff0055 },
      { from: 'frontend', to: 'catalog-service', color: 0x00ff88 },
    ];

    connections.forEach(({ from, to, color }) => {
      // Find matching pod meshes (by prefix match)
      let fromMesh = null;
      let toMesh = null;

      for (const [key, mesh] of this.podMap.entries()) {
        if (key.includes(from) && !fromMesh) fromMesh = mesh;
        if (key.includes(to) && !toMesh) toMesh = mesh;
      }

      if (fromMesh && toMesh) {
        this._createCurve(fromMesh.position, toMesh.position, color);
      }
    });
  }

  _createCurve(start, end, colorHex) {
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.y += 4.5; // Arc upward in 3D

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const points = curve.getPoints(50);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.55,
    });
    const line = new THREE.Line(geometry, material);
    this.group.add(line);

    // Particle flow animation along curve
    const particleCount = 6;
    for (let i = 0; i < particleCount; i++) {
      const pGeo = new THREE.SphereGeometry(0.25, 8, 8);
      const pMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.9,
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
   * Update animation loop for glowing nodes, spinning cores, and curve particles.
   * @param {number} time - Elapsed time in ms.
   */
  update(time) {
    // Rotate cluster core
    if (this.coreMesh) {
      this.coreMesh.rotation.y = time * 0.0004;
      this.coreMesh.rotation.x = time * 0.0002;
    }
    if (this.gyroRing1) {
      this.gyroRing1.rotation.z = time * 0.0006;
      this.gyroRing1.rotation.x = time * 0.0003;
    }
    if (this.gyroRing2) {
      this.gyroRing2.rotation.y = -time * 0.0005;
      this.gyroRing2.rotation.z = time * 0.0004;
    }

    // Pulse red CrashLoopBackOff pods
    const pulseFactor = (Math.sin(time * 0.005) + 1) / 2; // 0 to 1
    for (const mesh of this.crashPods) {
      mesh.material.emissiveIntensity = 0.6 + pulseFactor * 1.4;
      if (mesh.userData.haloMesh) {
        mesh.userData.haloMesh.material.opacity = 0.2 + pulseFactor * 0.5;
        const s = 1.0 + pulseFactor * 0.15;
        mesh.userData.haloMesh.scale.set(s, s, s);
      }
    }

    // Animate particles flowing along dependency curves
    for (const p of this.curveParticles) {
      const progress = (time * 0.0003 + p.offset) % 1;
      const pos = p.curve.getPoint(progress);
      p.mesh.position.copy(pos);
    }
  }

  /**
   * Returns list of interactive pod meshes for raycasting.
   * @returns {THREE.Mesh[]}
   */
  getInteractiveObjects() {
    return this.podMeshes;
  }

  /**
   * Clear all meshes and free WebGL resources.
   */
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
    this.curveParticles = [];
    this.podMap.clear();
    this.coreMesh = null;
    this.gyroRing1 = null;
    this.gyroRing2 = null;
  }
}
