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
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { hex, classColor, routerPalette } from './themes.js';
import { materializePodAt, VISUAL_CLASSES } from './mock-data.js';
import {
  planFleetOverview,
  planClusterDecks,
  bundleControls,
  createDeckOffsets,
  applyDeckMove,
} from './decks-plan.js';

export class DecksScene {
  constructor(canvas, labelsRoot, theme, callbacks = {}) {
    this.canvas = canvas;
    this.labelsRoot = labelsRoot;
    this.theme = theme;
    this.callbacks = callbacks;

    this.viewMode = 'cluster'; // 'fleet' | 'cluster'
    this.layoutMode = '3-deck'; // '3-deck' | '2-deck' | 'combined'
    this.bottomMode = 'namespaces'; // 'namespaces' | 'nodes'
    this.beamsMode = 'focus'; // 'focus' | 'all'
    this.labelsMode = 'auto'; // 'auto' | 'all' | 'off'
    this.soloDeck = null; // null | 'ingress' | 'pods' | 'controllers'
    this.decksLinked = true;
    this.drillFilter = null; // null | { type: 'namespace' | 'controller', key, label }

    this.offsets = createDeckOffsets();
    this.targetOffsets = createDeckOffsets();

    this.filterState = null;
    this.filterNamespace = '';
    this.filterSearch = '';

    this.hoveredItem = null; // { type: 'pod'|'controller'|'node'|'ingress'|'cluster'|'namespace', key, data }
    this.selectedItem = null;

    this.pickables = [];
    this.rimPickables = [];
    this.deckGroups = new Map();
    this.htmlLabels = [];
    this.animatedMeshes = [];
    this.flowPulses = [];
    this.podInstancedMeshes = null;

    this.dragDeckState = null;
    this.pointerDownPos = { x: 0, y: 0 };

    this.initThree();
    this.bindEvents();
    this.startLoop();
  }

  initThree() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 950);
    this.camera.position.set(0, 36, 56);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 320;

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x07111f, 0.95);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.35);
    this.sunLight.position.set(28, 55, 34);
    this.scene.add(this.ambientLight, this.hemiLight, this.sunLight);

    this.gridHelper = new THREE.GridHelper(320, 64, 0x2ee6d6, 0x2ee6d6);
    this.gridHelper.position.y = -24;
    this.gridHelper.material.transparent = true;
    this.gridHelper.material.opacity = 0.16;
    this.scene.add(this.gridHelper);

    this.rootGroup = new THREE.Group();
    this.beamsGroup = new THREE.Group();
    this.scene.add(this.rootGroup);
    this.scene.add(this.beamsGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.applyThemeToScene();
  }

  applyThemeToScene() {
    const t = this.theme;
    this.scene.background = new THREE.Color(t.scene.background);
    this.scene.fog = new THREE.FogExp2(t.scene.fog, t.scene.fogDensity * 0.5);

    this.ambientLight.color.set(t.light.ambient);
    this.ambientLight.intensity = t.light.ambientIntensity;
    this.hemiLight.color.set(t.light.hemiSky);
    this.hemiLight.groundColor.set(t.light.hemiGround);
    this.hemiLight.intensity = t.light.hemiIntensity;
    this.sunLight.color.set(t.light.sun);
    this.sunLight.intensity = t.light.sunIntensity;

    if (this.gridHelper) {
      this.gridHelper.material.color.set(t.scene.grid);
      this.gridHelper.material.opacity = t.scene.gridAlpha * 0.65;
    }
  }

  setTheme(theme) {
    this.theme = theme;
    this.applyThemeToScene();
    this.rebuild();
  }

  setData(fleet, activeClusterName) {
    this.fleet = fleet;
    const nextCluster =
      fleet.clusters.find((c) => c.name === activeClusterName) || fleet.clusters[0];
    const prevPodCount = this.activeCluster?.podCount ?? this.activeCluster?.pods?.length ?? 0;
    const nextPodCount = nextCluster?.podCount ?? nextCluster?.pods?.length ?? 0;
    const scaleShifted = Math.abs(nextPodCount - prevPodCount) > 500;
    if (this.activeCluster?.name !== nextCluster?.name) {
      this.drillFilter = null;
      this.callbacks.onDrillChanged?.(null);
    }
    this.activeCluster = nextCluster;
    this.rebuild();
    if (scaleShifted) {
      this.homeCamera();
    }
  }

  setViewMode(mode, clusterName = null) {
    this.viewMode = mode;
    if (clusterName && this.fleet) {
      const found = this.fleet.clusters.find((c) => c.name === clusterName);
      if (found) {
        if (this.activeCluster?.name !== found.name) {
          this.drillFilter = null;
          this.callbacks.onDrillChanged?.(null);
        }
        this.activeCluster = found;
      }
    }
    this.hoveredItem = null;
    this.soloDeck = null;
    this.rebuild();
    this.homeCamera();
  }

  setLayoutMode(layoutMode) {
    this.layoutMode = layoutMode;
    this.soloDeck = null;
    this.rebuild();
    this.homeCamera();
  }

  setBottomMode(bottomMode) {
    this.bottomMode = bottomMode === 'nodes' ? 'nodes' : 'namespaces';
    this.hoveredItem = null;
    this.rebuild();
  }

  setDrillFilter(filter) {
    this.drillFilter = filter || null;
    this.hoveredItem = null;
    this.rebuild();
    this.callbacks.onDrillChanged?.(this.drillFilter);
  }

  setBeamsMode(mode) {
    this.beamsMode = mode;
    this.rebuildBeams();
  }

  setLabelsMode(mode) {
    this.labelsMode = mode;
    this.updateLabelsProjection();
  }

  setSoloDeck(deckId) {
    this.soloDeck = this.soloDeck === deckId ? null : deckId;
    this.applyDeckOpacities();
    this.rebuildBeams();
    return this.soloDeck;
  }

  resetDeckOffsets() {
    this.targetOffsets = createDeckOffsets();
    this.callbacks.onOffsetsChanged?.(false);
  }

  hasCustomOffsets() {
    return ['ingress', 'pods', 'controllers'].some((k) => {
      const o = this.targetOffsets[k];
      return Math.abs(o.dx) > 0.1 || Math.abs(o.dy) > 0.1 || Math.abs(o.dz) > 0.1;
    });
  }

  setFilter({ state = null, namespace = '', search = '' } = {}) {
    if (state !== undefined) this.filterState = state;
    if (namespace !== undefined) this.filterNamespace = namespace;
    if (search !== undefined) this.filterSearch = search.trim().toLowerCase();
    this.applyFiltersToMeshes();
    this.rebuildBeams();
  }

  matchesFilter(pod) {
    if (!pod) return false;
    if (this.filterState && pod.visualClass !== this.filterState) return false;
    if (this.filterNamespace && pod.namespace !== this.filterNamespace) return false;
    if (
      this.filterSearch &&
      !pod.name.toLowerCase().includes(this.filterSearch) &&
      !pod.namespace.toLowerCase().includes(this.filterSearch) &&
      !(pod.controllerName || '').toLowerCase().includes(this.filterSearch) &&
      !(pod.node || '').toLowerCase().includes(this.filterSearch)
    ) {
      return false;
    }
    return true;
  }

  matchesPodIndexFilter(podIdx, vCode) {
    const vCls = VISUAL_CLASSES[vCode] || 'running';
    if (this.filterState && vCls !== this.filterState) return false;
    if (!this.filterNamespace && !this.filterSearch) return true;

    const cluster = this.activeCluster;
    if (cluster.podTable) {
      const nsName = cluster.namespaces[cluster.podTable.nsIdx[podIdx]] || '';
      if (this.filterNamespace && nsName !== this.filterNamespace) return false;
      if (this.filterSearch) {
        const ctrl = cluster.controllers[cluster.podTable.ctrlIdx[podIdx]];
        const node = cluster.nodes[cluster.podTable.nodeIdx[podIdx]];
        if (
          !nsName.toLowerCase().includes(this.filterSearch) &&
          !(ctrl?.name || '').toLowerCase().includes(this.filterSearch) &&
          !(node?.name || '').toLowerCase().includes(this.filterSearch)
        ) {
          return false;
        }
      }
      return true;
    }

    const pod = cluster.pods[podIdx];
    return this.matchesFilter(pod);
  }

  clearSceneGroups() {
    while (this.rootGroup.children.length) {
      const child = this.rootGroup.children.pop();
      this.rootGroup.remove(child);
    }
    while (this.beamsGroup.children.length) {
      const child = this.beamsGroup.children.pop();
      this.beamsGroup.remove(child);
    }
    this.pickables = [];
    this.rimPickables = [];
    this.deckGroups.clear();
    this.htmlLabels = [];
    this.animatedMeshes = [];
    this.flowPulses = [];
    this.podInstancedMeshes = null;
    this.dynamicHoverLabel = null;
    this.labelsRoot.innerHTML = '';
  }

  rebuild() {
    if (!this.fleet) return;
    this.clearSceneGroups();

    if (this.viewMode === 'fleet') {
      this.currentPlan = planFleetOverview(this.fleet.clusters);
      this.gridHelper.position.y = -4;
      this.renderFleetOverview(this.currentPlan);
    } else {
      this.currentPlan = planClusterDecks(this.activeCluster, {
        layoutMode: this.layoutMode,
        bottomMode: this.bottomMode,
        drillFilter: this.drillFilter,
      });
      this.gridHelper.position.y =
        this.layoutMode === 'combined' ? -4 : -(this.currentPlan.gap + 8);
      this.renderClusterDecks(this.currentPlan);
    }

    this.applyDeckOpacities();
    if (this.filterState || this.filterNamespace || this.filterSearch) {
      this.applyFiltersToMeshes();
    }
    this.rebuildBeams();
  }

  createDeckSlab(deck, isMovable = true) {
    const t = this.theme;
    const group = new THREE.Group();
    group.userData = { deckId: deck.id, basePos: { x: deck.x, y: deck.y, z: deck.z } };

    const slabH = 0.65;
    const geo = new THREE.BoxGeometry(deck.w, slabH, deck.d);
    const mat = new THREE.MeshStandardMaterial({
      color: hex(t.island.fill),
      roughness: 0.35,
      metalness: 0.15,
      transparent: true,
      opacity: t.mode === 'light' ? 0.88 : 0.78,
    });
    const slab = new THREE.Mesh(geo, mat);
    slab.position.set(0, -slabH / 2, 0);
    slab.userData = { isDeckSlab: true, baseOpacity: mat.opacity };
    group.add(slab);

    const edges = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: hex(t.island.edge),
      transparent: true,
      opacity: t.island.edgeAlpha,
    });
    const rimLines = new THREE.LineSegments(edges, edgeMat);
    rimLines.position.copy(slab.position);
    rimLines.userData = { isDeckEdge: true, baseOpacity: t.island.edgeAlpha };
    group.add(rimLines);

    if (isMovable) {
      const rimHitGeo = new THREE.BoxGeometry(deck.w + 1.2, 1.1, deck.d + 1.2);
      const rimHitMat = new THREE.MeshBasicMaterial({ visible: false });
      const rimHit = new THREE.Mesh(rimHitGeo, rimHitMat);
      rimHit.position.set(0, -0.2, 0);
      rimHit.userData = { deckId: deck.id, w: deck.w, d: deck.d };
      group.add(rimHit);
      this.rimPickables.push(rimHit);
    }

    this.addHtmlLabel({
      deckId: deck.id,
      localPos: new THREE.Vector3(deck.w / 2 + 1.0, 0.45, 0),
      className: 'deck-label',
      labelKind: 'deck',
      anchor: 'left',
      html: `<div class="name"><span class="idx">${deck.index}</span>${deck.title}</div><div class="meta">${deck.subtitle}</div>`,
      alwaysVisible: true,
    });

    return group;
  }

  renderFleetOverview(plan) {
    const t = this.theme;
    const fleetDeck = plan.decks[0];
    const group = this.createDeckSlab(fleetDeck, false);
    this.deckGroups.set('fleet', group);
    this.rootGroup.add(group);

    for (const plat of plan.platforms) {
      const pGroup = new THREE.Group();
      pGroup.position.set(plat.x, 0.08, plat.z);

      const padGeo = new THREE.BoxGeometry(plat.w, 0.55, plat.d);
      const padMat = new THREE.MeshStandardMaterial({
        color: hex(t.worker.pad),
        roughness: 0.3,
        metalness: 0.2,
        transparent: true,
        opacity: 0.94,
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.position.y = 0.275;
      padMesh.userData = {
        pickType: 'cluster',
        key: plat.name,
        data: plat,
      };
      pGroup.add(padMesh);
      this.pickables.push(padMesh);

      const edgeColor = plat.hasIncident ? t.states.crashed : t.worker.padEdge;
      const edgeLines = new THREE.LineSegments(
        new THREE.EdgesGeometry(padGeo),
        new THREE.LineBasicMaterial({ color: hex(edgeColor), transparent: true, opacity: 0.95 })
      );
      edgeLines.position.copy(padMesh.position);
      pGroup.add(edgeLines);

      const classes = ['running', 'transition', 'pending', 'crashed'];
      const total = Math.max(1, plat.podCount);
      classes.forEach((cls, idx) => {
        const count = plat.counts[cls] || 0;
        const ratio = count / total;
        const h = Math.max(0.35, ratio * 3.8 + (count > 0 ? 0.6 : 0));
        const colColor = classColor(t, cls);
        const barGeo = new THREE.BoxGeometry(0.95, h, 0.95);
        const barMat = new THREE.MeshStandardMaterial({
          color: hex(colColor),
          emissive: hex(colColor),
          emissiveIntensity: count > 0 ? 0.45 : 0.08,
          roughness: 0.25,
          metalness: 0.2,
          transparent: true,
          opacity: count > 0 ? 0.96 : 0.28,
        });
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(-2.7 + idx * 1.8, 0.55 + h / 2, 0.6);
        bar.userData = { pickType: 'cluster', key: plat.name, data: plat };
        pGroup.add(bar);
        this.pickables.push(bar);
      });

      if (plat.hasIncident) {
        const ringGeo = new THREE.RingGeometry(0.9, 1.25, 24);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: hex(t.states.crashed),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(2.7, 0.62, 0.6);
        pGroup.add(ring);
        this.animatedMeshes.push({ mesh: ring, kind: 'pulse-ring' });
      }

      group.add(pGroup);

      const el = this.addHtmlLabel({
        deckId: 'fleet',
        localPos: new THREE.Vector3(plat.x, 3.1, plat.z - 1.1),
        className: `district-label cluster-card ${plat.hasIncident ? 'has-incident' : ''}`,
        html: `
          <div class="name">${plat.name} ${plat.hasIncident ? `<span class="badge">! ${plat.counts.crashed} crashed</span>` : ''}</div>
          <div class="meta">
            <span>${plat.location}</span>
            <span class="chip running">${plat.counts.running || 0}</span>
            ${plat.counts.transition ? `<span class="chip transition">${plat.counts.transition}</span>` : ''}
            ${plat.counts.crashed ? `<span class="chip crashed">${plat.counts.crashed}</span>` : ''}
          </div>
          <div class="cluster-card-sub">${plat.ingressCount} ing · ${plat.controllerCount} workloads · ${plat.podCount.toLocaleString()} pods — <b>Dive →</b></div>
        `,
        alwaysVisible: true,
        interactive: true,
        onClick: () => {
          this.callbacks.onClusterDive?.(plat.name);
        },
      });
      el.title = `Click to dive into ${plat.name} decks`;
    }
  }

  renderClusterDecks(plan) {
    for (const deck of plan.decks) {
      const group = this.createDeckSlab(deck, true);
      const off = this.offsets[deck.id] || { dx: 0, dy: 0, dz: 0 };
      group.position.set(deck.x + off.dx, deck.y + off.dy, deck.z + off.dz);
      this.deckGroups.set(deck.id, group);
      this.rootGroup.add(group);
    }

    // 1. Render Gateway Portal Ring on its target deck (Deck 1 in 3-deck, Deck 2 in 2-deck)
    if (plan.portal) {
      const portalGroup = this.deckGroups.get(plan.portal.deckId);
      if (portalGroup) {
        const localX = plan.portal.x - portalGroup.userData.basePos.x;
        const localZ = plan.portal.z - portalGroup.userData.basePos.z;
        this.renderGatewayPortal(portalGroup, localX, localZ);
      }
    }

    // 2. Render Deck 1: Ingress & Routing ('ingress' deck in 3-deck or 'pods' in combined)
    for (const block of plan.ingBlocks) {
      const dGroup = this.deckGroups.get(block.deckId);
      if (!dGroup) continue;
      const localZ = block.z - dGroup.userData.basePos.z;
      this.renderPadBlockFrame(
        dGroup,
        block.x,
        localZ,
        block.w,
        block.d,
        `${block.name} · ingress`,
        block.name,
        'lower-ns'
      );
    }
    for (const pad of plan.ingPads.values()) {
      const dGroup = this.deckGroups.get(pad.deckId);
      if (!dGroup) continue;
      const localZ = pad.z - dGroup.userData.basePos.z;
      this.renderIngressPad(dGroup, pad, pad.x, localZ);
    }

    // 3. Render Deck 2 ('pods'): Workloads & Namespaces (Deployments, StatefulSets, DaemonSets, Jobs)
    const workloadsGroup = this.deckGroups.get('pods');
    if (workloadsGroup) {
      this.renderDistrictTiles(workloadsGroup, plan.districts, 'pods', 'workloads');
      this.renderWorkloadPadsOnDeck(workloadsGroup, plan.workloadPads);
    }

    // 4. Render Deck 3 ('controllers' or 'pods' in combined mode): Pods & Namespaces OR Pods & GKE Nodes
    const podDeckId = this.layoutMode === 'combined' ? 'pods' : 'controllers';
    const podDeckGroup = this.deckGroups.get(podDeckId);
    if (podDeckGroup) {
      if (plan.bottomMode === 'nodes') {
        const baseZ = podDeckGroup.userData.basePos.z;
        for (const block of plan.nodeBlocks || []) {
          const localZ = block.z - baseZ;
          const blockTitle = `${block.name}${block.machineType ? ` · ${block.machineType}` : ''} (${block.count} nodes)`;
          const blockCompact = `${block.name} (${block.count})`;
          this.renderPadBlockFrame(
            podDeckGroup,
            block.x,
            localZ,
            block.w,
            block.d,
            blockTitle,
            blockCompact,
            'node-pool'
          );
        }
        if (plan.nodePads.size <= 120) {
          for (const pad of plan.nodePads.values()) {
            const localZ = pad.z - baseZ;
            this.renderNodePad(podDeckGroup, pad, pad.x, localZ);
          }
        } else {
          this.renderInstancedNodePads(podDeckGroup, plan.nodePads);
        }
      } else if (this.layoutMode !== 'combined') {
        this.renderDistrictTiles(podDeckGroup, plan.podDistricts, 'controllers', 'pods');
      }

      // Render all Pods (28 up to 100,000+) using the unified 3D Container Module InstancedMesh!
      if (plan.podLayout && plan.podLayout.count > 0) {
        this.renderPodLayout(podDeckGroup, plan.podLayout, podDeckId);
      }
    }

    // Dynamic floating hover label for mega-scale instanced items
    const dynEl = document.createElement('div');
    dynEl.className = 'agent-label card focused';
    dynEl.style.display = 'none';
    this.labelsRoot.appendChild(dynEl);
    this.dynamicHoverLabel = dynEl;
  }

  /**
   * Renders squarified Namespace District tiles on a deck.
   * Automatically uses THREE.InstancedMesh when > 60 namespaces (e.g., 500 namespaces in scale-100k).
   */
  renderDistrictTiles(deckGroup, districts, deckId, unitKind = 'pods') {
    if (!districts || districts.length === 0) return;
    const t = this.theme;
    const baseZ = deckGroup.userData.basePos.z;

    if (districts.length > 60) {
      const unitGeo = new THREE.BoxGeometry(1, 0.14, 1);
      const unitMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.45,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9,
      });
      const inst = new THREE.InstancedMesh(unitGeo, unitMat, districts.length);
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();

      districts.forEach((dist, i) => {
        const localZ = dist.z - baseZ;
        dummy.position.set(dist.x, 0.07, localZ);
        dummy.scale.set(dist.w, 1, dist.d);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);

        const isScoped =
          this.drillFilter?.type === 'namespace' && this.drillFilter.key === dist.name;
        const hasCrash = (dist.counts?.crashed || 0) > 0;
        col.set(hex(isScoped ? t.links.highlight : hasCrash ? '#2a1220' : t.district.fill));
        inst.setColorAt(i, col);
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.userData = {
        isInstancedDistricts: true,
        districts,
        deckId,
        baseOpacity: 0.9,
      };
      deckGroup.add(inst);
      this.pickables.push(inst);

      // Add HTML labels only for incident-bearing or largest 32 districts so DOM stays fast
      const sortedForLabels = [...districts]
        .sort(
          (a, b) => (b.counts?.crashed || 0) - (a.counts?.crashed || 0) || b.w * b.d - a.w * a.d
        )
        .slice(0, 32);

      for (const dist of sortedForLabels) {
        const localZ = dist.z - baseZ;
        this.addDistrictLabel(deckId, dist, localZ, unitKind);
      }
      return;
    }

    for (const dist of districts) {
      const localZ = dist.z - baseZ;
      const isScoped = this.drillFilter?.type === 'namespace' && this.drillFilter.key === dist.name;
      const tileGeo = new THREE.BoxGeometry(dist.w, 0.14, dist.d);
      const tileMat = new THREE.MeshStandardMaterial({
        color: hex(t.district.fill),
        roughness: 0.45,
        metalness: 0.1,
        transparent: true,
        opacity: 0.92,
      });
      const tile = new THREE.Mesh(tileGeo, tileMat);
      tile.position.set(dist.x, 0.07, localZ);
      tile.userData = {
        pickType: 'namespace',
        key: dist.name,
        data: dist,
        deckId,
        localX: dist.x,
        localZ,
        baseOpacity: 0.92,
      };
      deckGroup.add(tile);
      this.pickables.push(tile);

      const dEdge = new THREE.LineSegments(
        new THREE.EdgesGeometry(tileGeo),
        new THREE.LineBasicMaterial({
          color: hex(isScoped ? t.links.highlight : t.district.edge),
          transparent: true,
          opacity: isScoped ? 0.98 : t.district.edgeAlpha,
        })
      );
      dEdge.position.copy(tile.position);
      deckGroup.add(dEdge);

      this.addDistrictLabel(deckId, dist, localZ, unitKind);
    }
  }

  addDistrictLabel(deckId, dist, localZ, unitKind) {
    const chips = [];
    if (dist.counts?.running)
      chips.push(`<span class="chip running">${dist.counts.running}</span>`);
    if (dist.counts?.transition)
      chips.push(`<span class="chip transition">${dist.counts.transition}</span>`);
    if (dist.counts?.pending)
      chips.push(`<span class="chip pending">${dist.counts.pending}</span>`);
    if (dist.counts?.crashed)
      chips.push(`<span class="chip crashed">${dist.counts.crashed}</span>`);

    const crashBadge =
      (dist.counts?.crashed || 0) > 0 ? `<span class="badge">!${dist.counts.crashed}</span>` : '';

    const countVal = unitKind === 'workloads' ? dist.workloadCount || dist.total : dist.total;
    const countLabel = unitKind === 'workloads' ? ' wklds' : ' pods';

    const el = this.addHtmlLabel({
      deckId,
      localPos: new THREE.Vector3(dist.x, 0.45, localZ - dist.d / 2 + 0.55),
      className: `district-label ${(dist.counts?.crashed || 0) > 0 ? 'has-incident' : ''}`,
      labelKind: 'district',
      distW: dist.w,
      html: `<div class="name">${dist.name}${crashBadge}</div><div class="meta"><span class="count-num">${countVal.toLocaleString()}</span><span class="count-unit">${countLabel}</span>${chips.join('')}</div>`,
      alwaysVisible: true,
      interactive: true,
      onClick: () => {
        if (this.drillFilter?.type === 'namespace' && this.drillFilter.key === dist.name) {
          this.setDrillFilter(null);
        } else {
          this.setDrillFilter({
            type: 'namespace',
            key: dist.name,
            label: `Namespace: ${dist.name}`,
          });
        }
      },
    });
    el.title = `Click to scope Deck 3 Pods to namespace "${dist.name}"`;
  }

  renderWorkloadPadsOnDeck(deckGroup, workloadPads) {
    if (!workloadPads || workloadPads.size === 0) return;
    const baseZ = deckGroup.userData.basePos.z;

    if (workloadPads.size > 140) {
      // High-scale 2-part InstancedMesh for 1,000+ Workloads (e.g., 500 Namespaces / 100K Pods)
      const t = this.theme;
      const padsArr = Array.from(workloadPads.values());
      const unitGeo = new THREE.BoxGeometry(1, 0.32, 1);
      const unitMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.32,
        metalness: 0.22,
        transparent: true,
        opacity: 0.94,
      });
      const inst = new THREE.InstancedMesh(unitGeo, unitMat, padsArr.length);

      const capGeo = new THREE.BoxGeometry(0.84, 0.14, 0.76);
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x1a2636,
        emissiveIntensity: 0.45,
        roughness: 0.2,
        metalness: 0.15,
        transparent: true,
        opacity: 0.96,
      });
      const capInst = new THREE.InstancedMesh(capGeo, capMat, padsArr.length);

      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      const basePadCol = new THREE.Color(hex(t.worker.pad));
      const edgeCol = new THREE.Color(hex(t.worker.padEdge));

      padsArr.forEach((pad, i) => {
        const ctrl = pad.item;
        const localZ = pad.z - baseZ;
        dummy.position.set(pad.x, 0.18, localZ);
        dummy.scale.set(pad.w, 1, pad.d);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);

        const hasCrash =
          ctrl.crashedReplicas !== undefined
            ? ctrl.crashedReplicas > 0
            : ctrl.readyReplicas < ctrl.desiredReplicas;
        const hasTransition =
          !hasCrash &&
          ((ctrl.transitionReplicas || 0) > 0 || ctrl.readyReplicas < ctrl.desiredReplicas);

        if (hasCrash) {
          col.copy(basePadCol).lerp(new THREE.Color(hex(t.states.crashed)), 0.55);
        } else if (hasTransition) {
          col.copy(basePadCol).lerp(new THREE.Color(hex(t.states.changing)), 0.42);
        } else {
          col.copy(basePadCol).lerp(edgeCol, 0.22);
        }
        inst.setColorAt(i, col);

        dummy.position.set(pad.x, 0.37, localZ);
        dummy.scale.set(pad.w, 1, pad.d);
        dummy.updateMatrix();
        capInst.setMatrixAt(i, dummy.matrix);
        col.set(
          hex(hasCrash ? t.states.crashed : hasTransition ? t.states.changing : t.states.running)
        );
        capInst.setColorAt(i, col);
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.userData = {
        isInstancedWorkloads: true,
        padsArr,
        deckId: 'pods',
        baseOpacity: 0.94,
      };
      deckGroup.add(inst);
      this.pickables.push(inst);

      capInst.instanceMatrix.needsUpdate = true;
      if (capInst.instanceColor) capInst.instanceColor.needsUpdate = true;
      capInst.userData = {
        isInstancedWorkloads: true,
        padsArr,
        deckId: 'pods',
        baseOpacity: 0.96,
      };
      deckGroup.add(capInst);
      this.pickables.push(capInst);
      return;
    }

    for (const pad of workloadPads.values()) {
      const localZ = pad.z - baseZ;
      this.renderControllerPad(deckGroup, pad, pad.x, localZ);
    }
  }

  renderInstancedNodePads(deckGroup, nodePads) {
    const t = this.theme;
    const baseZ = deckGroup.userData.basePos.z;
    const padsArr = Array.from(nodePads.values());
    const unitGeo = new THREE.BoxGeometry(1, 0.38, 1);
    const unitMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.28,
      metalness: 0.24,
      transparent: true,
      opacity: 0.94,
    });
    const inst = new THREE.InstancedMesh(unitGeo, unitMat, padsArr.length);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const padBase = new THREE.Color(hex(t.worker.pad));
    const padEdge = new THREE.Color(hex(t.worker.padEdge));
    const crashCol = new THREE.Color(hex(t.states.crashed));

    padsArr.forEach((pad, i) => {
      const node = pad.item;
      const localZ = pad.z - baseZ;
      dummy.position.set(pad.x, 0.19, localZ);
      dummy.scale.set(pad.w, 1, pad.d);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);

      const degraded = node.status !== 'Ready' || node.memPct > 0.88;
      if (degraded) {
        col.copy(padBase).lerp(crashCol, 0.62);
      } else {
        col.copy(padBase).lerp(padEdge, 0.24);
      }
      inst.setColorAt(i, col);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.userData = {
      isInstancedNodes: true,
      padsArr,
      deckId: deckGroup.userData.deckId,
      baseOpacity: 0.94,
    };
    deckGroup.add(inst);
    this.pickables.push(inst);
  }

  /**
   * Renders all Pods on Deck 3 using a sleek 3D Container Module InstancedMesh.
   * Scales smoothly from 20 pods (large two-part container chassis + glowing telemetry cap)
   * up to 100,000 pods across 500 namespaces in a single GPU draw call!
   */
  renderPodLayout(deckGroup, podLayout, deckId) {
    const t = this.theme;
    const baseZ = deckGroup.userData.basePos.z;
    const count = podLayout.count;
    const { positions, cellSizes, visualClassCode, podIndices } = podLayout;

    // Two-tier Container Module geometry:
    // - When <= 6,000 pods: Dark Slate Container Chassis + Glowing Top Status Cap
    // - When > 6,000 pods (e.g. 100,000 pods): Single high-efficiency Container Module InstancedMesh
    const useTwoLayer = count <= 6000;

    const bodyGeo = new THREE.BoxGeometry(0.76, 1.0, 0.76);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: useTwoLayer ? 0x000000 : 0x162230,
      emissiveIntensity: useTwoLayer ? 0 : 0.32,
      roughness: useTwoLayer ? 0.32 : 0.22,
      metalness: 0.2,
      transparent: true,
      opacity: 0.96,
    });
    const bodyInst = new THREE.InstancedMesh(bodyGeo, bodyMat, count);

    let capInst = null;
    if (useTwoLayer) {
      const capGeo = new THREE.BoxGeometry(0.64, 1.0, 0.64);
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x222222,
        emissiveIntensity: 0.55,
        roughness: 0.18,
        metalness: 0.15,
        transparent: true,
        opacity: 0.98,
      });
      capInst = new THREE.InstancedMesh(capGeo, capMat, count);
    }

    const dummy = new THREE.Object3D();
    const capDummy = new THREE.Object3D();
    const bodyColor = new THREE.Color();
    const capColor = new THREE.Color();
    const chassisBase = new THREE.Color(hex(t.worker.pad));

    let crashRingsAdded = 0;

    for (let i = 0; i < count; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2] - baseZ;
      const cell = cellSizes[i];
      const vCode = visualClassCode[i];
      const vCls = VISUAL_CLASSES[vCode] || 'running';
      const statusHex = hex(classColor(t, vCls));

      const foot = Math.max(0.032, Math.min(1.05, cell * 0.82));
      const totalH =
        vCls === 'crashed'
          ? Math.max(0.24, Math.min(2.2, cell * 1.85))
          : vCls === 'suspended'
            ? Math.max(0.07, Math.min(0.42, cell * 0.35))
            : Math.max(0.11, Math.min(1.55, cell * 1.25));

      if (useTwoLayer) {
        const bodyH = totalH * 0.68;
        const capH = totalH * 0.32;

        dummy.position.set(px, py + bodyH / 2, pz);
        dummy.scale.set(foot, bodyH, foot);
        dummy.updateMatrix();
        bodyInst.setMatrixAt(i, dummy.matrix);

        // Blend dark container chassis with 38% of status color so container ribs look distinct
        bodyColor.copy(chassisBase).lerp(capColor.set(statusHex), 0.38);
        bodyInst.setColorAt(i, bodyColor);

        capDummy.position.set(px, py + bodyH + capH / 2 + 0.01, pz);
        capDummy.scale.set(foot, capH, foot);
        capDummy.updateMatrix();
        capInst.setMatrixAt(i, capDummy.matrix);
        capInst.setColorAt(i, capColor.set(statusHex));
      } else {
        dummy.position.set(px, py + totalH / 2, pz);
        dummy.scale.set(foot, totalH, foot);
        dummy.updateMatrix();
        bodyInst.setMatrixAt(i, dummy.matrix);
        bodyInst.setColorAt(i, capColor.set(statusHex));
      }

      // Add pulsing shock rings around crashed pods when count is reasonable
      if (vCls === 'crashed' && crashRingsAdded < 32 && cell >= 0.45) {
        crashRingsAdded++;
        const rInner = Math.max(0.22, foot * 0.52);
        const rOuter = Math.max(0.34, foot * 0.78);
        const ringGeo = new THREE.RingGeometry(rInner, rOuter, 20);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: statusHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(px, py + 0.04, pz);
        deckGroup.add(ring);
        this.animatedMeshes.push({ mesh: ring, kind: 'pulse-ring' });
      }

      // Add static HTML labels only when total pods <= 220 (otherwise dynamic hover label handles 5K/100K!)
      if (count <= 220) {
        const pod = materializePodAt(this.activeCluster, podIndices[i]);
        if (pod) {
          const compactHtml = `<span class="dot"></span><span>${pod.name}</span>`;
          const cardHtml = `<span class="dot"></span><span>${pod.name}</span><span class="pod-meta">${pod.status} · ${pod.cpuMillis}m</span>`;
          this.addHtmlLabel({
            deckId,
            localPos: new THREE.Vector3(px, py + totalH + 0.22, pz),
            className: `agent-label ${pod.visualClass}`,
            labelKind: 'pod',
            html: compactHtml,
            compactHtml,
            cardHtml,
            itemKey: pod.key,
            itemType: 'pod',
            pod,
          });
        }
      }
    }

    bodyInst.instanceMatrix.needsUpdate = true;
    if (bodyInst.instanceColor) bodyInst.instanceColor.needsUpdate = true;
    bodyInst.userData = {
      isInstancedPods: true,
      podLayout,
      deckId,
      baseOpacity: 0.96,
    };
    deckGroup.add(bodyInst);
    this.pickables.push(bodyInst);

    if (capInst) {
      capInst.instanceMatrix.needsUpdate = true;
      if (capInst.instanceColor) capInst.instanceColor.needsUpdate = true;
      capInst.userData = {
        isInstancedPods: true,
        podLayout,
        deckId,
        baseOpacity: 0.98,
      };
      deckGroup.add(capInst);
      this.pickables.push(capInst);
    }

    this.podInstancedMeshes = { bodyInst, capInst, podLayout, deckId, useTwoLayer };
  }

  renderGatewayPortal(deckGroup, x, z) {
    const t = this.theme;
    const palette = routerPalette(t);
    const portal = new THREE.Group();
    portal.position.set(x, 0.2, z);

    const baseGeo = new THREE.CylinderGeometry(1.55, 1.75, 0.32, 24);
    const baseMat = new THREE.MeshStandardMaterial({
      color: hex(t.router.shaft),
      emissive: hex(t.router.emissive),
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.35,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.16;
    portal.add(base);

    const ringGeo = new THREE.TorusGeometry(1.25, 0.11, 16, 42);
    const ringMat = new THREE.MeshStandardMaterial({
      color: hex(palette[0]),
      emissive: hex(palette[0]),
      emissiveIntensity: 0.85,
      roughness: 0.2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 1.65;
    portal.add(ring);
    this.animatedMeshes.push({ mesh: ring, kind: 'portal-ring' });

    const innerGeo = new THREE.TorusGeometry(0.82, 0.07, 12, 32);
    const innerMat = new THREE.MeshStandardMaterial({
      color: hex(palette[1] || palette[0]),
      emissive: hex(palette[1] || palette[0]),
      emissiveIntensity: 0.9,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.position.y = 1.65;
    portal.add(inner);
    this.animatedMeshes.push({ mesh: inner, kind: 'portal-inner' });

    deckGroup.add(portal);
  }

  renderPadBlockFrame(deckGroup, x, z, w, d, fullText, compactText, blockKind = 'lower-ns') {
    const t = this.theme;
    const frameGeo = new THREE.BoxGeometry(w, 0.08, d);
    const frameEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(frameGeo),
      new THREE.LineBasicMaterial({
        color: hex(t.district.edge),
        transparent: true,
        opacity: 0.38,
      })
    );
    frameEdges.position.set(x, 0.05, z);
    deckGroup.add(frameEdges);

    const compactHtml = `<div class="name">${compactText || fullText}</div>`;
    const cardHtml = `<div class="name">${fullText}</div>`;

    this.addHtmlLabel({
      deckId: deckGroup.userData.deckId,
      localPos: new THREE.Vector3(x, 0.35, z - d / 2 + 0.35),
      className: 'district-label lower',
      labelKind: blockKind,
      html: compactHtml,
      compactHtml,
      cardHtml,
      alwaysVisible: blockKind === 'node-pool',
    });
  }

  renderControllerPad(deckGroup, pad, x, z) {
    const t = this.theme;
    const ctrl = pad.item;
    const hasDead = ctrl.readyReplicas < ctrl.desiredReplicas;
    const isScoped = this.drillFilter?.type === 'controller' && this.drillFilter.key === ctrl.key;

    const padGeo = new THREE.BoxGeometry(pad.w, 0.42, pad.d);
    const padMat = new THREE.MeshStandardMaterial({
      color: hex(t.worker.pad),
      roughness: 0.32,
      metalness: 0.18,
      transparent: true,
      opacity: 0.94,
    });
    const mesh = new THREE.Mesh(padGeo, padMat);
    mesh.position.set(x, 0.21, z);
    mesh.userData = {
      pickType: 'controller',
      key: ctrl.key,
      data: ctrl,
      deckId: pad.deckId,
      localX: x,
      localZ: z,
      topY: 0.45,
      baseOpacity: 0.94,
    };
    deckGroup.add(mesh);
    this.pickables.push(mesh);

    const edgeColor = isScoped ? t.links.highlight : hasDead ? t.states.crashed : t.worker.padEdge;
    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(padGeo),
      new THREE.LineBasicMaterial({ color: hex(edgeColor), transparent: true, opacity: 0.92 })
    );
    rim.position.copy(mesh.position);
    deckGroup.add(rim);

    // 3 horizontal 3D progress bars on top of the Workload pad:
    // Bar 1 (Back/Top): Ready Replicas
    // Bar 2 (Middle):   CPU %
    // Bar 3 (Front):    Memory %
    const barW = Math.max(0.6, pad.w - 0.65);
    const barD = Math.max(0.14, Math.min(0.34, pad.d * 0.14));
    const zSpan = Math.max(0.32, pad.d * 0.27);
    const repRatio = ctrl.desiredReplicas > 0 ? ctrl.readyReplicas / ctrl.desiredReplicas : 1;

    const repColor = hasDead ? t.states.crashed : t.states.running;
    const cpuColor = ctrl.cpuPct > 0.8 ? t.worker.full : t.worker.fill;
    const memColor = ctrl.memPct > 0.85 ? t.states.crashed : t.states.changing;

    this.renderPadProgressBar(deckGroup, x, 0.44, z - zSpan, barW, barD, repRatio, repColor);
    this.renderPadProgressBar(deckGroup, x, 0.44, z, barW, barD * 0.92, ctrl.cpuPct, cpuColor);
    this.renderPadProgressBar(
      deckGroup,
      x,
      0.44,
      z + zSpan,
      barW,
      barD * 0.92,
      ctrl.memPct,
      memColor
    );

    const kindShort =
      ctrl.kind === 'StatefulSet'
        ? 'STS'
        : ctrl.kind === 'DaemonSet'
          ? 'DS'
          : ctrl.kind === 'Job'
            ? 'JOB'
            : 'DEPLOY';
    const compactHtml = `<div class="w-top"><span class="w-kind">${kindShort}</span><span class="w-name">${ctrl.name}</span><span class="w-rep">${ctrl.readyReplicas}/${ctrl.desiredReplicas}</span></div>`;
    const cardHtml = `
      <div class="w-top"><span class="w-kind">${kindShort}</span><span class="w-name">${ctrl.name}</span><span class="w-rep">${ctrl.readyReplicas}/${ctrl.desiredReplicas}</span></div>
      <div class="w-bar-list">
        <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${repColor}"></i>1·Replicas</span><span class="w-bar-val">${ctrl.readyReplicas}/${ctrl.desiredReplicas}</span></div>
        <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${cpuColor}"></i>2·CPU Load</span><span class="w-bar-val">${Math.round(ctrl.cpuPct * 100)}%</span></div>
        <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${memColor}"></i>3·Memory</span><span class="w-bar-val">${Math.round(ctrl.memPct * 100)}%</span></div>
      </div>
    `;

    this.addHtmlLabel({
      deckId: pad.deckId,
      localPos: new THREE.Vector3(x, 0.72, z + pad.d / 2 - 0.15),
      className: `worker-label ${hasDead ? 'degraded' : ''}`,
      labelKind: 'pad',
      degraded: hasDead,
      html: compactHtml,
      compactHtml,
      cardHtml,
      itemKey: ctrl.key,
      itemType: 'controller',
      padItem: ctrl,
    });
  }

  renderNodePad(deckGroup, pad, x, z) {
    const t = this.theme;
    const node = pad.item;
    const degraded = node.status !== 'Ready' || node.memPct > 0.88;

    const padGeo = new THREE.BoxGeometry(pad.w, 0.42, pad.d);
    const padMat = new THREE.MeshStandardMaterial({
      color: hex(t.worker.pad),
      roughness: 0.3,
      metalness: 0.22,
      transparent: true,
      opacity: 0.94,
    });
    const mesh = new THREE.Mesh(padGeo, padMat);
    mesh.position.set(x, 0.21, z);
    mesh.userData = {
      pickType: 'node',
      key: node.key,
      data: node,
      deckId: pad.deckId,
      localX: x,
      localZ: z,
      topY: 0.45,
      baseOpacity: 0.94,
    };
    deckGroup.add(mesh);
    this.pickables.push(mesh);

    const edgeColor = degraded ? t.states.crashed : t.worker.padEdge;
    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(padGeo),
      new THREE.LineBasicMaterial({ color: hex(edgeColor), transparent: true, opacity: 0.92 })
    );
    rim.position.copy(mesh.position);
    deckGroup.add(rim);

    // Subtle inset bay frame on the back 62% of the Node Pad where scheduled Pods sit
    const bayD = pad.d * 0.56;
    const bayZ = z - pad.d * 0.14;
    const bayGeo = new THREE.BoxGeometry(pad.w - 0.5, 0.04, bayD);
    const bayEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(bayGeo),
      new THREE.LineBasicMaterial({
        color: hex(t.district.edge),
        transparent: true,
        opacity: 0.42,
      })
    );
    bayEdges.position.set(x, 0.43, bayZ);
    deckGroup.add(bayEdges);

    // 3 horizontal 3D progress bars along the FRONT strip of the GKE Node pad:
    // Bar 1: Pod Slots (usedPods / maxPods)
    // Bar 2: Node CPU %
    // Bar 3: Node Memory %
    const podColor = node.podPct > 0.85 ? t.worker.full : t.states.running;
    const cpuColor = node.cpuPct > 0.8 ? t.worker.full : t.worker.fill;
    const memColor = degraded ? t.states.crashed : t.states.changing;

    const barW = Math.max(0.8, pad.w - 0.8);
    const zFrontBase = z + pad.d * 0.22;
    const zStep = Math.max(0.24, pad.d * 0.085);

    this.renderPadProgressBar(deckGroup, x, 0.44, zFrontBase, barW, 0.2, node.podPct, podColor);
    this.renderPadProgressBar(
      deckGroup,
      x,
      0.44,
      zFrontBase + zStep,
      barW,
      0.18,
      node.cpuPct,
      cpuColor
    );
    this.renderPadProgressBar(
      deckGroup,
      x,
      0.44,
      zFrontBase + zStep * 2,
      barW,
      0.18,
      node.memPct,
      memColor
    );

    const shortName = node.name.replace(/^gke-[^-]+-/, '');
    const compactHtml = `<div class="w-top"><span class="w-name">${shortName}</span><span class="w-rep">${node.usedPods}/${node.maxPods} pods</span></div>`;
    const cardHtml = `
      <div class="w-top"><span class="w-kind">${node.machineType}</span><span class="w-name">${shortName}</span></div>
      <div class="w-bar-list">
        <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${podColor}"></i>1·Pod Slots</span><span class="w-bar-val">${node.usedPods}/${node.maxPods}</span></div>
        <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${cpuColor}"></i>2·Node CPU</span><span class="w-bar-val">${Math.round(node.cpuPct * 100)}%</span></div>
        <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${memColor}"></i>3·Node Mem</span><span class="w-bar-val">${Math.round(node.memPct * 100)}%</span></div>
      </div>
    `;

    this.addHtmlLabel({
      deckId: pad.deckId,
      localPos: new THREE.Vector3(x, 0.72, z + pad.d / 2 - 0.15),
      className: `worker-label ${degraded ? 'degraded' : ''}`,
      labelKind: 'pad',
      degraded,
      html: compactHtml,
      compactHtml,
      cardHtml,
      itemKey: node.key,
      itemType: 'node',
      padItem: node,
    });
  }

  renderIngressPad(deckGroup, pad, x, z) {
    const t = this.theme;
    const ing = pad.item;
    const degraded = ing.errPct > 0 || ing.healthyBackends < ing.totalBackends;

    const padGeo = new THREE.BoxGeometry(pad.w, 0.42, pad.d);
    const padMat = new THREE.MeshStandardMaterial({
      color: hex(t.router.shaft),
      roughness: 0.28,
      metalness: 0.25,
      transparent: true,
      opacity: 0.92,
    });
    const mesh = new THREE.Mesh(padGeo, padMat);
    mesh.position.set(x, 0.21, z);
    mesh.userData = {
      pickType: 'ingress',
      key: ing.key,
      data: ing,
      deckId: pad.deckId,
      localX: x,
      localZ: z,
      topY: 0.45,
      baseOpacity: 0.92,
    };
    deckGroup.add(mesh);
    this.pickables.push(mesh);

    const edgeColor = degraded ? t.states.crashed : t.router.band;
    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(padGeo),
      new THREE.LineBasicMaterial({ color: hex(edgeColor), transparent: true, opacity: 0.95 })
    );
    rim.position.copy(mesh.position);
    deckGroup.add(rim);

    const healthRatio = ing.totalBackends > 0 ? ing.healthyBackends / ing.totalBackends : 1;
    const healthColor = degraded ? t.states.crashed : t.router.band;
    this.renderPadProgressBar(
      deckGroup,
      x,
      0.44,
      z - 0.35,
      pad.w - 0.8,
      0.38,
      healthRatio,
      healthColor
    );
    this.renderPadProgressBar(
      deckGroup,
      x,
      0.44,
      z + 0.42,
      pad.w - 0.8,
      0.32,
      Math.min(1, ing.rps / 3000),
      t.router.beacon
    );

    const compactHtml = `<div class="w-top"><span class="w-name">${ing.name}</span><span class="w-rep">${ing.errPct > 0 ? `${ing.errPct}% 5xx` : `${ing.rps}rps`}</span></div>`;
    const cardHtml = `
      <div class="w-top"><span class="w-kind">${ing.kind.toUpperCase()}</span><span class="w-name">${ing.name}</span></div>
      <div class="w-bar-list">
        <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${healthColor}"></i>1·Backends</span><span class="w-bar-val">${ing.healthyBackends}/${ing.totalBackends} up</span></div>
        <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${t.router.beacon}"></i>2·Traffic</span><span class="w-bar-val">${ing.rps} rps · ${ing.p99Ms}ms</span></div>
      </div>
    `;

    this.addHtmlLabel({
      deckId: pad.deckId,
      localPos: new THREE.Vector3(x, 0.72, z + pad.d / 2 - 0.2),
      className: `worker-label ingress-pad-label ${degraded ? 'degraded' : ''}`,
      labelKind: 'pad',
      degraded,
      html: compactHtml,
      compactHtml,
      cardHtml,
      itemKey: ing.key,
      itemType: 'ingress',
      padItem: ing,
    });
  }

  renderPadProgressBar(deckGroup, x, y, z, width, depth, ratio, fillHex) {
    const t = this.theme;
    const trackGeo = new THREE.BoxGeometry(width, 0.08, depth);
    const trackMat = new THREE.MeshBasicMaterial({
      color: hex(t.worker.track),
      transparent: true,
      opacity: 0.75,
    });
    const track = new THREE.Mesh(trackGeo, trackMat);
    track.position.set(x, y, z);
    deckGroup.add(track);

    const clamped = Math.max(0.04, Math.min(1, ratio || 0));
    const fillW = width * clamped;
    const fillGeo = new THREE.BoxGeometry(fillW, 0.12, depth * 0.88);
    const fillMat = new THREE.MeshStandardMaterial({
      color: hex(fillHex),
      emissive: hex(fillHex),
      emissiveIntensity: 0.45,
      roughness: 0.25,
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.set(x - (width - fillW) / 2, y + 0.03, z);
    deckGroup.add(fill);
  }

  deckWorldPos(deckId, localX, localY, localZ) {
    const g = this.deckGroups.get(deckId);
    if (!g) return new THREE.Vector3(localX, localY, localZ);
    return new THREE.Vector3(g.position.x + localX, g.position.y + localY, g.position.z + localZ);
  }

  /**
   * Rebuilds bundled cubic-bezier focus beams across the 3-Deck Spatial Hierarchy:
   * - Deck 1 (Ingresses) <-> Deck 2 (Workloads & Namespaces)
   * - Deck 2 (Workloads & Namespaces) <-> Deck 3 (Pods & Namespaces / GKE Nodes)
   */
  rebuildBeams() {
    while (this.beamsGroup.children.length) {
      this.beamsGroup.remove(this.beamsGroup.children[0]);
    }
    this.flowPulses = [];

    if (this.viewMode !== 'cluster' || !this.currentPlan) return;

    const t = this.theme;
    const plan = this.currentPlan;
    const focusTarget = this.hoveredItem || this.selectedItem;
    const showAll = this.beamsMode === 'all';

    if (!showAll && !focusTarget) return;

    const workloadsBaseZ = this.deckGroups.get('pods')?.userData.basePos.z || 0;
    const podDeckId = this.layoutMode === 'combined' ? 'pods' : 'controllers';
    const podDeckBaseZ = this.deckGroups.get(podDeckId)?.userData.basePos.z || 0;

    // 1. Deck 1 (Ingresses) -> Deck 2 (Workloads) Traffic Beams
    for (const [ingKey, ingPad] of plan.ingPads.entries()) {
      const ing = ingPad.item;
      const ingBaseZ = this.deckGroups.get(ingPad.deckId)?.userData.basePos.z || 0;
      const ingWorld = this.deckWorldPos(ingPad.deckId, ingPad.x, -0.2, ingPad.z - ingBaseZ);

      // Find unique target Workloads for this Ingress
      const targetCtrlKeys = new Set(ing.controllers || []);
      if (targetCtrlKeys.size === 0) {
        for (const podKey of ing.pods || []) {
          const slot = plan.podSlots.get(podKey);
          if (slot?.pod?.controller) targetCtrlKeys.add(slot.pod.controller);
        }
      }

      for (const ctrlKey of targetCtrlKeys) {
        const wPad = plan.workloadPads.get(ctrlKey);
        if (!wPad) continue;
        const ctrl = wPad.item;
        const degraded = ctrl.readyReplicas < ctrl.desiredReplicas || ing.errPct > 0;

        const isFocused =
          (focusTarget?.type === 'ingress' && focusTarget.key === ingKey) ||
          (focusTarget?.type === 'controller' && focusTarget.key === ctrlKey) ||
          (focusTarget?.type === 'pod' &&
            focusTarget.data?.controller === ctrlKey &&
            focusTarget.data?.ingresses?.includes(ingKey));

        if (!showAll && !isFocused) continue;

        const wWorld = this.deckWorldPos('pods', wPad.x, 0.55, wPad.z - workloadsBaseZ);
        const wpIng = this.deckWorldPos(
          ingPad.deckId,
          ingPad.x * 0.75,
          -0.2,
          (ingPad.z - ingBaseZ) * 0.75
        );
        const wpWork = this.deckWorldPos(
          'pods',
          wPad.x * 0.85,
          0.55,
          (wPad.z - workloadsBaseZ) * 0.85
        );

        const [c1, c2] = bundleControls(ingWorld, wpIng, wpWork, wWorld, 0.78);
        const beamColor = degraded ? t.states.crashed : isFocused ? t.router.beacon : t.router.band;
        const alpha = isFocused ? 0.92 : 0.28;

        this.addBezierBeam(ingWorld, c1, c2, wWorld, beamColor, alpha, isFocused);
      }
    }

    // 2. Deck 2 (Workloads) -> Deck 3 (Pods) Ownership Beams
    const podLayout = plan.podLayout;
    if (!podLayout || podLayout.count === 0) return;

    const { count, positions, visualClassCode, podIndices } = podLayout;
    const maxBeams = showAll && !focusTarget ? 180 : 90;
    let beamsAdded = 0;

    const pt = this.activeCluster.podTable;
    let focusCtrlIdx = -1;
    let focusNodeIdx = -1;
    let focusPodIdx = -1;
    let focusNsIdx = -1;

    if (pt && focusTarget) {
      if (focusTarget.type === 'controller') {
        focusCtrlIdx =
          focusTarget.data?.ctrlIdx ??
          this.activeCluster.controllers.findIndex((c) => c.key === focusTarget.key);
      } else if (focusTarget.type === 'node') {
        focusNodeIdx =
          focusTarget.data?.nodeIdx ??
          this.activeCluster.nodes.findIndex((n) => n.key === focusTarget.key);
      } else if (focusTarget.type === 'pod') {
        focusPodIdx = focusTarget.data?.podIdx ?? focusTarget.data?._podIdx ?? -1;
      } else if (focusTarget.type === 'ingress') {
        const firstCtrlKey = focusTarget.data?.controllers?.[0];
        if (firstCtrlKey) {
          focusCtrlIdx = this.activeCluster.controllers.findIndex((c) => c.key === firstCtrlKey);
        }
      } else if (focusTarget.type === 'namespace') {
        focusNsIdx = pt.namespaces.indexOf(focusTarget.key);
      }
    }

    for (let i = 0; i < count; i++) {
      if (beamsAdded >= maxBeams) break;
      const podIdx = podIndices[i];
      const vCode = visualClassCode[i];

      let ctrlKey;
      let isFocused = false;

      if (pt) {
        if (!showAll) {
          isFocused =
            (focusPodIdx >= 0 && podIdx === focusPodIdx) ||
            (focusCtrlIdx >= 0 && pt.ctrlIdx[podIdx] === focusCtrlIdx) ||
            (focusNodeIdx >= 0 && pt.nodeIdx[podIdx] === focusNodeIdx) ||
            (focusNsIdx >= 0 && pt.nsIdx[podIdx] === focusNsIdx);
          if (!isFocused) continue;
        }
        if (!this.matchesPodIndexFilter(podIdx, vCode)) continue;
        ctrlKey = this.activeCluster.controllers[pt.ctrlIdx[podIdx]]?.key;
      } else {
        if (!this.matchesPodIndexFilter(podIdx, vCode)) continue;
        const pod = this.activeCluster.pods[podIdx];
        if (!pod) continue;
        ctrlKey = pod.controller;
        isFocused =
          (focusTarget?.type === 'controller' && focusTarget.key === ctrlKey) ||
          (focusTarget?.type === 'node' && focusTarget.key === pod.nodeKey) ||
          (focusTarget?.type === 'pod' && focusTarget.key === pod.key) ||
          (focusTarget?.type === 'namespace' && focusTarget.key === pod.namespace) ||
          (focusTarget?.type === 'ingress' && pod.ingresses?.includes(focusTarget.key));
        if (!showAll && !isFocused) continue;
      }

      const wPad = plan.workloadPads.get(ctrlKey);
      if (!wPad) continue;

      const wWorld = this.deckWorldPos('pods', wPad.x, -0.15, wPad.z - workloadsBaseZ);
      const px = positions[i * 3];
      const py = positions[i * 3 + 1] + 0.5;
      const pz = positions[i * 3 + 2] - podDeckBaseZ;
      const podWorld = this.deckWorldPos(podDeckId, px, py, pz);

      const wpWork = this.deckWorldPos(
        'pods',
        wPad.x * 0.82,
        -0.15,
        (wPad.z - workloadsBaseZ) * 0.82
      );
      const wpPod = this.deckWorldPos(podDeckId, px * 0.85, py, pz * 0.85);

      const [c1, c2] = bundleControls(wWorld, wpWork, wpPod, podWorld, 0.8);
      const vCls = VISUAL_CLASSES[vCode] || 'running';
      const beamColor =
        vCls === 'crashed' ? t.states.crashed : isFocused ? t.links.highlight : t.links.color;
      const alpha = isFocused ? t.links.focusAlpha : Math.max(0.22, t.links.alpha * 1.8);

      this.addBezierBeam(wWorld, c1, c2, podWorld, beamColor, alpha, isFocused);
      beamsAdded++;
    }
  }

  addBezierBeam(p0, c1, c2, p3, colorHex, opacity, withPulse = false) {
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(p0.x, p0.y, p0.z),
      new THREE.Vector3(c1.x, c1.y, c1.z),
      new THREE.Vector3(c2.x, c2.y, c2.z),
      new THREE.Vector3(p3.x, p3.y, p3.z)
    );
    const points = curve.getPoints(24);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: hex(colorHex),
      transparent: true,
      opacity,
    });
    const line = new THREE.Line(geo, mat);
    this.beamsGroup.add(line);

    if (withPulse) {
      const beadGeo = new THREE.SphereGeometry(0.18, 8, 8);
      const beadMat = new THREE.MeshBasicMaterial({
        color: hex(colorHex),
        transparent: true,
        opacity: 0.95,
      });
      const bead = new THREE.Mesh(beadGeo, beadMat);
      this.beamsGroup.add(bead);
      this.flowPulses.push({ mesh: bead, curve, phase: Math.random() });
    }
  }

  applyDeckOpacities() {
    for (const [deckId, group] of this.deckGroups.entries()) {
      const dim = this.soloDeck && this.soloDeck !== deckId;
      group.traverse((obj) => {
        if (obj.material && obj.userData.baseOpacity !== undefined) {
          obj.material.opacity = dim ? obj.userData.baseOpacity * 0.14 : obj.userData.baseOpacity;
        }
      });
    }
  }

  applyFiltersToMeshes() {
    if (!this.podInstancedMeshes) return;
    const { bodyInst, capInst, podLayout, useTwoLayer } = this.podInstancedMeshes;
    const t = this.theme;
    const { count, visualClassCode, podIndices } = podLayout;
    const bodyColor = new THREE.Color();
    const capColor = new THREE.Color();
    const chassisBase = new THREE.Color(hex(t.worker.pad));
    const dimColor = new THREE.Color(hex(t.island.fill));

    for (let i = 0; i < count; i++) {
      const podIdx = podIndices[i];
      const vCode = visualClassCode[i];
      const match = this.matchesPodIndexFilter(podIdx, vCode);
      const vCls = VISUAL_CLASSES[vCode] || 'running';
      const statusHex = hex(classColor(t, vCls));

      if (match) {
        if (useTwoLayer && capInst) {
          bodyColor.copy(chassisBase).lerp(capColor.set(statusHex), 0.38);
          bodyInst.setColorAt(i, bodyColor);
          capInst.setColorAt(i, capColor.set(statusHex));
        } else {
          bodyInst.setColorAt(i, capColor.set(statusHex));
        }
      } else {
        bodyInst.setColorAt(i, dimColor);
        if (useTwoLayer && capInst) capInst.setColorAt(i, dimColor);
      }
    }
    if (bodyInst.instanceColor) bodyInst.instanceColor.needsUpdate = true;
    if (capInst && capInst.instanceColor) capInst.instanceColor.needsUpdate = true;
  }

  addHtmlLabel(spec) {
    const el = document.createElement('div');
    el.className = spec.className;
    el.innerHTML = spec.html;
    if (spec.interactive) {
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        spec.onClick?.();
      });
    }
    this.labelsRoot.appendChild(el);
    const entry = { ...spec, el, currentHtml: spec.html };
    this.htmlLabels.push(entry);
    return el;
  }

  setLabelHtml(lbl, nextHtml) {
    if (nextHtml && lbl.currentHtml !== nextHtml) {
      lbl.el.innerHTML = nextHtml;
      lbl.currentHtml = nextHtml;
    }
  }

  updateLabelsProjection() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const camDist = this.camera.position.distanceTo(this.controls.target);
    const focusTarget = this.hoveredItem || this.selectedItem;
    const focusKey = focusTarget?.key;

    const feedEl = document.getElementById('feedpanel');
    const leftInset = feedEl && !feedEl.classList.contains('collapsed') ? 276 : 14;
    const placedBoxes = [];

    const overlapsPlaced = (box) => {
      for (const b of placedBoxes) {
        if (box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0) {
          return true;
        }
      }
      return false;
    };

    const projectLocal = (deckId, vec) => {
      const worldPos = this.deckWorldPos(deckId, vec.x, vec.y, vec.z);
      const distToCam = worldPos.distanceTo(this.camera.position);
      const proj = worldPos.clone().project(this.camera);
      if (proj.z > 1 || proj.z < -1) return null;
      return {
        sx: (proj.x * 0.5 + 0.5) * w,
        sy: (-proj.y * 0.5 + 0.5) * h,
        distToCam,
      };
    };

    // Update dynamic hover label for mega-scale instanced Pods / Workloads / Nodes / Namespaces
    if (this.dynamicHoverLabel) {
      const showDyn =
        focusTarget &&
        focusTarget.localPos &&
        ((focusTarget.type === 'pod' && this.currentPlan?.podLayout?.count > 220) ||
          (focusTarget.type === 'controller' && this.currentPlan?.workloadPads?.size > 140) ||
          (focusTarget.type === 'node' && this.currentPlan?.nodePads?.size > 120) ||
          (focusTarget.type === 'namespace' && this.currentPlan?.districts?.length > 60));

      if (showDyn) {
        const pt = projectLocal(focusTarget.deckId, focusTarget.localPos);
        if (pt) {
          const t = this.theme;
          this.dynamicHoverLabel.style.display = '';
          this.dynamicHoverLabel.style.transform = `translate(-50%, -120%) translate(${pt.sx.toFixed(1)}px, ${pt.sy.toFixed(1)}px)`;
          if (focusTarget.type === 'pod') {
            const p = focusTarget.data;
            this.dynamicHoverLabel.className = `agent-label card focused ${p.visualClass}`;
            this.dynamicHoverLabel.innerHTML = `<span class="dot"></span><span>${p.name}</span><span class="pod-meta">${p.namespace} · ${p.status} · ${p.node}</span>`;
          } else if (focusTarget.type === 'controller') {
            const c = focusTarget.data;
            const degraded = c.readyReplicas < c.desiredReplicas;
            const repColor = degraded ? t.states.crashed : t.states.running;
            const cpuColor = c.cpuPct > 0.8 ? t.worker.full : t.worker.fill;
            const memColor = c.memPct > 0.85 ? t.states.crashed : t.states.changing;
            this.dynamicHoverLabel.className = `worker-label card focused ${degraded ? 'degraded' : ''}`;
            this.dynamicHoverLabel.innerHTML = `
              <div class="w-top"><span class="w-kind">${c.kind}</span><span class="w-name">${c.name}</span><span class="w-rep">${c.readyReplicas}/${c.desiredReplicas}</span></div>
              <div class="w-bar-list">
                <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${repColor}"></i>1·Replicas</span><span class="w-bar-val">${c.readyReplicas}/${c.desiredReplicas}</span></div>
                <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${cpuColor}"></i>2·CPU Load</span><span class="w-bar-val">${Math.round(c.cpuPct * 100)}%</span></div>
                <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${memColor}"></i>3·Memory</span><span class="w-bar-val">${Math.round(c.memPct * 100)}%</span></div>
              </div>
            `;
          } else if (focusTarget.type === 'node') {
            const n = focusTarget.data;
            const degraded = n.status !== 'Ready' || n.memPct > 0.88;
            const podColor = n.podPct > 0.85 ? t.worker.full : t.states.running;
            const cpuColor = n.cpuPct > 0.8 ? t.worker.full : t.worker.fill;
            const memColor = degraded ? t.states.crashed : t.states.changing;
            const shortName = n.name.replace(/^gke-[^-]+-/, '');
            this.dynamicHoverLabel.className = `worker-label card focused ${degraded ? 'degraded' : ''}`;
            this.dynamicHoverLabel.innerHTML = `
              <div class="w-top"><span class="w-kind">${n.nodePool}</span><span class="w-name">${shortName}</span></div>
              <div class="w-bar-list">
                <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${podColor}"></i>1·Pod Slots</span><span class="w-bar-val">${n.usedPods}/${n.maxPods}</span></div>
                <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${cpuColor}"></i>2·Node CPU</span><span class="w-bar-val">${Math.round(n.cpuPct * 100)}%</span></div>
                <div class="w-bar-row"><span class="w-bar-lbl"><i class="b-dot" style="background:${memColor}"></i>3·Node Mem</span><span class="w-bar-val">${Math.round(n.memPct * 100)}%</span></div>
              </div>
            `;
          } else if (focusTarget.type === 'namespace') {
            const d = focusTarget.data;
            const crash = d.counts?.crashed || 0;
            this.dynamicHoverLabel.className = `district-label ${crash > 0 ? 'has-incident' : ''}`;
            this.dynamicHoverLabel.innerHTML = `<div class="name">${d.name}${crash > 0 ? `<span class="badge">!${crash}</span>` : ''}</div><div class="meta"><span class="count-num">${(d.podTotal || d.total || 0).toLocaleString()}</span><span class="count-unit"> pods · click to scope</span></div>`;
          }
        } else {
          this.dynamicHoverLabel.style.display = 'none';
        }
      } else {
        this.dynamicHoverLabel.style.display = 'none';
      }
    }

    const dynamicCandidates = [];

    for (const lbl of this.htmlLabels) {
      if (this.soloDeck && lbl.deckId && lbl.deckId !== 'fleet' && lbl.deckId !== this.soloDeck) {
        lbl.el.style.display = 'none';
        continue;
      }

      if (lbl.labelKind === 'pad' || lbl.labelKind === 'pod') {
        dynamicCandidates.push(lbl);
        continue;
      }

      if (lbl.labelKind === 'lower-ns') {
        if (camDist > 42 && !this.soloDeck) {
          lbl.el.style.display = 'none';
          continue;
        }
        this.setLabelHtml(lbl, camDist < 30 ? lbl.cardHtml : lbl.compactHtml);
      } else if (lbl.labelKind === 'node-pool') {
        this.setLabelHtml(lbl, camDist < 48 ? lbl.cardHtml : lbl.compactHtml);
      }

      const pt = projectLocal(lbl.deckId, lbl.localPos);
      if (!pt) {
        lbl.el.style.display = 'none';
        continue;
      }

      if (lbl.labelKind === 'deck') {
        lbl.el.classList.toggle('compact', camDist > 52);
        lbl.el.style.display = '';
        const clampedX = Math.min(w - 190, Math.max(leftInset, pt.sx));
        const clampedY = Math.min(h - 42, Math.max(82, pt.sy));
        lbl.el.style.transform = `translate(0, -50%) translate(${clampedX.toFixed(1)}px, ${clampedY.toFixed(1)}px)`;
        placedBoxes.push({
          x0: clampedX - 4,
          y0: clampedY - 18,
          x1: clampedX + 185,
          y1: clampedY + 18,
        });
        continue;
      }

      if (lbl.labelKind === 'district') {
        const leftEdge = projectLocal(
          lbl.deckId,
          new THREE.Vector3(lbl.localPos.x - (lbl.distW || 8) / 2, lbl.localPos.y, lbl.localPos.z)
        );
        const rightEdge = projectLocal(
          lbl.deckId,
          new THREE.Vector3(lbl.localPos.x + (lbl.distW || 8) / 2, lbl.localPos.y, lbl.localPos.z)
        );
        const pxW =
          leftEdge && rightEdge
            ? Math.hypot(rightEdge.sx - leftEdge.sx, rightEdge.sy - leftEdge.sy)
            : 120;
        const isCompact = pxW < 165 || camDist > 50;
        const isTiny = pxW < 88 || camDist > 70;
        lbl.el.classList.toggle('compact', isCompact && !isTiny);
        lbl.el.classList.toggle('tiny', isTiny);
        const halfW = isTiny ? 38 : isCompact ? 56 : 84;
        const box = {
          x0: pt.sx - halfW,
          y0: pt.sy - 13,
          x1: pt.sx + halfW,
          y1: pt.sy + 13,
        };
        if (overlapsPlaced(box)) {
          lbl.el.style.display = 'none';
          continue;
        }
        placedBoxes.push(box);
        lbl.el.style.display = '';
        lbl.el.style.transform = `translate(-50%, -50%) translate(${pt.sx.toFixed(1)}px, ${pt.sy.toFixed(1)}px)`;
        continue;
      }

      lbl.el.style.display = '';
      lbl.el.style.transform = `translate(-50%, -50%) translate(${pt.sx.toFixed(1)}px, ${pt.sy.toFixed(1)}px)`;
      placedBoxes.push({
        x0: pt.sx - 64,
        y0: pt.sy - 14,
        x1: pt.sx + 64,
        y1: pt.sy + 14,
      });
    }

    if (this.labelsMode === 'off') {
      for (const lbl of dynamicCandidates) lbl.el.style.display = 'none';
      return;
    }

    const scored = [];
    for (const lbl of dynamicCandidates) {
      if (lbl.labelKind === 'pod') {
        if (!this.matchesFilter(lbl.pod)) {
          lbl.el.style.display = 'none';
          continue;
        }
        const isDirectFocus = focusKey === lbl.itemKey;
        const isLinkedFocus =
          Boolean(focusKey) &&
          (focusKey === lbl.pod.controller ||
            focusKey === lbl.pod.nodeKey ||
            lbl.pod.ingresses?.includes(focusKey));
        const isCrashed = lbl.pod.visualClass === 'crashed';
        const isTransition =
          lbl.pod.visualClass === 'transition' || lbl.pod.visualClass === 'pending';

        let prio = 4;
        if (isDirectFocus) prio = 0;
        else if (isLinkedFocus) prio = 1;
        else if (isCrashed) prio = 2;
        else if (isTransition && camDist < 48) prio = 3;
        else if (this.labelsMode === 'all' || camDist < 36) prio = 4;
        else {
          lbl.el.style.display = 'none';
          continue;
        }

        const pt = projectLocal(lbl.deckId, lbl.localPos);
        if (!pt) {
          lbl.el.style.display = 'none';
          continue;
        }
        scored.push({
          lbl,
          pt,
          prio,
          useCard: isDirectFocus || (camDist < 24 && (isCrashed || isLinkedFocus)),
        });
      } else if (lbl.labelKind === 'pad') {
        const isDirectFocus = focusKey === lbl.itemKey;
        const isLinkedFocus =
          focusTarget?.type === 'pod' &&
          (focusTarget.data?.controller === lbl.itemKey ||
            focusTarget.data?.nodeKey === lbl.itemKey ||
            focusTarget.data?.ingresses?.includes(lbl.itemKey));

        let prio = 3;
        if (isDirectFocus) prio = 0;
        else if (isLinkedFocus) prio = 1;
        else if (lbl.degraded) prio = 2;
        else if (this.labelsMode === 'all' || camDist < 50) prio = 3;
        else {
          lbl.el.style.display = 'none';
          continue;
        }

        const pt = projectLocal(lbl.deckId, lbl.localPos);
        if (!pt) {
          lbl.el.style.display = 'none';
          continue;
        }
        scored.push({
          lbl,
          pt,
          prio,
          useCard: isDirectFocus || camDist < 28,
        });
      }
    }

    scored.sort((a, b) => a.prio - b.prio || a.pt.distToCam - b.pt.distToCam);

    for (const item of scored) {
      const { lbl, pt, prio, useCard } = item;
      if (prio > 0 && (pt.sx < leftInset || pt.sx > w - 24 || pt.sy < 72 || pt.sy > h - 36)) {
        lbl.el.style.display = 'none';
        continue;
      }

      const halfW = useCard ? 92 : lbl.labelKind === 'pad' ? 58 : 54;
      const halfH = useCard ? 26 : 11;
      const box = {
        x0: pt.sx - halfW,
        y0: pt.sy - halfH,
        x1: pt.sx + halfW,
        y1: pt.sy + halfH,
      };

      if (prio > 0 && overlapsPlaced(box)) {
        lbl.el.style.display = 'none';
        continue;
      }

      placedBoxes.push(box);
      this.setLabelHtml(lbl, useCard ? lbl.cardHtml : lbl.compactHtml);
      lbl.el.classList.toggle('card', Boolean(useCard));
      lbl.el.classList.toggle('focused', prio === 0 || prio === 1);
      lbl.el.style.display = '';
      lbl.el.style.transform = `translate(-50%, -50%) translate(${pt.sx.toFixed(1)}px, ${pt.sy.toFixed(1)}px)`;
    }
  }

  flyTo(targetPos, distance = 32) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.flyAnim = {
      startTarget: this.controls.target.clone(),
      endTarget: targetPos.clone(),
      startCam: this.camera.position.clone(),
      endCam: targetPos.clone().add(dir.multiplyScalar(distance)),
      t: 0,
    };
  }

  homeCamera() {
    const maxW = this.currentPlan?.decks
      ? Math.max(54, ...this.currentPlan.decks.map((d) => d.w || 54))
      : 54;
    const scale = Math.max(1, maxW / 56);

    if (this.viewMode === 'fleet') {
      this.flyAnim = {
        startTarget: this.controls.target.clone(),
        endTarget: new THREE.Vector3(0, 0, 0),
        startCam: this.camera.position.clone(),
        endCam: new THREE.Vector3(0, 34, 46),
        t: 0,
      };
    } else if (this.layoutMode === '3-deck') {
      this.flyAnim = {
        startTarget: this.controls.target.clone(),
        endTarget: new THREE.Vector3(0, -2.2 * scale, 1.5),
        startCam: this.camera.position.clone(),
        endCam: new THREE.Vector3(0, 36 * scale, 65 * scale),
        t: 0,
      };
    } else {
      this.flyAnim = {
        startTarget: this.controls.target.clone(),
        endTarget: new THREE.Vector3(0, -4 * scale, 0),
        startCam: this.camera.position.clone(),
        endCam: new THREE.Vector3(0, 32 * scale, 54 * scale),
        t: 0,
      };
    }
  }

  focusByKey(type, key) {
    if (type === 'pod') {
      const podDeckId = this.layoutMode === 'combined' ? 'pods' : 'controllers';
      const baseZ = this.deckGroups.get(podDeckId)?.userData.basePos.z || 0;

      if (this.currentPlan?.podSlots?.has(key)) {
        const slot = this.currentPlan.podSlots.get(key);
        const localZ = slot.z - baseZ;
        this.selectedItem = {
          type: 'pod',
          key,
          data: slot.pod,
          deckId: podDeckId,
          localPos: new THREE.Vector3(slot.x, 1.2, localZ),
        };
        const worldPos = this.deckWorldPos(podDeckId, slot.x, 0, localZ);
        this.flyTo(worldPos, 24);
        this.rebuildBeams();
        this.callbacks.onSelect?.(this.selectedItem);
        return;
      }

      if (this.activeCluster?.podTable && this.currentPlan?.podLayout) {
        const pl = this.currentPlan.podLayout;
        for (let i = 0; i < pl.count; i++) {
          const pIdx = pl.podIndices[i];
          const pod = materializePodAt(this.activeCluster, pIdx);
          if (pod && pod.key === key) {
            const lx = pl.positions[i * 3];
            const ly = pl.positions[i * 3 + 1];
            const lz = pl.positions[i * 3 + 2] - baseZ;
            this.selectedItem = {
              type: 'pod',
              key,
              data: pod,
              deckId: podDeckId,
              localX: lx,
              localZ: lz,
              localPos: new THREE.Vector3(lx, ly + 0.9, lz),
            };
            const worldPos = this.deckWorldPos(podDeckId, lx, 0, lz);
            this.flyTo(worldPos, 20);
            this.rebuildBeams();
            this.callbacks.onSelect?.(this.selectedItem);
            return;
          }
        }
      }
    }

    if (type === 'controller' && this.currentPlan?.workloadPads?.has(key)) {
      const pad = this.currentPlan.workloadPads.get(key);
      const baseZ = this.deckGroups.get('pods')?.userData.basePos.z || 0;
      const lz = pad.z - baseZ;
      this.selectedItem = {
        type: 'controller',
        key,
        data: pad.item,
        deckId: 'pods',
        localX: pad.x,
        localZ: lz,
        localPos: new THREE.Vector3(pad.x, 0.8, lz),
      };
      const worldPos = this.deckWorldPos('pods', pad.x, 0, lz);
      this.flyTo(worldPos, 24);
      this.rebuildBeams();
      this.callbacks.onSelect?.(this.selectedItem);
      return;
    }

    if (type === 'node') {
      if (this.bottomMode !== 'nodes') {
        this.setBottomMode('nodes');
        this.callbacks.onBottomModeChanged?.('nodes');
      }
      if (this.currentPlan?.nodePads?.has(key)) {
        const pad = this.currentPlan.nodePads.get(key);
        const deckId = this.layoutMode === 'combined' ? 'pods' : 'controllers';
        const baseZ = this.deckGroups.get(deckId)?.userData.basePos.z || 0;
        const lz = pad.z - baseZ;
        this.selectedItem = {
          type: 'node',
          key,
          data: pad.item,
          deckId,
          localX: pad.x,
          localZ: lz,
          localPos: new THREE.Vector3(pad.x, 0.8, lz),
        };
        const worldPos = this.deckWorldPos(deckId, pad.x, 0, lz);
        this.flyTo(worldPos, 22);
        this.rebuildBeams();
        this.callbacks.onSelect?.(this.selectedItem);
        return;
      }
    }

    const mesh = this.pickables.find((m) => m.userData.pickType === type && m.userData.key === key);
    if (!mesh) return;
    this.selectedItem = { type, key, data: mesh.userData.data };
    const worldPos = this.deckWorldPos(
      mesh.userData.deckId,
      mesh.userData.localX || 0,
      0,
      mesh.userData.localZ || 0
    );
    this.flyTo(worldPos, 26);
    this.rebuildBeams();
    this.callbacks.onSelect?.(this.selectedItem);
  }

  zoomBy(factor) {
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);
    this.camera.position.copy(this.controls.target).add(offset);
  }

  resolveHitItem(hit) {
    if (!hit) return null;
    const obj = hit.object;
    const ud = obj.userData;

    if (ud.isInstancedPods && hit.instanceId !== undefined) {
      const i = hit.instanceId;
      const { podLayout, deckId } = ud;
      const podIdx = podLayout.podIndices[i];
      const vCode = podLayout.visualClassCode[i];
      if (!this.matchesPodIndexFilter(podIdx, vCode)) return null;

      const pod = materializePodAt(this.activeCluster, podIdx);
      if (!pod) return null;
      const baseZ = this.deckGroups.get(deckId)?.userData.basePos.z || 0;
      const lx = podLayout.positions[i * 3];
      const ly = podLayout.positions[i * 3 + 1];
      const lz = podLayout.positions[i * 3 + 2] - baseZ;
      return {
        type: 'pod',
        key: pod.key,
        data: pod,
        deckId,
        localX: lx,
        localZ: lz,
        localPos: new THREE.Vector3(lx, ly + 0.9, lz),
      };
    }

    if (ud.isInstancedWorkloads && hit.instanceId !== undefined) {
      const pad = ud.padsArr[hit.instanceId];
      if (!pad) return null;
      const baseZ = this.deckGroups.get(ud.deckId)?.userData.basePos.z || 0;
      const lz = pad.z - baseZ;
      return {
        type: 'controller',
        key: pad.item.key,
        data: pad.item,
        deckId: ud.deckId,
        localX: pad.x,
        localZ: lz,
        localPos: new THREE.Vector3(pad.x, 0.8, lz),
      };
    }

    if (ud.isInstancedNodes && hit.instanceId !== undefined) {
      const pad = ud.padsArr[hit.instanceId];
      if (!pad) return null;
      const baseZ = this.deckGroups.get(ud.deckId)?.userData.basePos.z || 0;
      const lz = pad.z - baseZ;
      return {
        type: 'node',
        key: pad.item.key,
        data: pad.item,
        deckId: ud.deckId,
        localX: pad.x,
        localZ: lz,
        localPos: new THREE.Vector3(pad.x, 0.8, lz),
      };
    }

    if (ud.isInstancedDistricts && hit.instanceId !== undefined) {
      const dist = ud.districts[hit.instanceId];
      if (!dist) return null;
      const baseZ = this.deckGroups.get(ud.deckId)?.userData.basePos.z || 0;
      const lz = dist.z - baseZ;
      return {
        type: 'namespace',
        key: dist.name,
        data: dist,
        deckId: ud.deckId,
        localX: dist.x,
        localZ: lz,
        localPos: new THREE.Vector3(dist.x, 0.55, lz),
      };
    }

    if (ud.pickType) {
      return {
        type: ud.pickType,
        key: ud.key,
        data: ud.data,
        deckId: ud.deckId,
        localX: ud.localX || 0,
        localZ: ud.localZ || 0,
      };
    }

    return null;
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };

      if (
        (e.altKey || e.shiftKey) &&
        this.viewMode === 'cluster' &&
        this.layoutMode !== 'combined'
      ) {
        this.updatePointer(e);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObjects(this.rimPickables, false);
        const deckId = hits.length > 0 ? hits[0].object.userData.deckId : 'pods';
        const g = this.deckGroups.get(deckId);
        if (g) {
          this.dragPlane.constant = -g.position.y;
          const hitPt = new THREE.Vector3();
          this.raycaster.ray.intersectPlane(this.dragPlane, hitPt);
          this.dragDeckState = {
            deckId,
            vertical: e.shiftKey,
            lastClientY: e.clientY,
            lastWorldPt: hitPt,
          };
          this.controls.enabled = false;
        }
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.dragDeckState) {
        if (this.dragDeckState.vertical) {
          const dy = -(e.clientY - this.dragDeckState.lastClientY) * 0.14;
          this.dragDeckState.lastClientY = e.clientY;
          this.targetOffsets = applyDeckMove(
            this.targetOffsets,
            this.dragDeckState.deckId,
            { dy },
            false
          );
        } else {
          this.updatePointer(e);
          this.raycaster.setFromCamera(this.pointer, this.camera);
          const pt = new THREE.Vector3();
          if (this.raycaster.ray.intersectPlane(this.dragPlane, pt)) {
            const dx = pt.x - this.dragDeckState.lastWorldPt.x;
            const dz = pt.z - this.dragDeckState.lastWorldPt.z;
            this.dragDeckState.lastWorldPt.copy(pt);
            this.targetOffsets = applyDeckMove(
              this.targetOffsets,
              this.dragDeckState.deckId,
              { dx, dz },
              this.decksLinked
            );
          }
        }
        this.callbacks.onOffsetsChanged?.(this.hasCustomOffsets());
        return;
      }

      this.updatePointer(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.pickables, false);
      const nextHover = hits.length > 0 ? this.resolveHitItem(hits[0]) : null;

      if (nextHover?.key !== this.hoveredItem?.key || nextHover?.type !== this.hoveredItem?.type) {
        this.hoveredItem = nextHover;
        this.canvas.style.cursor = nextHover ? 'pointer' : 'grab';
        this.rebuildBeams();
        this.callbacks.onHover?.(this.hoveredItem);
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.dragDeckState) {
        this.dragDeckState = null;
        this.controls.enabled = true;
        return;
      }

      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (dist > 6) return;

      this.updatePointer(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.pickables, false);
      if (hits.length > 0) {
        const resolved = this.resolveHitItem(hits[0]);
        if (!resolved) return;

        if (resolved.type === 'cluster') {
          this.callbacks.onClusterDive?.(resolved.key);
          return;
        }
        if (resolved.type === 'namespace') {
          if (this.drillFilter?.type === 'namespace' && this.drillFilter.key === resolved.key) {
            this.setDrillFilter(null);
          } else {
            this.setDrillFilter({
              type: 'namespace',
              key: resolved.key,
              label: `Namespace: ${resolved.key}`,
            });
          }
          return;
        }

        this.selectedItem = resolved;
        const worldPos = this.deckWorldPos(
          resolved.deckId,
          resolved.localX || 0,
          0,
          resolved.localZ || 0
        );
        this.flyTo(worldPos, 28);
        this.rebuildBeams();
        this.callbacks.onSelect?.(this.selectedItem);
      }
    });
  }

  updatePointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  startLoop() {
    const tick = (nowMs) => {
      requestAnimationFrame(tick);
      const tSec = nowMs * 0.001;

      if (this.flyAnim) {
        this.flyAnim.t = Math.min(1, this.flyAnim.t + 0.06);
        const ease = 1 - Math.pow(1 - this.flyAnim.t, 3);
        this.controls.target.lerpVectors(this.flyAnim.startTarget, this.flyAnim.endTarget, ease);
        this.camera.position.lerpVectors(this.flyAnim.startCam, this.flyAnim.endCam, ease);
        if (this.flyAnim.t >= 1) this.flyAnim = null;
      }

      let offsetsMoved = false;
      for (const id of ['ingress', 'pods', 'controllers']) {
        const cur = this.offsets[id];
        const tgt = this.targetOffsets[id];
        for (const axis of ['dx', 'dy', 'dz']) {
          const diff = tgt[axis] - cur[axis];
          if (Math.abs(diff) > 0.01) {
            cur[axis] += diff * 0.18;
            offsetsMoved = true;
          } else {
            cur[axis] = tgt[axis];
          }
        }
        const g = this.deckGroups.get(id);
        if (g) {
          const base = g.userData.basePos;
          g.position.set(base.x + cur.dx, base.y + cur.dy, base.z + cur.dz);
        }
      }
      if (offsetsMoved) {
        this.rebuildBeams();
      }

      for (const anim of this.animatedMeshes) {
        if (anim.kind === 'portal-ring') {
          anim.mesh.rotation.z = tSec * 0.7;
          anim.mesh.rotation.y = Math.sin(tSec * 0.5) * 0.35;
        } else if (anim.kind === 'portal-inner') {
          anim.mesh.rotation.x = tSec * 1.1;
          anim.mesh.rotation.y = -tSec * 0.8;
        } else if (anim.kind === 'pulse-ring') {
          const s = 1 + ((tSec * 1.4) % 1) * 0.85;
          anim.mesh.scale.set(s, s, 1);
          anim.mesh.material.opacity = (1 - ((tSec * 1.4) % 1)) * 0.85;
        }
      }

      for (const p of this.flowPulses) {
        const u = (tSec * 0.55 + p.phase) % 1;
        const pos = p.curve.getPoint(u);
        p.mesh.position.copy(pos);
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.updateLabelsProjection();
    };
    requestAnimationFrame(tick);
  }
}
