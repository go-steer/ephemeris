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
  Running: { color: 0x34a853, emissive: 0x0d652d, text: '#34a853' },
  CrashLoopBackOff: { color: 0xea4335, emissive: 0xb31412, text: '#ea4335' },
  Pending: { color: 0xfbbc04, emissive: 0xe37400, text: '#fbbc04' },
  Failed: { color: 0xea4335, emissive: 0xb31412, text: '#ea4335' },
  Unknown: { color: 0x9aa0a6, emissive: 0x5f6368, text: '#9aa0a6' },
};

/**
 * Creates a razor-sharp billboard text sprite formatted in Google Cloud / K8s typography.
 * Renders on high-resolution canvas with mipmapping and anisotropic filtering to eliminate blurriness.
 */
function createTextSprite(text, color = '#e8eaed', fontSize = 16, badge = '') {
  const isRed = color === '#ea4335' || color === '#f28b82' || color === 'var(--accent-red)';
  const isGreen = color === '#34a853' || color === '#81c995';
  const isYellow = color === '#fbbc04' || color === '#fdd663';

  // For trouble resources, prepend ✕ icon to echo HUD crash badge
  const iconPrefix = isRed ? '\u2715 ' : '';
  const displayText = badge ? `${iconPrefix}${text}  \u2022  ${badge}` : `${iconPrefix}${text}`;

  // High-resolution canvas rendering multiplier (3.5x) for needle-sharp text in 3D
  const scale = 3.5;
  const renderFontSize = Math.round(fontSize * scale);
  const padX = Math.round(20 * scale);
  const padY = Math.round(10 * scale);

  // Use a measurement canvas
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) return new THREE.Object3D();

  measureCtx.font = `700 ${renderFontSize}px "Google Sans", "Roboto", -apple-system, sans-serif`;
  const textWidth = measureCtx.measureText(displayText).width;

  const canvasWidth = Math.max(Math.round(140 * scale), Math.ceil(textWidth + padX * 2));
  const canvasHeight = Math.ceil(renderFontSize + padY * 2);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Object3D();

  // Glassmorphic pill background with status-tinted fill
  const radius = Math.round(7 * scale);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(scale, scale, canvasWidth - scale * 2, canvasHeight - scale * 2, radius);
  } else {
    ctx.rect(scale, scale, canvasWidth - scale * 2, canvasHeight - scale * 2);
  }

  // Base dark container
  ctx.fillStyle = 'rgba(11, 15, 25, 0.94)';
  ctx.fill();

  // Tint overlay matching HUD stat badges
  if (isRed) {
    ctx.fillStyle = 'rgba(234, 67, 53, 0.22)';
    ctx.fill();
  } else if (isGreen) {
    ctx.fillStyle = 'rgba(52, 168, 83, 0.16)';
    ctx.fill();
  } else if (isYellow) {
    ctx.fillStyle = 'rgba(251, 188, 4, 0.16)';
    ctx.fill();
  }

  // Status border hairline with subtle glow
  if (isRed) {
    ctx.shadowColor = 'rgba(234, 67, 53, 0.7)';
    ctx.shadowBlur = Math.round(6 * scale);
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  ctx.strokeStyle = isRed
    ? 'rgba(234, 67, 53, 0.95)'
    : isGreen
      ? 'rgba(52, 168, 83, 0.92)'
      : isYellow
        ? 'rgba(251, 188, 4, 0.92)'
        : 'rgba(66, 133, 244, 0.85)';
  ctx.lineWidth = Math.round(1.6 * scale);
  ctx.stroke();

  // Reset shadow for razor-sharp typography
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Draw crisp text centered with exact vibrant Google status colors
  ctx.font = `700 ${renderFontSize}px "Google Sans", "Roboto", -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isRed ? '#ea4335' : isGreen ? '#34a853' : isYellow ? '#fbbc04' : color;
  ctx.fillText(displayText, canvasWidth / 2, canvasHeight / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  texture.needsUpdate = true;

  // toneMapped: false and fog: false prevent scene tone mapping and distance fog
  // from dulling/darkening UI billboard colors
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const sprite = new THREE.Sprite(spriteMaterial);

  // Proportional world scale in 3D scene
  const worldHeight = fontSize >= 18 ? 0.85 : 0.55;
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

    // 1. Base Hexagonal Pedestal (Tiered architectural slab in Google Cloud dark slate)
    const platformGeo = new THREE.CylinderGeometry(15, 16, 0.8, 6);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x131724,
      roughness: 0.55,
      metalness: 0.4,
    });
    const platformMesh = new THREE.Mesh(platformGeo, platformMat);
    platformMesh.position.y = 0.4;
    platformMesh.receiveShadow = true;
    clusterGroup.add(platformMesh);

    // Platform upper rim loop in Google Blue (#4285F4)
    const rimPoints = [];
    for (let i = 0; i <= 6; i++) {
      const theta = (i / 6) * Math.PI * 2;
      rimPoints.push(new THREE.Vector3(Math.cos(theta) * 15.05, 0.82, Math.sin(theta) * 15.05));
    }
    const rimGeo = new THREE.BufferGeometry().setFromPoints(rimPoints);
    const rimMat = new THREE.LineBasicMaterial({
      color: 0x4285f4,
      transparent: true,
      opacity: 0.85,
    });
    const rimLine = new THREE.Line(rimGeo, rimMat);
    clusterGroup.add(rimLine);

    // 2. Central Kubernetes Control Plane Master Node (Hexagonal command monolith)
    const monolithGeo = new THREE.CylinderGeometry(1.1, 1.3, 3.2, 6);
    const monolithMat = new THREE.MeshStandardMaterial({
      color: 0x326ce5,
      roughness: 0.35,
      metalness: 0.45,
    });
    const monolithMesh = new THREE.Mesh(monolithGeo, monolithMat);
    monolithMesh.position.y = 2.0;
    clusterGroup.add(monolithMesh);

    // Vertical status LED slit
    const hasCrash = (cluster.namespaces || []).some((ns) =>
      (ns.pods || []).some((p) => p.status === 'CrashLoopBackOff' || p.status === 'Failed')
    );
    const slitColor = hasCrash ? 0xea4335 : 0x34a853;

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
    const statusLabel = hasCrash ? '1 CRASHING' : 'HEALTHY';
    const statusTextColor = hasCrash ? '#ea4335' : '#34a853';
    const plaqueSprite = createTextSprite(cluster.name, statusTextColor, 18, statusLabel);
    plaqueSprite.position.set(0, 4.4, 0);
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
        color: 0x111520,
        roughness: 0.65,
        metalness: 0.35,
      });
      const nsPadMesh = new THREE.Mesh(nsPadGeo, nsPadMat);
      nsPadMesh.position.set(zoneCenter.x, 0.9, zoneCenter.z);
      this.group.add(nsPadMesh);

      // Namespace border line (Google Blue accent #4285F4 or Red if contains crashing workloads)
      const nsHasCrash = (ns.pods || []).some(
        (p) => p.status === 'CrashLoopBackOff' || p.status === 'Failed'
      );
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
        color: nsHasCrash ? 0xea4335 : 0x4285f4,
        transparent: true,
        opacity: nsHasCrash ? 0.92 : 0.75,
      });
      this.group.add(new THREE.Line(nsRimGeo, nsRimMat));

      // Namespace header sprite tag (alert red if namespace has crashing workloads)
      const nsColor = nsHasCrash ? '#ea4335' : '#8ab4f8';
      const nsBadge = nsHasCrash ? '1 CRASHING' : '';
      const nsSprite = createTextSprite(`ns: ${ns.name}`, nsColor, 14, nsBadge);
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

      // Pod Group positioned on namespace territory
      const podGroup = new THREE.Group();
      podGroup.position.set(px, 1.0, pz);

      // 1. Inner Container (Solid Hexagon - radialSegments: 6)
      const containerGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 6);
      const containerMat = new THREE.MeshStandardMaterial({
        color: colorScheme.color,
        roughness: 0.35,
        metalness: 0.25,
        emissive: colorScheme.emissive,
        emissiveIntensity: isCrash ? 0.85 : 0.25,
      });
      const containerMesh = new THREE.Mesh(containerGeo, containerMat);
      containerMesh.position.y = 0.55;
      containerMesh.castShadow = true;
      podGroup.add(containerMesh);

      // Container hexagonal edge rim
      const containerEdgesGeo = new THREE.EdgesGeometry(containerGeo);
      const containerEdgeMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.25,
      });
      const containerEdges = new THREE.LineSegments(containerEdgesGeo, containerEdgeMat);
      containerMesh.add(containerEdges);

      // 2. Outer Pod Boundary (Dashed Heptagon - radialSegments: 7)
      const podGeometry = new THREE.CylinderGeometry(0.95, 0.95, 1.45, 7);
      const edges = new THREE.EdgesGeometry(podGeometry);
      const boundaryColor = isCrash ? 0xea4335 : status === 'Pending' ? 0xfbbc04 : 0x326ce5;
      const lineMaterial = new THREE.LineDashedMaterial({
        color: boundaryColor,
        linewidth: 2,
        scale: 1,
        dashSize: 0.25,
        gapSize: 0.15,
        transparent: true,
        opacity: isCrash ? 0.95 : 0.8,
      });
      const podBoundary = new THREE.LineSegments(edges, lineMaterial);
      podBoundary.computeLineDistances(); // Required for LineDashedMaterial
      containerMesh.add(podBoundary);

      // 3. Pulsing alert beacon for CrashLoopBackOff / Failed
      let alertBeacon = null;
      if (isCrash) {
        const beaconGeo = new THREE.CylinderGeometry(1.2, 1.2, 1.7, 7);
        const beaconEdges = new THREE.EdgesGeometry(beaconGeo);
        const beaconMat = new THREE.LineBasicMaterial({
          color: 0xea4335,
          transparent: true,
          opacity: 0.65,
        });
        alertBeacon = new THREE.LineSegments(beaconEdges, beaconMat);
        containerMesh.add(alertBeacon);
      }

      // Metadata on interactive mesh (containerMesh is raycast target)
      containerMesh.userData = {
        type: 'pod',
        pod: pod,
        namespaceName: ns.name,
        clusterName: clusterName,
        baseColor: colorScheme.color,
        baseEmissive: colorScheme.emissive,
        isCrashLoop: isCrash,
        podGroup: podGroup,
        containerMesh: containerMesh,
        podBoundary: podBoundary,
        alertBeacon: alertBeacon,
        capMesh: containerMesh,
        edgeMesh: containerEdges,
      };

      if (isCrash) {
        this.crashPods.push(containerMesh);
      }

      // 4. Pod name billboard tag
      const subtitle = isCrash
        ? pod.restarts > 0
          ? `${pod.restarts} restarts`
          : '1 CRASHING'
        : pod.restarts > 0
          ? `${pod.restarts} restarts`
          : '';
      const nameSprite = createTextSprite(pod.name, colorScheme.text, 14, subtitle);
      nameSprite.position.set(0, 1.85, 0);
      podGroup.add(nameSprite);

      // Save references on userData for real-time remediation updates
      containerMesh.userData.nameSprite = nameSprite;
      containerMesh.userData.podGroup = podGroup;

      this.group.add(podGroup);
      this.podMeshes.push(containerMesh);
      if (pod.name) this.podMap.set(pod.name, containerMesh);
      if (pod.id) this.podMap.set(pod.id, containerMesh);
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
    // Subtle idle rotation of the dashed heptagonal boundary (as specified in docs/design/3d-pods.md)
    for (const mesh of this.podMeshes) {
      if (mesh.userData && mesh.userData.podBoundary) {
        mesh.userData.podBoundary.rotation.y = time * 0.0006;
      }
    }

    // Pulse crash beacons
    const pulseFactor = (Math.sin(time * 0.005) + 1) / 2;
    for (const mesh of this.crashPods) {
      if (mesh.userData && mesh.userData.alertBeacon) {
        mesh.userData.alertBeacon.material.opacity = 0.3 + pulseFactor * 0.55;
        const s = 1.0 + pulseFactor * 0.15;
        mesh.userData.alertBeacon.scale.set(s, s, s);
      }
      if (mesh.material) {
        mesh.material.emissiveIntensity = 0.5 + pulseFactor * 0.8;
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

    // Update inner container color & emissive to Google Green (#34A853)
    if (targetMesh.material) {
      targetMesh.material.color.setHex(colorScheme.color);
      targetMesh.material.emissive.setHex(colorScheme.emissive);
      targetMesh.material.emissiveIntensity = 0.3;
    }

    // Update outer boundary line to Kubernetes Blue or Google Green
    if (targetMesh.userData.podBoundary && targetMesh.userData.podBoundary.material) {
      targetMesh.userData.podBoundary.material.color.setHex(0x326ce5);
      targetMesh.userData.podBoundary.material.opacity = 0.8;
    }

    // Update billboard name sprite to healthy Google Green (#34A853)
    if (targetMesh.userData.nameSprite && targetMesh.userData.podGroup) {
      targetMesh.userData.podGroup.remove(targetMesh.userData.nameSprite);
      if (targetMesh.userData.nameSprite.material) {
        if (targetMesh.userData.nameSprite.material.map) {
          targetMesh.userData.nameSprite.material.map.dispose();
        }
        targetMesh.userData.nameSprite.material.dispose();
      }
      const newSprite = createTextSprite(targetMesh.userData.pod.name, '#34a853', 14, 'Healthy');
      newSprite.position.set(0, 1.85, 0);
      targetMesh.userData.podGroup.add(newSprite);
      targetMesh.userData.nameSprite = newSprite;
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
