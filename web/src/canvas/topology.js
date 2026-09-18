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
import { createK8sSurfaceMedallions } from './k8s-icons.js';

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

  // Sleek, compact proportional world scale in 3D scene (~54% smaller width/height)
  const worldHeight = fontSize >= 18 ? 0.52 : 0.25;
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
    this.resourceMeshes = [];
    this.crashPods = [];
    this.clusterMonoliths = [];
    this.curveParticles = [];
    this.ownershipBeams = [];
    this.allLabelSprites = [];
    this.iconSprites = [];
    this.podMap = new Map(); // pod.id / name -> mesh
    this.resourceMap = new Map(); // resource.id / name -> mesh
    this.clusterPositions = new Map(); // cluster.name -> Vector3
    this.clusterPlaques = new Map(); // cluster.name -> { sprite, group }
    this.clusterSlits = new Map(); // cluster.name -> slitMesh
    this.namespacePlaques = new Map(); // `${cluster.name}/${ns.name}` -> { sprite, rimLine, zoneCenter }
    this.podConduits = new Map(); // podName -> array of { line, particles }
    this.conduits = [];
    this.blastRadiusPods = new Set();
    this.blastRadiusConduits = new Set();
    this.trafficDrainMap = new Map();
    this.selectedPodMesh = null;
    this.selectionReticle = null;

    this.activeLayerFilter = 'all';
    this.labelMode = 'hover-trouble';
    this.activeChainIds = new Set();
    this.hoveredNodeId = null;
    this.hoveredChainIds = new Set();
    this._lastCamera = null;
    this.objectScaleFactor = 0.72;
    this.stats = {
      fps: 60,
      totalObjects: 0,
      clusterCount: 0,
      podCount: 0,
      resourceCount: 0,
      activeLayer: 'all',
      labelMode: 'hover-trouble',
      zoomBand: 'Cluster',
    };
    this._lastFrameTime = performance.now();
    this._frameSamples = [];
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

    let podCount = 0;
    let resourceCount = 0;
    clusters.forEach((c) => {
      (c.namespaces || []).forEach((ns) => {
        podCount += (ns.pods || []).length;
        resourceCount += (ns.resources || []).length;
      });
    });

    const totalObjects = podCount + resourceCount;
    // Scale down base object dimensions per user request, and adapt further at high object counts
    this.objectScaleFactor = totalObjects > 300 ? 0.48 : totalObjects > 120 ? 0.58 : 0.72;
    this.stats.clusterCount = clusterCount;
    this.stats.podCount = podCount;
    this.stats.resourceCount = resourceCount;
    this.stats.totalObjects = totalObjects;

    clusters.forEach((cluster, idx) => {
      // Position multiple clusters spatially across concentric fleet rings
      let cx = 0;
      let cz = 0;
      if (clusterCount > 1) {
        if (idx === 0) {
          cx = 0;
          cz = 0;
        } else if (clusterCount <= 3) {
          const angle = ((idx - 1) / (clusterCount - 1)) * Math.PI + Math.PI / 6;
          const dist = 42;
          cx = Math.cos(angle) * dist;
          cz = Math.sin(angle) * dist;
        } else if (clusterCount <= 7) {
          const angle = ((idx - 1) / (clusterCount - 1)) * Math.PI * 2;
          const dist = 44;
          cx = Math.cos(angle) * dist;
          cz = Math.sin(angle) * dist;
        } else {
          // Multi-ring fleet layout for 8-12+ clusters
          if (idx <= 5) {
            const angle = ((idx - 1) / 5) * Math.PI * 2;
            const dist = 42;
            cx = Math.cos(angle) * dist;
            cz = Math.sin(angle) * dist;
          } else {
            const outerCount = clusterCount - 6;
            const angle = ((idx - 6) / outerCount) * Math.PI * 2 + Math.PI / 12;
            const dist = 78;
            cx = Math.cos(angle) * dist;
            cz = Math.sin(angle) * dist;
          }
        }
      }

      const clusterPos = new THREE.Vector3(cx, 0, cz);
      this.clusterPositions.set(cluster.name, clusterPos);

      this._buildClusterPlatform(cluster, clusterPos);
      this._buildNamespacesAndPods(cluster, clusterPos);
    });

    this._buildOwnershipBeams();
    this._buildDependencyCurves();
    this.setLayerFilter(this.activeLayerFilter);
  }

  _buildClusterPlatform(cluster, center) {
    const clusterGroup = new THREE.Group();
    clusterGroup.position.copy(center);

    // 1. Base Hexagonal Pedestal (50% reduced height: 0.4)
    const platformGeo = new THREE.CylinderGeometry(15, 16, 0.4, 6);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x131724,
      roughness: 0.55,
      metalness: 0.4,
    });
    const platformMesh = new THREE.Mesh(platformGeo, platformMat);
    platformMesh.position.y = 0.2;
    platformMesh.receiveShadow = true;
    clusterGroup.add(platformMesh);

    // Platform upper rim loop in Google Blue (#4285F4)
    const rimPoints = [];
    for (let i = 0; i <= 6; i++) {
      const theta = (i / 6) * Math.PI * 2;
      rimPoints.push(new THREE.Vector3(Math.cos(theta) * 15.05, 0.42, Math.sin(theta) * 15.05));
    }
    const rimGeo = new THREE.BufferGeometry().setFromPoints(rimPoints);
    const rimMat = new THREE.LineBasicMaterial({
      color: 0x4285f4,
      transparent: true,
      opacity: 0.85,
    });
    const rimLine = new THREE.Line(rimGeo, rimMat);
    clusterGroup.add(rimLine);

    // 2. Central Kubernetes Control Plane Master Node (50% reduced height: 1.6, flat face at +Z)
    const monolithGeo = new THREE.CylinderGeometry(1.1, 1.3, 1.6, 6);
    monolithGeo.rotateY(Math.PI / 6);
    const monolithMat = new THREE.MeshStandardMaterial({
      color: 0x326ce5,
      roughness: 0.35,
      metalness: 0.45,
    });
    const monolithMesh = new THREE.Mesh(monolithGeo, monolithMat);
    monolithMesh.position.y = 1.0;
    clusterGroup.add(monolithMesh);

    // Side status LED slits along X flanks so +Z front face is clear for control-plane.svg
    const hasCrash = (cluster.namespaces || []).some((ns) =>
      (ns.pods || []).some((p) => p.status === 'CrashLoopBackOff' || p.status === 'Failed')
    );
    const slitColor = hasCrash ? 0xea4335 : 0x34a853;

    const slitGeo = new THREE.BoxGeometry(2.35, 1.4, 0.14);
    const slitMat = new THREE.MeshStandardMaterial({
      color: slitColor,
      emissive: slitColor,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    const slitMesh = new THREE.Mesh(slitGeo, slitMat);
    slitMesh.position.y = 1.0;
    clusterGroup.add(slitMesh);

    // Official Kubernetes control-plane.svg Top-Cap + Front-Face Medallions on Cluster Monolith
    const cpShieldColor = hasCrash ? '#ea4335' : '#326ce5';
    const { topMedallion: cpTop, frontMedallion: cpFront } = createK8sSurfaceMedallions(
      'Cluster',
      cpShieldColor,
      hasCrash,
      {
        topRadius: 0.85,
        topY: 0.815,
        frontRadius: 0.48,
        frontY: 0.05,
        frontZ: 1.12,
      }
    );
    monolithMesh.add(cpTop);
    monolithMesh.add(cpFront);
    monolithMesh.userData = {
      kind: 'Cluster',
      clusterName: cluster.name,
      topMedallion: cpTop,
      frontMedallion: cpFront,
      iconEmblem: cpFront,
    };
    this.iconSprites.push(cpTop, cpFront);

    this.clusterMonoliths.push(monolithMesh);
    this.clusterSlits.set(cluster.name, slitMesh);

    // 3. Cluster Plaque Billboard (50% lower elevation: y = 2.35)
    const statusLabel = hasCrash ? '1 CRASHING' : 'HEALTHY';
    const statusTextColor = hasCrash ? '#ea4335' : '#34a853';
    const plaqueSprite = createTextSprite(cluster.name, statusTextColor, 18, statusLabel);
    plaqueSprite.userData = { isPlaque: true, isIncident: hasCrash, kind: 'Cluster' };
    plaqueSprite.position.set(0, 2.35, 0);
    clusterGroup.add(plaqueSprite);
    this.allLabelSprites.push(plaqueSprite);
    this.clusterPlaques.set(cluster.name, { sprite: plaqueSprite, group: clusterGroup });

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

      // Namespace territory platform zone (50% reduced height: 0.12, y = 0.45)
      const nsPadGeo = new THREE.CylinderGeometry(5.2, 5.6, 0.12, 6);
      const nsPadMat = new THREE.MeshStandardMaterial({
        color: 0x111520,
        roughness: 0.65,
        metalness: 0.35,
      });
      const nsPadMesh = new THREE.Mesh(nsPadGeo, nsPadMat);
      nsPadMesh.position.set(zoneCenter.x, 0.45, zoneCenter.z);
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
            0.52,
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
      const nsRimLine = new THREE.Line(nsRimGeo, nsRimMat);
      this.group.add(nsRimLine);

      // Namespace header sprite tag (50% lower elevation: y = 0.88)
      const nsColor = nsHasCrash ? '#ea4335' : '#8ab4f8';
      const nsBadge = nsHasCrash ? '1 CRASHING' : '';
      const nsSprite = createTextSprite(`ns: ${ns.name}`, nsColor, 14, nsBadge);
      nsSprite.userData = { isPlaque: true, isIncident: nsHasCrash, kind: 'Namespace' };
      nsSprite.position.set(zoneCenter.x, 0.88, zoneCenter.z - 4.4);
      this.group.add(nsSprite);
      this.allLabelSprites.push(nsSprite);

      this.namespacePlaques.set(`${cluster.name}/${ns.name}`, {
        sprite: nsSprite,
        rimLine: nsRimLine,
        zoneCenter,
      });

      // Pods within this namespace territory
      this._buildPodNodes(ns, zoneCenter, cluster.name);
      // Stratified 3D controllers & networking resources above pods
      this._buildNamespaceResources(ns, zoneCenter, cluster.name);
    });
  }

  _buildPodNodes(ns, zoneCenter, clusterName) {
    const pods = ns.pods || [];
    const podCount = pods.length;
    if (podCount === 0) return;

    const s = this.objectScaleFactor || 0.72;

    pods.forEach((pod, i) => {
      let px = zoneCenter.x;
      let pz = zoneCenter.z;

      if (podCount > 1) {
        const angle = (i / podCount) * Math.PI * 2;
        const radius = Math.min(3.1, 1.15 + podCount * 0.28) * Math.max(0.75, s / 0.72);
        px = zoneCenter.x + Math.cos(angle) * radius;
        pz = zoneCenter.z + Math.sin(angle) * radius;
      }

      const status = pod.status || 'Running';
      const colorScheme = STATUS_COLORS[status] || STATUS_COLORS.Unknown;
      const isCrash = status === 'CrashLoopBackOff' || status === 'Failed';

      // Pod Group positioned on namespace territory (y = 0.52)
      const podGroup = new THREE.Group();
      podGroup.position.set(px, 0.52, pz);

      // 1. Inner Container (50% reduced height: 0.34 * s, Solid Hexagon rotated 30° so +Z is a flat face)
      const containerGeo = new THREE.CylinderGeometry(0.35 * s, 0.35 * s, 0.34 * s, 6);
      containerGeo.rotateY(Math.PI / 6);
      const containerMat = new THREE.MeshStandardMaterial({
        color: colorScheme.color,
        roughness: 0.35,
        metalness: 0.25,
        emissive: colorScheme.emissive,
        emissiveIntensity: isCrash ? 0.85 : 0.25,
      });
      const containerMesh = new THREE.Mesh(containerGeo, containerMat);
      containerMesh.position.y = 0.17 * s;
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

      // 2. Outer Pod Boundary (50% reduced height: 0.44 * s, Dashed Heptagon - radialSegments: 7)
      const podGeometry = new THREE.CylinderGeometry(0.58 * s, 0.58 * s, 0.44 * s, 7);
      const edges = new THREE.EdgesGeometry(podGeometry);
      const boundaryColor = isCrash ? 0xea4335 : status === 'Pending' ? 0xfbbc04 : 0x326ce5;
      const lineMaterial = new THREE.LineDashedMaterial({
        color: boundaryColor,
        linewidth: 2,
        scale: 1,
        dashSize: 0.18 * s,
        gapSize: 0.11 * s,
        transparent: true,
        opacity: isCrash ? 0.95 : 0.8,
      });
      const podBoundary = new THREE.LineSegments(edges, lineMaterial);
      podBoundary.computeLineDistances(); // Required for LineDashedMaterial
      containerMesh.add(podBoundary);

      // 3. Pulsing alert beacon for CrashLoopBackOff / Failed (50% reduced height: 0.52 * s)
      let alertBeacon = null;
      if (isCrash) {
        const beaconGeo = new THREE.CylinderGeometry(0.74 * s, 0.74 * s, 0.52 * s, 7);
        const beaconEdges = new THREE.EdgesGeometry(beaconGeo);
        const beaconMat = new THREE.LineBasicMaterial({
          color: 0xea4335,
          transparent: true,
          opacity: 0.65,
        });
        alertBeacon = new THREE.LineSegments(beaconEdges, beaconMat);
        containerMesh.add(alertBeacon);
      }

      // 3.5 Official K8s pod.svg Top-Cap Medallion (Aerial View) + Front-Face Medallion (Zoom-In View)
      // Flat hexagonal face at +Z is at z = 0.35 * cos(30°) * s = 0.3031 * s; frontZ = 0.318 * s sits cleanly in front!
      const statusShieldHex = isCrash ? '#ea4335' : status === 'Pending' ? '#fbbc04' : '#326ce5';
      const { topMedallion, frontMedallion } = createK8sSurfaceMedallions(
        'Pod',
        statusShieldHex,
        isCrash,
        {
          topRadius: 0.26 * s,
          topY: 0.176 * s,
          frontRadius: 0.145 * s,
          frontY: 0,
          frontZ: 0.318 * s,
        }
      );
      topMedallion.userData.nodeId = pod.id || pod.name;
      topMedallion.userData.name = pod.name;
      frontMedallion.userData.nodeId = pod.id || pod.name;
      frontMedallion.userData.name = pod.name;
      containerMesh.add(topMedallion);
      containerMesh.add(frontMedallion);
      this.iconSprites.push(topMedallion, frontMedallion);

      // Metadata on interactive mesh (containerMesh is raycast target)
      containerMesh.userData = {
        type: 'pod',
        kind: 'Pod',
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
        topMedallion: topMedallion,
        frontMedallion: frontMedallion,
        iconEmblem: frontMedallion,
      };

      if (isCrash) {
        this.crashPods.push(containerMesh);
      }

      // 4. Pod name billboard tag (sleek, compact label positioned just above low-profile pod)
      const shortPodName = pod.name.length > 24 ? pod.name.slice(0, 22) + '…' : pod.name;
      const subtitle = isCrash ? (pod.restarts > 0 ? `${pod.restarts} restarts` : 'CRASHING') : '';
      const nameSprite = createTextSprite(shortPodName, colorScheme.text, 12, subtitle);
      nameSprite.userData = {
        kind: 'Pod',
        nodeId: pod.id || pod.name,
        name: pod.name,
        isIncident: isCrash || status === 'Pending',
        isPlaque: false,
      };
      nameSprite.position.set(0, 0.32 + 0.24 * s, 0);
      podGroup.add(nameSprite);
      this.allLabelSprites.push(nameSprite);

      // Save references on userData for real-time remediation updates
      containerMesh.userData.nameSprite = nameSprite;
      containerMesh.userData.podGroup = podGroup;

      this.group.add(podGroup);
      this.podMeshes.push(containerMesh);
      if (pod.name) this.podMap.set(pod.name, containerMesh);
      if (pod.id) this.podMap.set(pod.id, containerMesh);
    });
  }

  _buildNamespaceResources(ns, zoneCenter, clusterName) {
    const resources = ns.resources || [];
    if (resources.length === 0) return;

    const s = this.objectScaleFactor || 0.72;

    // 50% reduced stratified vertical tier elevations
    const tierElevation = {
      ReplicaSet: 1.35,
      Deployment: 2.05,
      DaemonSet: 2.05,
      StatefulSet: 2.05,
      SparkApplication: 2.15,
      RayCluster: 2.15,
      Service: 2.8,
      HTTPRoute: 3.5,
      Gateway: 4.2,
    };

    const sorted = [...resources].sort(
      (a, b) => (tierElevation[a.kind] || 2.1) - (tierElevation[b.kind] || 2.1)
    );

    sorted.forEach((res, idx) => {
      const elevation = tierElevation[res.kind] || 2.1;
      const targets = [...(res.children_ids || []), ...(res.connected_to || [])];

      // Compute centroid of owned children if present
      let sumX = 0;
      let sumZ = 0;
      let matchCount = 0;
      targets.forEach((tid) => {
        const childMesh = this.podMap.get(tid) || this.resourceMap.get(tid);
        if (childMesh && childMesh.userData?.podGroup) {
          sumX += childMesh.userData.podGroup.position.x;
          sumZ += childMesh.userData.podGroup.position.z;
          matchCount++;
        }
      });

      let rx = zoneCenter.x;
      let rz = zoneCenter.z;
      if (matchCount > 0) {
        rx = sumX / matchCount;
        rz = sumZ / matchCount;
      } else {
        const angle = (idx / Math.max(1, sorted.length)) * Math.PI * 2;
        rx = zoneCenter.x + Math.cos(angle) * 2.1;
        rz = zoneCenter.z + Math.sin(angle) * 2.1;
      }

      const resGroup = new THREE.Group();
      resGroup.position.set(rx, elevation, rz);

      const isDegraded =
        res.status === 'Degraded' || res.status === 'Pending' || res.status === 'CrashLoopBackOff';
      let colorHex = 0x6366f1;
      let textColor = '#818cf8';
      let geo = null;
      let radialSegments = 8;

      switch (res.kind) {
        case 'ReplicaSet':
          colorHex = isDegraded ? 0xf59e0b : 0x6366f1;
          textColor = isDegraded ? '#fbbf24' : '#818cf8';
          radialSegments = 6;
          geo = new THREE.CylinderGeometry(0.36 * s, 0.36 * s, 0.22 * s, radialSegments);
          break;
        case 'Deployment':
          colorHex = isDegraded ? 0xea4335 : 0xa855f7;
          textColor = isDegraded ? '#f87171' : '#c084fc';
          radialSegments = 8;
          geo = new THREE.CylinderGeometry(0.42 * s, 0.42 * s, 0.24 * s, radialSegments);
          break;
        case 'DaemonSet':
          colorHex = 0x14b8a6;
          textColor = '#2dd4bf';
          radialSegments = 8;
          geo = new THREE.CylinderGeometry(0.38 * s, 0.38 * s, 0.22 * s, radialSegments);
          break;
        case 'StatefulSet':
          colorHex = 0x3b82f6;
          textColor = '#60a5fa';
          radialSegments = 8;
          geo = new THREE.CylinderGeometry(0.38 * s, 0.38 * s, 0.26 * s, radialSegments);
          break;
        case 'Service':
          colorHex = 0x06b6d4;
          textColor = '#22d3ee';
          radialSegments = 6;
          geo = new THREE.CylinderGeometry(0.38 * s, 0.38 * s, 0.22 * s, radialSegments);
          break;
        case 'HTTPRoute':
          colorHex = 0xec4899;
          textColor = '#f472b6';
          radialSegments = 6;
          geo = new THREE.CylinderGeometry(0.42 * s, 0.42 * s, 0.18 * s, radialSegments);
          break;
        case 'Gateway':
          colorHex = 0xf59e0b;
          textColor = '#fbbf24';
          radialSegments = 8;
          geo = new THREE.CylinderGeometry(0.46 * s, 0.46 * s, 0.22 * s, radialSegments);
          break;
        default:
          colorHex = 0xf43f5e;
          textColor = '#fb7185';
          radialSegments = 8;
          geo = new THREE.CylinderGeometry(0.38 * s, 0.38 * s, 0.22 * s, radialSegments);
          break;
      }

      // Rotate cylinder by half a segment so +Z is always a flat face (never a sharp vertical ridge)
      geo.rotateY(Math.PI / radialSegments);

      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.3,
        metalness: 0.45,
        emissive: colorHex,
        emissiveIntensity: isDegraded ? 0.65 : 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      resGroup.add(mesh);

      // Wireframe rim
      const edgeGeo = new THREE.EdgesGeometry(geo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.32,
      });
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));

      // Official K8s SVG Top-Cap Medallion (Aerial View) + Front-Face Medallion (Zoom-In View)
      const shieldHex = isDegraded ? '#ea4335' : textColor;
      const halfH = (geo.parameters?.height || 0.22 * s) / 2;
      const rad = geo.parameters?.radiusTop || 0.38 * s;
      const flatFrontZ = rad * Math.cos(Math.PI / radialSegments);
      const { topMedallion, frontMedallion } = createK8sSurfaceMedallions(
        res.kind,
        shieldHex,
        isDegraded,
        {
          topRadius: rad * 0.78,
          topY: halfH + 0.01,
          frontRadius: Math.min(halfH * 0.92, 0.14 * s),
          frontY: 0,
          frontZ: flatFrontZ + 0.015 * s,
        }
      );
      topMedallion.userData.nodeId = res.id || res.name;
      topMedallion.userData.name = res.name;
      frontMedallion.userData.nodeId = res.id || res.name;
      frontMedallion.userData.name = res.name;
      resGroup.add(topMedallion);
      resGroup.add(frontMedallion);
      this.iconSprites.push(topMedallion, frontMedallion);

      const kindPrefixes = {
        ReplicaSet: 'RS',
        Deployment: 'DEPLOY',
        DaemonSet: 'DS',
        StatefulSet: 'STS',
        SparkApplication: 'SPARK',
        RayCluster: 'RAY',
        Service: 'SVC',
        HTTPRoute: 'ROUTE',
        Gateway: 'GW',
      };
      const prefix = kindPrefixes[res.kind] || res.kind;
      const shortName = res.name.length > 22 ? res.name.slice(0, 20) + '…' : res.name;
      const labelText = `${prefix} ${shortName}`;
      const sprite = createTextSprite(
        labelText,
        textColor,
        12,
        isDegraded ? res.status || 'DEGRADED' : ''
      );
      sprite.userData = {
        kind: res.kind,
        nodeId: res.id || res.name,
        name: res.name,
        isIncident: isDegraded,
        isPlaque: false,
      };
      sprite.position.set(0, halfH + 0.22, 0);
      resGroup.add(sprite);
      this.allLabelSprites.push(sprite);

      mesh.userData = {
        type: 'resource',
        kind: res.kind,
        resource: res,
        pod: {
          id: res.id || res.name,
          name: res.name,
          namespace: ns.name,
          cluster: clusterName,
          status: res.status || 'Healthy',
          kind: res.kind,
          owner_id: res.owner_id,
          children_ids: res.children_ids || res.connected_to || [],
        },
        namespaceName: ns.name,
        clusterName: clusterName,
        podGroup: resGroup,
        containerMesh: mesh,
        nameSprite: sprite,
        topMedallion: topMedallion,
        frontMedallion: frontMedallion,
        iconEmblem: frontMedallion,
      };

      this.group.add(resGroup);
      this.resourceMeshes.push(mesh);
      this.podMeshes.push(mesh); // Allow raycaster selection of controllers/gateways
      if (res.id) {
        this.resourceMap.set(res.id, mesh);
        if (!this.podMap.has(res.id)) {
          this.podMap.set(res.id, mesh);
        }
      }
      if (res.name) {
        this.resourceMap.set(res.name, mesh);
        if (!this.podMap.has(res.name)) {
          this.podMap.set(res.name, mesh);
        }
      }
    });
  }

  _buildOwnershipBeams() {
    const beamColors = {
      ReplicaSet: 0x818cf8,
      Deployment: 0xc084fc,
      DaemonSet: 0x2dd4bf,
      StatefulSet: 0x60a5fa,
      Service: 0x22d3ee,
      HTTPRoute: 0xf472b6,
      Gateway: 0xfbbf24,
    };

    for (const resMesh of this.resourceMeshes) {
      const res = resMesh.userData?.resource;
      if (!res) continue;

      const targets = res.children_ids?.length ? res.children_ids : res.connected_to || [];
      const colorHex = beamColors[res.kind] || 0x94a3b8;

      targets.forEach((targetId) => {
        const childMesh = this.podMap.get(targetId) || this.resourceMap.get(targetId);
        if (!childMesh || !childMesh.userData?.podGroup || !resMesh.userData?.podGroup) return;

        const start = resMesh.userData.podGroup.position.clone();
        const end = childMesh.userData.podGroup.position.clone();
        if (childMesh.userData.type === 'pod') {
          end.y += 0.34 * (this.objectScaleFactor || 0.72);
        }

        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
        const mat = new THREE.LineBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.48,
        });
        const line = new THREE.Line(geo, mat);
        this.group.add(line);

        this.ownershipBeams.push({
          line,
          parentId: res.id || res.name,
          childId: targetId,
          parentKind: res.kind,
          originalColor: colorHex,
          originalOpacity: 0.48,
        });
      });
    }
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
        start.y += 0.5;

        const end = new THREE.Vector3();
        toMesh.getWorldPosition(end);
        end.y += 0.5;

        const conduit = this._createCurve(start, end, color, from, to);
        if (!this.podConduits.has(to)) {
          this.podConduits.set(to, []);
        }
        this.podConduits.get(to).push(conduit);
      }
    });
  }

  _createCurve(start, end, colorHex, from, to) {
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.y += 1.4;

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
    const particles = [];
    const particleCount = 3;
    const startIndex = this.curveParticles.length;
    for (let i = 0; i < particleCount; i++) {
      const pGeo = new THREE.SphereGeometry(0.08, 8, 8);
      const pMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.85,
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      this.group.add(pMesh);
      particles.push(pMesh);

      this.curveParticles.push({
        mesh: pMesh,
        curve: curve,
        offset: i / particleCount,
        conduit: null,
      });
    }

    const conduit = {
      line,
      particles,
      from,
      to,
      originalColor: colorHex,
      originalOpacity: 0.5,
      flowSpeedFactor: 1.0,
    };
    for (let i = startIndex; i < this.curveParticles.length; i++) {
      this.curveParticles[i].conduit = conduit;
    }
    this.conduits.push(conduit);

    return conduit;
  }

  /**
   * Updates animations for glowing nodes, crash beacons, dependency flow, and LOD culling.
   * @param {number} time
   * @param {THREE.Camera} [camera]
   */
  update(time, camera) {
    this._lastCamera = camera || this._lastCamera;

    // 1. Live FPS telemetry calculation
    const now = performance.now();
    const delta = now - this._lastFrameTime;
    this._lastFrameTime = now;
    if (delta > 0 && delta < 500) {
      const instFps = 1000 / delta;
      this._frameSamples.push(instFps);
      if (this._frameSamples.length > 30) {
        this._frameSamples.shift();
      }
      const avg = this._frameSamples.reduce((acc, v) => acc + v, 0) / this._frameSamples.length;
      this.stats.fps = Math.min(60, Math.round(avg));
    }

    // 2. Smart contextual & distance-based LOD label visibility
    this._applyLabelVisibility(camera || this._lastCamera);

    // 3. Subtle idle rotation of dashed heptagonal boundary and resource controllers
    for (const mesh of this.podMeshes) {
      if (mesh.userData && mesh.userData.podBoundary) {
        mesh.userData.podBoundary.rotation.y = time * 0.0006;
      } else if (mesh.userData && mesh.userData.type === 'resource') {
        mesh.rotation.y = time * 0.0008;
      }
    }

    // 4. Pulse crash beacons
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

    // 5. Animate data flow particles along conduits, respecting traffic drain
    for (const p of this.curveParticles) {
      const speedFactor = p.conduit?.flowSpeedFactor ?? 1.0;
      if (speedFactor <= 0.05) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.visible = true;
      const progress = (time * 0.00035 * speedFactor + p.offset) % 1;
      const pos = p.curve.getPoint(progress);
      p.mesh.position.copy(pos);
    }

    // 6. Rotate active 3D selection targeting reticle
    if (this.selectionReticle) {
      this.selectionReticle.rotation.z = time * 0.0018;
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
    if (targetMesh.userData.pod) {
      targetMesh.userData.pod.status = status;
    }

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
      const s = this.objectScaleFactor || 0.72;
      const newSprite = createTextSprite(targetMesh.userData.pod.name, '#34a853', 12, 'Running');
      newSprite.position.set(0, 0.32 + 0.24 * s, 0);
      targetMesh.userData.podGroup.add(newSprite);
      targetMesh.userData.nameSprite = newSprite;
    }

    // Transition incoming dependency conduits to healthy Google Green
    const podName = targetMesh.userData.pod ? targetMesh.userData.pod.name : podId;
    const conduits = this.podConduits.get(podName) || this.podConduits.get(podId) || [];
    for (const conduit of conduits) {
      if (conduit.line && conduit.line.material) {
        conduit.line.material.color.setHex(0x34a853);
        conduit.line.material.opacity = 0.65;
      }
      for (const pMesh of conduit.particles || []) {
        if (pMesh.material) {
          pMesh.material.color.setHex(0x34a853);
        }
      }
    }

    const clusterName = targetMesh.userData.clusterName;
    const nsName = targetMesh.userData.namespaceName;

    // Check if any pods remain failing in this namespace
    const nsHasCrashing = this.podMeshes.some(
      (m) =>
        m.userData.clusterName === clusterName &&
        m.userData.namespaceName === nsName &&
        (m.userData.isCrashLoop ||
          (m.userData.pod &&
            (m.userData.pod.status === 'CrashLoopBackOff' || m.userData.pod.status === 'Failed')))
    );

    if (!nsHasCrashing) {
      const nsKey = `${clusterName}/${nsName}`;
      const nsPlaque = this.namespacePlaques.get(nsKey);
      if (nsPlaque) {
        if (nsPlaque.rimLine && nsPlaque.rimLine.material) {
          nsPlaque.rimLine.material.color.setHex(0x4285f4);
          nsPlaque.rimLine.material.opacity = 0.75;
        }
        if (nsPlaque.sprite) {
          this.group.remove(nsPlaque.sprite);
          if (nsPlaque.sprite.material) {
            if (nsPlaque.sprite.material.map) {
              nsPlaque.sprite.material.map.dispose();
            }
            nsPlaque.sprite.material.dispose();
          }
          const newNsSprite = createTextSprite(`ns: ${nsName}`, '#8ab4f8', 14, '');
          newNsSprite.position.set(nsPlaque.zoneCenter.x, 0.88, nsPlaque.zoneCenter.z - 4.4);
          this.group.add(newNsSprite);
          nsPlaque.sprite = newNsSprite;
        }
      }
    }

    // Check if any pods remain failing in this entire cluster
    const clusterHasCrashing = this.podMeshes.some(
      (m) =>
        m.userData.clusterName === clusterName &&
        (m.userData.isCrashLoop ||
          (m.userData.pod &&
            (m.userData.pod.status === 'CrashLoopBackOff' || m.userData.pod.status === 'Failed')))
    );

    if (!clusterHasCrashing) {
      // Transition cluster monolith LED slit to Google Green
      const slitMesh = this.clusterSlits.get(clusterName);
      if (slitMesh && slitMesh.material) {
        slitMesh.material.color.setHex(0x34a853);
        slitMesh.material.emissive.setHex(0x34a853);
        slitMesh.material.emissiveIntensity = 1.0;
      }

      // Transition cluster plaque billboard to HEALTHY Google Green
      const plaqueEntry = this.clusterPlaques.get(clusterName);
      if (plaqueEntry && plaqueEntry.sprite && plaqueEntry.group) {
        plaqueEntry.group.remove(plaqueEntry.sprite);
        if (plaqueEntry.sprite.material) {
          if (plaqueEntry.sprite.material.map) {
            plaqueEntry.sprite.material.map.dispose();
          }
          plaqueEntry.sprite.material.dispose();
        }
        const newClusterSprite = createTextSprite(clusterName, '#34a853', 18, 'HEALTHY');
        newClusterSprite.position.set(0, 2.35, 0);
        plaqueEntry.group.add(newClusterSprite);
        plaqueEntry.sprite = newClusterSprite;
      }
    }

    // Reset any active blast radius on resolution
    this.clearBlastRadius();
  }

  /**
   * Highlights the blast radius (upstream callers and downstream dependencies) in Google Amber (#FBBC04).
   * @param {string} targetPodId
   */
  highlightBlastRadius(targetPodId) {
    if (!targetPodId) return;
    this.clearBlastRadius();

    let normalized = targetPodId;
    for (const key of this.podMap.keys()) {
      if (typeof key === 'string' && (key.includes(targetPodId) || targetPodId.includes(key))) {
        normalized = key;
        break;
      }
    }

    for (const conduit of this.conduits) {
      const fromMatch =
        conduit.from && (conduit.from.includes(normalized) || normalized.includes(conduit.from));
      const toMatch =
        conduit.to && (conduit.to.includes(normalized) || normalized.includes(conduit.to));

      if (fromMatch || toMatch) {
        this.blastRadiusConduits.add(conduit);
        if (conduit.line && conduit.line.material) {
          conduit.line.material.color.setHex(0xfbbc04);
          conduit.line.material.opacity = 0.9;
        }
        for (const p of conduit.particles) {
          if (p.material) {
            p.material.color.setHex(0xfbbc04);
          }
        }

        const otherPodName = fromMatch ? conduit.to : conduit.from;
        let otherMesh = this.podMap.get(otherPodName);
        if (!otherMesh) {
          for (const [k, m] of this.podMap.entries()) {
            if (typeof k === 'string' && (k.includes(otherPodName) || otherPodName.includes(k))) {
              otherMesh = m;
              break;
            }
          }
        }

        const targetMesh = this.podMap.get(normalized);
        if (otherMesh && otherMesh !== targetMesh) {
          this.blastRadiusPods.add(otherMesh);
          if (otherMesh.userData.podBoundary && otherMesh.userData.podBoundary.material) {
            otherMesh.userData.podBoundary.material.color.setHex(0xfbbc04);
            otherMesh.userData.podBoundary.material.opacity = 1.0;
          }
        }
      }
    }
  }

  /**
   * Clears active blast radius highlighting and restores default colors.
   */
  clearBlastRadius() {
    for (const mesh of this.blastRadiusPods) {
      if (mesh.userData && mesh.userData.podBoundary && mesh.userData.podBoundary.material) {
        const isCrash =
          mesh.userData.isCrashLoop ||
          (mesh.userData.pod &&
            (mesh.userData.pod.status === 'CrashLoopBackOff' ||
              mesh.userData.pod.status === 'Failed'));
        mesh.userData.podBoundary.material.color.setHex(isCrash ? 0xea4335 : 0x326ce5);
        mesh.userData.podBoundary.material.opacity = 0.8;
      }
    }
    this.blastRadiusPods.clear();

    for (const conduit of this.blastRadiusConduits) {
      if (conduit.line && conduit.line.material) {
        conduit.line.material.color.setHex(conduit.originalColor || 0x4285f4);
        conduit.line.material.opacity = conduit.originalOpacity || 0.5;
      }
      for (const p of conduit.particles) {
        if (p.material) {
          p.material.color.setHex(conduit.originalColor || 0x4285f4);
        }
      }
    }
    this.blastRadiusConduits.clear();
  }

  /**
   * Sets traffic drain percentage (0 - 100) for incoming conduits to a pod.
   * @param {string} podId
   * @param {number} percent
   */
  setTrafficDrain(podId, percent) {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    this.trafficDrainMap.set(podId, p);
    const drainFactor = p / 100;

    let targetConduits = this.podConduits.get(podId);
    if (!targetConduits) {
      for (const [key, conduits] of this.podConduits.entries()) {
        if (typeof key === 'string' && (key.includes(podId) || podId.includes(key))) {
          targetConduits = conduits;
          break;
        }
      }
    }

    if (targetConduits) {
      for (const conduit of targetConduits) {
        conduit.flowSpeedFactor = drainFactor;
        if (conduit.line && conduit.line.material) {
          conduit.line.material.opacity = 0.12 + drainFactor * 0.55;
        }
      }
    }
  }

  /**
   * Renders a glowing 3D selection targeting reticle around the selected pod.
   * @param {string} podId
   */
  setSelectedPod(podId) {
    this.clearSelectedPod();
    if (!podId) return;

    let targetMesh = this.podMap.get(podId);
    if (!targetMesh) {
      for (const [key, mesh] of this.podMap.entries()) {
        if (typeof key === 'string' && (key.includes(podId) || podId.includes(key))) {
          targetMesh = mesh;
          break;
        }
      }
    }

    if (!targetMesh || !targetMesh.userData || !targetMesh.userData.podGroup) return;

    this.selectedPodMesh = targetMesh;
    const isCrash =
      targetMesh.userData.isCrashLoop ||
      (targetMesh.userData.pod &&
        (targetMesh.userData.pod.status === 'CrashLoopBackOff' ||
          targetMesh.userData.pod.status === 'Failed'));

    const ringColor = isCrash ? 0xea4335 : 0x4285f4;
    const reticleGroup = new THREE.Group();
    const s = this.objectScaleFactor || 0.72;

    const outerGeo = new THREE.RingGeometry(0.95 * s, 1.08 * s, 32);
    const outerMat = new THREE.MeshBasicMaterial({
      color: ringColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);
    reticleGroup.add(outerRing);

    const innerGeo = new THREE.RingGeometry(0.78 * s, 0.85 * s, 6);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const innerRing = new THREE.Mesh(innerGeo, innerMat);
    reticleGroup.add(innerRing);

    reticleGroup.rotation.x = -Math.PI / 2;
    reticleGroup.position.set(0, -0.35 * s, 0);

    targetMesh.userData.podGroup.add(reticleGroup);
    this.selectionReticle = reticleGroup;

    // Automatically highlight vertical/horizontal ownership chain on selection
    this.highlightOwnershipChain(podId);
  }

  /**
   * Removes the active 3D selection targeting reticle.
   */
  clearSelectedPod() {
    if (this.selectionReticle) {
      if (this.selectionReticle.parent) {
        this.selectionReticle.parent.remove(this.selectionReticle);
      }
      this.selectionReticle.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.selectionReticle = null;
    }
    this.selectedPodMesh = null;
    this.clearOwnershipHighlight();
  }

  /**
   * Sets 3D label visibility mode ('hover-trouble' | 'smart' | 'all' | 'off' | 'minimal').
   * @param {string} mode
   */
  setLabelMode(mode = 'hover-trouble') {
    this.labelMode = mode || 'hover-trouble';
    this.stats.labelMode = this.labelMode;
    this._applyLabelVisibility(this._lastCamera);
  }

  /**
   * Updates the currently hovered 3D node from pointer flyover raycasting.
   * Immediately reveals the hovered node's label and its connected vertical ownership chain.
   * @param {object|null} userData
   */
  setHoveredNode(userData) {
    if (!userData) {
      this.hoveredNodeId = null;
      this.hoveredChainIds.clear();
      this._updateBeamHighlights();
      this._applyLabelVisibility(this._lastCamera);
      return;
    }

    const podObj = userData.pod || userData.resource || userData;
    const nodeId = podObj.id || podObj.name || null;
    this.hoveredNodeId = nodeId;
    this.hoveredChainIds = nodeId ? this._computeChainIds(nodeId) : new Set();
    this._updateBeamHighlights();
    this._applyLabelVisibility(this._lastCamera);
  }

  /**
   * Computes the set of node IDs and names in the vertical ownership chain for a given target ID.
   * @param {string} targetId
   * @returns {Set<string>}
   */
  _computeChainIds(targetId) {
    const chainIds = new Set();
    if (!targetId) return chainIds;

    let startMesh = this.podMap.get(targetId) || this.resourceMap.get(targetId);
    if (!startMesh) {
      for (const [key, mesh] of this.podMap.entries()) {
        if (typeof key === 'string' && (key.includes(targetId) || targetId.includes(key))) {
          startMesh = mesh;
          break;
        }
      }
    }
    if (!startMesh || !startMesh.userData) return chainIds;

    const visitedUp = new Set();
    const addNodeAndAncestors = (mesh) => {
      if (!mesh || !mesh.userData || visitedUp.has(mesh)) return;
      visitedUp.add(mesh);
      const podObj = mesh.userData.pod || {};
      const id = podObj.id || podObj.name;
      if (id) chainIds.add(id);
      if (podObj.name) chainIds.add(podObj.name);
      if (podObj.owner_id) {
        chainIds.add(podObj.owner_id);
        const parentMesh =
          this.resourceMap.get(podObj.owner_id) || this.podMap.get(podObj.owner_id);
        if (parentMesh && parentMesh !== mesh) {
          addNodeAndAncestors(parentMesh);
        }
      }
    };

    const visitedDown = new Set();
    const addNodeAndDescendants = (mesh) => {
      if (!mesh || !mesh.userData || visitedDown.has(mesh)) return;
      visitedDown.add(mesh);
      const podObj = mesh.userData.pod || {};
      const children = podObj.children_ids || [];
      children.forEach((cid) => {
        chainIds.add(cid);
        const childMesh = this.podMap.get(cid) || this.resourceMap.get(cid);
        if (childMesh && childMesh !== mesh) {
          addNodeAndDescendants(childMesh);
        }
      });
    };

    addNodeAndAncestors(startMesh);
    addNodeAndDescendants(startMesh);
    return chainIds;
  }

  _updateBeamHighlights() {
    const combinedChain = new Set([...this.activeChainIds, ...this.hoveredChainIds]);
    const hasHighlight = combinedChain.size > 1;

    for (const beam of this.ownershipBeams) {
      if (!beam.line || !beam.line.material) continue;
      if (!hasHighlight) {
        beam.line.material.color.setHex(beam.originalColor);
        beam.line.material.opacity = beam.originalOpacity;
      } else {
        const inChain = combinedChain.has(beam.parentId) && combinedChain.has(beam.childId);
        beam.line.material.color.setHex(inChain ? 0x38bdf8 : beam.originalColor);
        beam.line.material.opacity = inChain ? 0.95 : 0.14;
      }
    }
  }

  /**
   * Evaluates smart contextual label visibility, pointer flyover hover, and zoom distance across all 3D sprites.
   * @param {THREE.Camera} [camera]
   */
  _applyLabelVisibility(camera) {
    const worldPos = new THREE.Vector3();
    const intermediateKinds = new Set(['ReplicaSet', 'DaemonSet', 'Service', 'HTTPRoute']);

    if (camera) {
      const originDist = camera.position.length();
      if (originDist > 75) {
        this.stats.zoomBand = 'Macro';
      } else if (originDist > 35) {
        this.stats.zoomBand = 'Cluster';
      } else if (originDist > 18) {
        this.stats.zoomBand = 'Namespace';
      } else {
        this.stats.zoomBand = 'Micro';
      }
    }

    // Manage Official K8s SVG Icon Emblem visibility across semantic zoom bands
    for (const icon of this.iconSprites) {
      if (!icon || !icon.parent) continue;
      if (!icon.parent.visible) {
        icon.visible = false;
        continue;
      }
      if (camera) {
        icon.getWorldPosition(worldPos);
        const iconDist = camera.position.distanceTo(worldPos);
        const isPod = icon.userData?.kind === 'Pod';
        const isInc = Boolean(icon.userData?.isIncident);
        icon.visible = isInc || !isPod || iconDist < 65;
      } else {
        icon.visible = true;
      }
    }

    for (const sprite of this.allLabelSprites) {
      if (!sprite || !sprite.parent) continue;
      if (!sprite.parent.visible) {
        sprite.visible = false;
        continue;
      }

      const data = sprite.userData || {};
      if (data.isPlaque) {
        sprite.visible = true;
        continue;
      }

      const isSelected = Boolean(
        this.selectedPodMesh && this.selectedPodMesh.userData?.nameSprite === sprite
      );
      const isHovered = Boolean(
        this.hoveredNodeId &&
        (data.nodeId === this.hoveredNodeId || data.name === this.hoveredNodeId)
      );
      const inChain = Boolean(
        (data.nodeId &&
          (this.activeChainIds.has(data.nodeId) || this.hoveredChainIds.has(data.nodeId))) ||
        (data.name && (this.activeChainIds.has(data.name) || this.hoveredChainIds.has(data.name)))
      );
      const isIncident = Boolean(data.isIncident);

      let dist = 28;
      if (camera) {
        sprite.getWorldPosition(worldPos);
        dist = camera.position.distanceTo(worldPos);
      }

      // 1. 'off': Disable all node labels except active pointer flyover hover
      if (this.labelMode === 'off') {
        sprite.visible = isHovered || isSelected;
        continue;
      }

      // 2. 'hover-trouble' (Default) or 'minimal':
      // Show resources in trouble (CrashLoopBackOff / Degraded / Pending), active flyover/selection chains,
      // OR when the camera is zoomed in close (dist < 18 world units)
      if (this.labelMode === 'hover-trouble' || this.labelMode === 'minimal') {
        const isZoomedInClose = dist < 18;
        sprite.visible = isIncident || isHovered || isSelected || inChain || isZoomedInClose;
        continue;
      }

      // 3. 'all': Show all labels within distance LOD
      if (this.labelMode === 'all') {
        const maxDist = this.stats.totalObjects > 300 ? 52 : 85;
        sprite.visible = dist < maxDist || isIncident || isHovered || isSelected || inChain;
        continue;
      }

      // 4. 'smart': Show incidents, hovered/selected chains, and close primary workloads
      if (isIncident || isHovered || isSelected || inChain) {
        sprite.visible = true;
        continue;
      }

      if (this.activeLayerFilter === 'hierarchy' || this.activeLayerFilter === 'networking') {
        sprite.visible = dist < 44;
        continue;
      }

      if (intermediateKinds.has(data.kind)) {
        sprite.visible = dist < 18;
      } else {
        const maxSmartDist = this.stats.totalObjects > 250 ? 28 : 36;
        sprite.visible = dist < maxSmartDist;
      }
    }
  }

  /**
   * Filters visible 3D stack tiers ('all' | 'hierarchy' | 'networking' | 'pods').
   * @param {string} mode
   */
  setLayerFilter(mode = 'all') {
    this.activeLayerFilter = mode || 'all';
    this.stats.activeLayer = this.activeLayerFilter;

    const hierarchyKinds = new Set([
      'Deployment',
      'ReplicaSet',
      'DaemonSet',
      'StatefulSet',
      'SparkApplication',
      'RayCluster',
    ]);
    const networkingKinds = new Set(['Gateway', 'HTTPRoute', 'Service']);

    for (const mesh of this.podMeshes) {
      if (!mesh.userData) continue;
      const kind = mesh.userData.kind || 'Pod';
      let visible = true;

      if (this.activeLayerFilter === 'pods') {
        visible = kind === 'Pod';
      } else if (this.activeLayerFilter === 'hierarchy') {
        visible = kind === 'Pod' || hierarchyKinds.has(kind);
      } else if (this.activeLayerFilter === 'networking') {
        visible = kind === 'Pod' || networkingKinds.has(kind);
      }

      if (mesh.userData.podGroup) {
        mesh.userData.podGroup.visible = visible;
      } else {
        mesh.visible = visible;
      }
    }

    for (const beam of this.ownershipBeams) {
      if (!beam.line) continue;
      if (this.activeLayerFilter === 'pods') {
        beam.line.visible = false;
      } else if (this.activeLayerFilter === 'hierarchy') {
        beam.line.visible = hierarchyKinds.has(beam.parentKind);
      } else if (this.activeLayerFilter === 'networking') {
        beam.line.visible = networkingKinds.has(beam.parentKind);
      } else {
        beam.line.visible = true;
      }
    }

    this._applyLabelVisibility(this._lastCamera);
  }

  /**
   * Highlights the vertical ownership and traffic chain connected to a target node.
   * @param {string} targetId
   */
  highlightOwnershipChain(targetId) {
    this.clearOwnershipHighlight();
    if (!targetId) return;

    this.activeChainIds = this._computeChainIds(targetId);
    this._updateBeamHighlights();
    this._applyLabelVisibility(this._lastCamera);
  }

  clearOwnershipHighlight() {
    this.activeChainIds.clear();
    this._updateBeamHighlights();
    this._applyLabelVisibility(this._lastCamera);
  }

  /**
   * Returns live FPS, object counts, and active 3D layer stats.
   * @returns {{fps: number, totalObjects: number, clusterCount: number, podCount: number, resourceCount: number, activeLayer: string}}
   */
  getPerformanceStats() {
    return { ...this.stats };
  }

  /**
   * Highlights 3D pods matching the predicate and dims non-matching pods.
   *
   * @param {function(object, object): boolean} predicateFn - Returns true if pod should stay highlighted.
   */
  highlightPodsByFilter(predicateFn) {
    if (typeof predicateFn !== 'function') return;
    for (const mesh of this.podMeshes) {
      if (!mesh || !mesh.userData) continue;
      const matches = Boolean(predicateFn(mesh.userData.pod || {}, mesh.userData));
      if (mesh.material) {
        mesh.material.transparent = true;
        mesh.material.opacity = matches ? 1.0 : 0.22;
      }
      if (mesh.userData.nameSprite && mesh.userData.nameSprite.material) {
        mesh.userData.nameSprite.material.opacity = matches ? 1.0 : 0.3;
      }
    }
  }

  /**
   * Restores all 3D pods to full opacity after spatial scene filtering.
   */
  clearFilterHighlight() {
    for (const mesh of this.podMeshes) {
      if (!mesh) continue;
      if (mesh.material) {
        mesh.material.opacity = 1.0;
      }
      if (mesh.userData && mesh.userData.nameSprite && mesh.userData.nameSprite.material) {
        mesh.userData.nameSprite.material.opacity = 1.0;
      }
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
    this.clearSelectedPod();
    this.clearFilterHighlight();
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
    this.resourceMeshes = [];
    this.crashPods = [];
    this.clusterMonoliths = [];
    this.curveParticles = [];
    this.ownershipBeams = [];
    this.allLabelSprites = [];
    this.iconSprites = [];
    this.conduits = [];
    this.blastRadiusPods.clear();
    this.blastRadiusConduits.clear();
    this.trafficDrainMap.clear();
    this.podMap.clear();
    this.resourceMap.clear();
    this.clusterPositions.clear();
    this.clusterPlaques.clear();
    this.clusterSlits.clear();
    this.namespacePlaques.clear();
    this.podConduits.clear();
  }
}
