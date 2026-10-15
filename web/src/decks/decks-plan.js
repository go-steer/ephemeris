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

// Pure spatial layout planner for Ephemeris /decks:
// 1. Level 1: Multi-Cluster Fleet Overview Deck (planFleetOverview)
// 2. Level 2: Single-Cluster Decks View (planClusterDecks) supporting:
//    - '3-deck' (Top: Ingress & Routing, Middle: Pods & Namespaces, Bottom: Controllers)
//    - '2-deck' (Top: Pods & Namespaces + Portal, Bottom: Controllers & Services)
//    - 'combined' (Single horizontal island with front Controllers & back Ingresses)
// 3. Squarified treemap district layout, bundled cubic-bezier focus beams, and
//    movable deck offset math.

export const CELL_SPACING = 3.0;
export const DISTRICT_PAD = 2.5;
export const ISLAND_MARGIN = 4.2;

export const PAD_W = 6.2;
export const PAD_D = 3.5;
export const PAD_GAP_X = 1.6;
export const PAD_GAP_Z = 1.6;

/** Squarified treemap layout inside box {x, z, w, d}. */
function squarify(items, box) {
  const out = [];
  const total = items.reduce((s, it) => s + it.weight, 0);
  if (!total || !items.length) return out;

  let { x, z, w, d } = box;
  let remWeight = total;
  let idx = 0;

  const worstAspect = (row, side, areaPerWeight) => {
    if (!row.length || side <= 0) return Infinity;
    const rowWeight = row.reduce((s, r) => s + r.weight, 0);
    const rowArea = rowWeight * areaPerWeight;
    const stripThickness = rowArea / side;
    if (stripThickness <= 0) return Infinity;
    let worst = 0;
    for (const r of row) {
      const len = (r.weight * areaPerWeight) / stripThickness;
      const ratio = Math.max(len / stripThickness, stripThickness / Math.max(0.001, len));
      if (ratio > worst) worst = ratio;
    }
    return worst;
  };

  while (idx < items.length) {
    const horizontal = w >= d;
    const side = horizontal ? d : w;
    const areaPerWeight = (w * d) / Math.max(0.0001, remWeight);
    const row = [items[idx++]];

    while (idx < items.length) {
      const candidate = [...row, items[idx]];
      if (worstAspect(candidate, side, areaPerWeight) <= worstAspect(row, side, areaPerWeight)) {
        row.push(items[idx++]);
      } else {
        break;
      }
    }

    const rowWeight = row.reduce((s, r) => s + r.weight, 0);
    const frac = remWeight > 0 ? rowWeight / remWeight : 1;

    if (horizontal) {
      const stripW = w * frac;
      let cz = z;
      for (const r of row) {
        const itemD = rowWeight > 0 ? d * (r.weight / rowWeight) : d / row.length;
        out.push({ item: r.item, x: x + stripW / 2, z: cz + itemD / 2, w: stripW, d: itemD });
        cz += itemD;
      }
      x += stripW;
      w -= stripW;
    } else {
      const stripD = d * frac;
      let cx = x;
      for (const r of row) {
        const itemW = rowWeight > 0 ? w * (r.weight / rowWeight) : w / row.length;
        out.push({ item: r.item, x: cx + itemW / 2, z: z + stripD / 2, w: itemW, d: stripD });
        cx += itemW;
      }
      z += stripD;
      d -= stripD;
    }
    remWeight -= rowWeight;
  }

  return out;
}

/**
 * Plans squarified Namespace Districts and Workload pads for Deck 2 (Middle: Workloads & Namespaces).
 * Scales smoothly from 4 namespaces up to 500 namespaces / 1,000 workloads.
 */
export function planWorkloadsDeck(cluster, deckId = 'pods') {
  const controllers = cluster.controllers || [];
  const byNs = new Map();
  for (const ctrl of controllers) {
    const ns = ctrl.namespace || 'default';
    if (!byNs.has(ns)) byNs.set(ns, []);
    byNs.get(ns).push(ctrl);
  }

  const nsCount = Math.max(1, byNs.size);
  const isMega = nsCount > 30;

  const groups = [...byNs.entries()]
    .map(([name, list]) => {
      const totalReplicas = list.reduce((s, c) => s + (c.desiredReplicas || 1), 0);
      const readyReplicas = list.reduce((s, c) => s + (c.readyReplicas || 0), 0);
      const crashed = list.reduce(
        (s, c) =>
          s +
          (c.crashedReplicas !== undefined
            ? c.crashedReplicas
            : Math.max(0, (c.desiredReplicas || 1) - (c.readyReplicas || 0))),
        0
      );
      const transition = list.reduce((s, c) => s + (c.transitionReplicas || 0), 0);
      return {
        name,
        controllers: list,
        totalReplicas,
        readyReplicas,
        crashed,
        transition,
        weight: isMega ? Math.max(1, list.length) : Math.max(4, list.length * 4 + 2),
      };
    })
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));

  // Keep overall island dimensions bounded even at 500 namespaces so camera framing stays crisp
  const islandW = isMega
    ? nsCount > 150
      ? 76
      : 62
    : Math.max(44, Math.min(64, Math.sqrt(nsCount * 165) * 1.55));
  const islandD = isMega ? (nsCount > 150 ? 36 : 30) : Math.max(18, Math.min(30, islandW / 2.2));

  const rects = squarify(
    groups.map((g) => ({ item: g, weight: g.weight })),
    { x: -islandW / 2, z: -islandD / 2, w: islandW, d: islandD }
  );

  const districts = [];
  const workloadPads = new Map();

  for (const r of rects) {
    const g = r.item;
    const margin = isMega ? 0.14 : 0.65;
    const dw = Math.max(0.5, r.w - margin);
    const dd = Math.max(0.5, r.d - margin);
    const padInset = isMega ? 0.18 : 1.35;
    const innerW = Math.max(0.35, dw - padInset);
    const innerD = Math.max(0.35, dd - padInset);

    const n = g.controllers.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * innerW) / Math.max(0.2, innerD))));
    const rows = Math.max(1, Math.ceil(n / cols));
    const cellW = innerW / cols;
    const cellD = innerD / rows;
    const pw = isMega ? Math.max(0.28, cellW * 0.82) : Math.min(PAD_W, Math.max(2.6, cellW * 0.84));
    const pd = isMega ? Math.max(0.24, cellD * 0.78) : Math.min(PAD_D, Math.max(1.9, cellD * 0.8));

    g.controllers.forEach((ctrl, idx) => {
      const c = idx % cols;
      const row = Math.floor(idx / cols);
      const px = r.x + (c - (cols - 1) / 2) * cellW;
      const pz = r.z + (row - (rows - 1) / 2) * cellD + (isMega ? 0 : 0.18);
      workloadPads.set(ctrl.key, {
        key: ctrl.key,
        deckId,
        namespace: g.name,
        x: px,
        z: pz,
        y: 0,
        w: pw,
        d: pd,
        isCompactPad: isMega,
        item: ctrl,
      });
    });

    const counts = {
      running: g.readyReplicas,
      transition: g.transition || 0,
      crashed: g.crashed,
      pending: 0,
      suspended: 0,
    };

    districts.push({
      name: g.name,
      kind: 'namespace',
      deckId,
      x: r.x,
      z: r.z,
      y: 0,
      w: dw,
      d: dd,
      total: g.controllers.length,
      podTotal: g.totalReplicas,
      counts,
    });
  }

  return {
    w: islandW + ISLAND_MARGIN * 2,
    d: islandD + ISLAND_MARGIN * 2,
    districts,
    workloadPads,
  };
}

/**
 * Plans squarified Namespace Districts and dynamically-sized Pod slots
 * (supports both standard cluster.pods arrays and 100K-pod typed-array podTables).
 */
export function planNamespaceDistricts(
  podsOrCluster,
  { deckId = 'controllers', targetW = 0, targetD = 0, drillFilter = null } = {}
) {
  const isClusterObj =
    podsOrCluster &&
    !Array.isArray(podsOrCluster) &&
    (podsOrCluster.pods || podsOrCluster.podTable);
  const cluster = isClusterObj ? podsOrCluster : null;

  // Fast path for hyperscale typed-array podTable (e.g. 500 namespaces / 100,000 pods)
  if (cluster && cluster.podTable) {
    const pt = cluster.podTable;
    const nsNames = pt.namespaces;
    const nsCount = nsNames.length;

    const activeNsIndices = [];
    for (let n = 0; n < nsCount; n++) {
      if (drillFilter?.type === 'namespace' && nsNames[n] !== drillFilter.key) continue;
      if (drillFilter?.type === 'controller' && !drillFilter.key.startsWith(`${nsNames[n]}/`))
        continue;
      if (pt.nsPodCounts[n] > 0) activeNsIndices.push(n);
    }

    const islandW = targetW > 0 ? targetW - ISLAND_MARGIN * 2 : nsCount > 150 ? 76 : 62;
    const islandD = targetD > 0 ? targetD - ISLAND_MARGIN * 2 : nsCount > 150 ? 36 : 30;

    const groups = activeNsIndices
      .map((nIdx) => ({
        nIdx,
        name: nsNames[nIdx],
        count: pt.nsPodCounts[nIdx],
        weight: Math.max(1, pt.nsPodCounts[nIdx]),
      }))
      .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));

    const rects = squarify(
      groups.map((g) => ({ item: g, weight: g.weight })),
      { x: -islandW / 2, z: -islandD / 2, w: islandW, d: islandD }
    );

    const districts = [];
    const nsGeom = new Map();
    for (const r of rects) {
      const g = r.item;
      const margin = activeNsIndices.length > 30 ? 0.12 : 0.6;
      const dw = Math.max(0.4, r.w - margin);
      const dd = Math.max(0.4, r.d - margin);
      const innerW = Math.max(0.28, dw * 0.88);
      const innerD = Math.max(0.28, dd * 0.84);
      const n = Math.max(1, g.count);
      const cols = Math.max(1, Math.ceil(Math.sqrt((n * innerW) / Math.max(0.1, innerD))));
      const rows = Math.max(1, Math.ceil(n / cols));
      const stepX = cols > 1 ? innerW / cols : 0;
      const stepZ = rows > 1 ? innerD / rows : 0;
      const cellSize = Math.max(
        0.055,
        Math.min(0.75, Math.min(innerW / cols, innerD / rows) * 0.72)
      );

      nsGeom.set(g.nIdx, { x: r.x, z: r.z, cols, rows, stepX, stepZ, cellSize, cursor: 0 });
      districts.push({
        name: g.name,
        kind: 'namespace',
        deckId,
        x: r.x,
        z: r.z,
        y: 0,
        w: dw,
        d: dd,
        total: g.count,
        counts: pt.nsStateCounts[g.nIdx],
      });
    }

    const targetCtrlIdx =
      drillFilter?.type === 'controller'
        ? cluster.controllers.findIndex((c) => c.key === drillFilter.key)
        : -1;

    // Count matching pods first
    let matchCount = 0;
    for (let i = 0; i < pt.count; i++) {
      if (targetCtrlIdx >= 0 && pt.ctrlIdx[i] !== targetCtrlIdx) continue;
      if (!nsGeom.has(pt.nsIdx[i])) continue;
      matchCount++;
    }

    const positions = new Float32Array(matchCount * 3);
    const cellSizes = new Float32Array(matchCount);
    const visualClassCode = new Uint8Array(matchCount);
    const podIndices = new Uint32Array(matchCount);

    let out = 0;
    for (let i = 0; i < pt.count; i++) {
      if (targetCtrlIdx >= 0 && pt.ctrlIdx[i] !== targetCtrlIdx) continue;
      const geom = nsGeom.get(pt.nsIdx[i]);
      if (!geom) continue;

      const k = geom.cursor++;
      const c = k % geom.cols;
      const row = (k / geom.cols) | 0;
      positions[out * 3] = geom.x + (c - (geom.cols - 1) * 0.5) * geom.stepX;
      positions[out * 3 + 1] = 0;
      positions[out * 3 + 2] = geom.z + (row - (geom.rows - 1) * 0.5) * geom.stepZ;
      cellSizes[out] = geom.cellSize;
      visualClassCode[out] = pt.visualClassCode[i];
      podIndices[out] = i;
      out++;
    }

    return {
      w: islandW + ISLAND_MARGIN * 2,
      d: islandD + ISLAND_MARGIN * 2,
      districts,
      podSlots: new Map(),
      podLayout: {
        count: matchCount,
        positions,
        cellSizes,
        visualClassCode,
        podIndices,
        deckId,
      },
    };
  }

  // Standard path for <= 2,000 pods
  const rawPods = isClusterObj ? cluster.pods || [] : podsOrCluster || [];
  const rawIdxByPod = new Map(rawPods.map((p, idx) => [p, idx]));
  const pods = drillFilter
    ? rawPods.filter((p) =>
        drillFilter.type === 'namespace'
          ? p.namespace === drillFilter.key
          : p.controller === drillFilter.key
      )
    : rawPods;

  const byNs = new Map();
  for (const p of pods) {
    const ns = p.namespace || 'default';
    if (!byNs.has(ns)) byNs.set(ns, []);
    byNs.get(ns).push(p);
  }

  const groups = [...byNs.entries()]
    .map(([name, list]) => ({
      name,
      pods: [...list].sort((a, b) => a.name.localeCompare(b.name)),
      weight: Math.max(3, list.length + 1.5),
    }))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));

  const totalWeight = groups.reduce((s, g) => s + g.weight, 0);
  const baseArea = Math.max(460, totalWeight * (CELL_SPACING * CELL_SPACING * 2.1));
  const islandW =
    targetW > 0
      ? targetW - ISLAND_MARGIN * 2
      : Math.max(40, Math.min(68, Math.sqrt(baseArea * 2.35)));
  const islandD =
    targetD > 0 ? targetD - ISLAND_MARGIN * 2 : Math.max(16, Math.min(32, baseArea / islandW));

  const rects = squarify(
    groups.map((g) => ({ item: g, weight: g.weight })),
    { x: -islandW / 2, z: -islandD / 2, w: islandW, d: islandD }
  );

  const districts = [];
  const podSlots = new Map();
  const positions = new Float32Array(pods.length * 3);
  const cellSizes = new Float32Array(pods.length);
  const visualClassCode = new Uint8Array(pods.length);
  const podIndices = new Uint32Array(pods.length);
  const vMap = { running: 0, transition: 1, crashed: 2, pending: 3, suspended: 4 };
  let out = 0;

  for (const r of rects) {
    const g = r.item;
    const dw = Math.max(3.6, r.w - 0.75);
    const dd = Math.max(3.4, r.d - 0.75);
    const innerW = Math.max(2.0, dw - DISTRICT_PAD * 0.85);
    const innerD = Math.max(2.0, dd - DISTRICT_PAD * 0.85);

    const n = Math.max(1, g.pods.length);
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * innerW) / Math.max(1, innerD))));
    const rows = Math.max(1, Math.ceil(n / cols));
    const stepX = cols > 1 ? Math.min(CELL_SPACING * 0.85, innerW / cols) : 0;
    const stepZ = rows > 1 ? Math.min(CELL_SPACING * 0.85, innerD / rows) : 0;
    const cellSize = Math.max(0.22, Math.min(0.84, Math.min(innerW / cols, innerD / rows) * 0.56));

    const counts = { running: 0, transition: 0, crashed: 0, pending: 0, suspended: 0 };
    g.pods.forEach((pod, idx) => {
      const c = idx % cols;
      const row = Math.floor(idx / cols);
      const px = r.x + (c - (cols - 1) / 2) * stepX;
      const pz = r.z + (row - (rows - 1) / 2) * stepZ;
      counts[pod.visualClass] = (counts[pod.visualClass] || 0) + 1;
      podSlots.set(pod.key, {
        x: px,
        z: pz,
        y: 0,
        cellSize,
        deckId,
        district: g.name,
        pod,
      });

      positions[out * 3] = px;
      positions[out * 3 + 1] = 0;
      positions[out * 3 + 2] = pz;
      cellSizes[out] = cellSize;
      visualClassCode[out] = vMap[pod.visualClass] ?? 0;
      podIndices[out] = rawIdxByPod.get(pod) ?? out;
      out++;
    });

    districts.push({
      name: g.name,
      kind: 'namespace',
      deckId,
      x: r.x,
      z: r.z,
      y: 0,
      w: dw,
      d: dd,
      total: g.pods.length,
      counts,
    });
  }

  return {
    w: islandW + ISLAND_MARGIN * 2,
    d: islandD + ISLAND_MARGIN * 2,
    districts,
    podSlots,
    podLayout: {
      count: out,
      positions,
      cellSizes,
      visualClassCode,
      podIndices,
      deckId,
    },
  };
}

/**
 * PlansPodsOnNodes: Places GKE Compute Node Pads grouped by Node Pool on Deck 3,
 * AND packs every Pod scheduled onto each Node into that Node Pad's surface bay!
 * Scales smoothly from 7 nodes up to 5,000 GKE nodes and 100,000 pods.
 */
export function planNodesWithPodsDeck(
  cluster,
  deckId = 'controllers',
  targetWidth = 44,
  drillFilter = null
) {
  const allNodes = cluster.nodes || [];

  if (cluster.podTable) {
    const pt = cluster.podTable;
    const targetNsIdx =
      drillFilter?.type === 'namespace' ? pt.namespaces.indexOf(drillFilter.key) : -1;
    const targetCtrlIdx =
      drillFilter?.type === 'controller'
        ? cluster.controllers.findIndex((c) => c.key === drillFilter.key)
        : -1;
    const isScoped = targetNsIdx >= 0 || targetCtrlIdx >= 0;

    let matchedOnNode = null;
    let matchCount = pt.count;
    let activeNodes = allNodes;

    if (isScoped) {
      matchedOnNode = new Uint32Array(allNodes.length);
      matchCount = 0;
      for (let i = 0; i < pt.count; i++) {
        if (targetNsIdx >= 0 && pt.nsIdx[i] !== targetNsIdx) continue;
        if (targetCtrlIdx >= 0 && pt.ctrlIdx[i] !== targetCtrlIdx) continue;
        matchedOnNode[pt.nodeIdx[i]]++;
        matchCount++;
      }
      activeNodes = allNodes.filter((_, idx) => matchedOnNode[idx] > 0);
    }

    const basePlan = planPadDeck(activeNodes, deckId, targetWidth);
    const bayByNodeIdx = new Array(allNodes.length);

    for (const pad of basePlan.pads.values()) {
      const node = pad.item;
      const nIdx = node.nodeIdx ?? allNodes.indexOf(node);
      const n = Math.max(1, isScoped ? matchedOnNode[nIdx] : node.usedPods || 1);
      const isCompact = Boolean(pad.isCompactPad);
      const bayW = pad.w * (isCompact ? 0.84 : 0.86);
      const bayD = pad.d * (isCompact ? 0.82 : 0.54);
      const bayCenterZ = isCompact ? pad.z : pad.z - pad.d * 0.16;
      const cols = Math.max(1, Math.ceil(Math.sqrt((n * bayW) / Math.max(0.08, bayD))));
      const rows = Math.max(1, Math.ceil(n / cols));
      const stepX = cols > 1 ? bayW / cols : 0;
      const stepZ = rows > 1 ? bayD / rows : 0;
      const cellSize = Math.max(0.032, Math.min(0.46, Math.min(bayW / cols, bayD / rows) * 0.68));
      bayByNodeIdx[nIdx] = {
        x: pad.x,
        z: bayCenterZ,
        cols,
        rows,
        stepX,
        stepZ,
        cellSize,
        cursor: 0,
      };
    }

    const positions = new Float32Array(matchCount * 3);
    const cellSizes = new Float32Array(matchCount);
    const visualClassCode = new Uint8Array(matchCount);
    const podIndices = new Uint32Array(matchCount);

    let out = 0;
    for (let i = 0; i < pt.count; i++) {
      if (targetNsIdx >= 0 && pt.nsIdx[i] !== targetNsIdx) continue;
      if (targetCtrlIdx >= 0 && pt.ctrlIdx[i] !== targetCtrlIdx) continue;
      const bay = bayByNodeIdx[pt.nodeIdx[i]];
      if (!bay) continue;
      const k = bay.cursor++;
      const c = k % bay.cols;
      const row = (k / bay.cols) | 0;
      positions[out * 3] = bay.x + (c - (bay.cols - 1) * 0.5) * bay.stepX;
      positions[out * 3 + 1] = 0.42;
      positions[out * 3 + 2] = bay.z + (row - (bay.rows - 1) * 0.5) * bay.stepZ;
      cellSizes[out] = bay.cellSize;
      visualClassCode[out] = pt.visualClassCode[i];
      podIndices[out] = i;
      out++;
    }

    return {
      ...basePlan,
      podSlots: new Map(),
      podLayout: {
        count: out,
        positions,
        cellSizes,
        visualClassCode,
        podIndices,
        deckId,
      },
    };
  }

  const rawPods = cluster.pods || [];
  const rawIdxByPod = new Map(rawPods.map((p, idx) => [p, idx]));
  const pods = drillFilter
    ? rawPods.filter((p) =>
        drillFilter.type === 'namespace'
          ? p.namespace === drillFilter.key
          : p.controller === drillFilter.key
      )
    : rawPods;

  const activeNodeKeys = drillFilter ? new Set(pods.map((p) => p.nodeKey)) : null;
  const nodes =
    activeNodeKeys && activeNodeKeys.size > 0
      ? allNodes.filter((n) => activeNodeKeys.has(n.key))
      : allNodes;

  const basePlan = planPadDeck(nodes, deckId, targetWidth);
  const padList = [...basePlan.pads.values()];

  const bayByNodeKey = new Map();
  const bayByNodeIdx = new Array(nodes.length);

  padList.forEach((pad, idx) => {
    const n = Math.max(1, pad.item.usedPods || 1);
    const isCompact = Boolean(pad.isCompactPad);
    const bayW = pad.w * (isCompact ? 0.84 : 0.86);
    const bayD = pad.d * (isCompact ? 0.82 : 0.54);
    const bayCenterZ = isCompact ? pad.z : pad.z - pad.d * 0.16;
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * bayW) / Math.max(0.15, bayD))));
    const rows = Math.max(1, Math.ceil(n / cols));
    const stepX = cols > 1 ? bayW / cols : 0;
    const stepZ = rows > 1 ? bayD / rows : 0;
    const cellSize = Math.max(0.032, Math.min(0.46, Math.min(bayW / cols, bayD / rows) * 0.68));
    const bay = { x: pad.x, z: bayCenterZ, cols, rows, stepX, stepZ, cellSize, cursor: 0 };
    bayByNodeKey.set(pad.key, bay);
    bayByNodeIdx[idx] = bay;
  });

  const podSlots = new Map();
  const positions = new Float32Array(pods.length * 3);
  const cellSizes = new Float32Array(pods.length);
  const visualClassCode = new Uint8Array(pods.length);
  const podIndices = new Uint32Array(pods.length);
  const vMap = { running: 0, transition: 1, crashed: 2, pending: 3, suspended: 4 };
  let out = 0;

  for (const pod of pods) {
    const bay = bayByNodeKey.get(pod.nodeKey) || bayByNodeIdx[0];
    if (!bay) continue;
    const k = bay.cursor++;
    const c = k % bay.cols;
    const row = Math.floor(k / bay.cols);
    const px = bay.x + (c - (bay.cols - 1) / 2) * bay.stepX;
    const pz = bay.z + (row - (bay.rows - 1) / 2) * bay.stepZ;

    podSlots.set(pod.key, {
      x: px,
      z: pz,
      y: 0.42,
      cellSize: bay.cellSize,
      deckId,
      district: pod.nodePool,
      pod,
    });

    positions[out * 3] = px;
    positions[out * 3 + 1] = 0.42;
    positions[out * 3 + 2] = pz;
    cellSizes[out] = bay.cellSize;
    visualClassCode[out] = vMap[pod.visualClass] ?? 0;
    podIndices[out] = rawIdxByPod.get(pod) ?? out;
    out++;
  }

  return {
    ...basePlan,
    podSlots,
    podLayout: {
      count: out,
      positions,
      cellSizes,
      visualClassCode,
      podIndices,
      deckId,
    },
  };
}

/** Plans a deck of rectangular pads (Workloads, Nodes, or Ingresses) grouped by Namespace/Pool. */
export function planPadDeck(items, deckId, targetWidth = 24) {
  if (!items || items.length === 0) {
    return {
      w: 18,
      d: 10,
      blocks: [],
      pads: new Map(),
    };
  }

  const byNs = new Map();
  for (const it of items) {
    const ns = it.namespace || 'default';
    if (!byNs.has(ns)) byNs.set(ns, []);
    byNs.get(ns).push(it);
  }

  const groups = [...byNs.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
  );
  const totalItems = items.length;

  // High-scale squarified Node Pool layout when > 120 pads (e.g. 250 or 5,000 GKE Nodes)
  if (totalItems > 120) {
    const islandW = Math.max(58, targetWidth - ISLAND_MARGIN * 1.4);
    const islandD = totalItems > 1000 ? 36 : 30;
    const rects = squarify(
      groups.map(([ns, list]) => ({ item: { ns, list }, weight: Math.max(1, list.length) })),
      { x: -islandW / 2, z: -islandD / 2, w: islandW, d: islandD }
    );

    const blocks = [];
    const pads = new Map();

    for (const r of rects) {
      const { ns, list } = r.item;
      const bw = Math.max(2.0, r.w - 0.55);
      const bd = Math.max(2.0, r.d - 0.55);
      const innerW = Math.max(1.2, bw - 0.65);
      const innerD = Math.max(1.2, bd - 0.85);
      const n = Math.max(1, list.length);
      const cols = Math.max(1, Math.ceil(Math.sqrt((n * innerW) / Math.max(0.2, innerD))));
      const rows = Math.max(1, Math.ceil(n / cols));
      const cellW = innerW / cols;
      const cellD = innerD / rows;
      const padW = Math.max(0.18, cellW * 0.82);
      const padD = Math.max(0.18, cellD * 0.8);

      list.forEach((item, idx) => {
        const col = idx % cols;
        const row = (idx / cols) | 0;
        const px = r.x + (col - (cols - 1) * 0.5) * cellW;
        const pz = r.z + (row - (rows - 1) * 0.5) * cellD + 0.08;
        pads.set(item.key, {
          key: item.key,
          deckId,
          namespace: ns,
          x: px,
          z: pz,
          y: 0,
          w: padW,
          d: padD,
          isCompactPad: true,
          item,
        });
      });

      blocks.push({
        name: ns,
        machineType: list[0]?.machineType || null,
        deckId,
        x: r.x,
        z: r.z,
        y: 0,
        w: bw,
        d: bd,
        count: list.length,
      });
    }

    return {
      w: islandW + ISLAND_MARGIN * 2,
      d: islandD + ISLAND_MARGIN * 2,
      blocks,
      pads,
    };
  }
  // Scale down pad dimensions gracefully when there are many nodes (e.g. 40-96 nodes in scale tests)
  const scale = totalItems > 45 ? 0.56 : totalItems > 20 ? 0.75 : 1.0;
  const padW = PAD_W * scale;
  const padD = PAD_D * scale;
  const gapX = PAD_GAP_X * scale;
  const gapZ = PAD_GAP_Z * scale;

  const maxCols = Math.max(3, Math.min(12, Math.floor(targetWidth / (padW + gapX))));

  // Pack namespace/pool blocks into rows
  const blockSpecs = groups.map(([ns, list]) => {
    const cols = Math.min(maxCols, Math.max(1, list.length));
    const rows = Math.ceil(list.length / cols);
    const bw = cols * padW + (cols - 1) * gapX + 1.8 * scale;
    const bd = rows * padD + (rows - 1) * gapZ + 2.1 * scale;
    return { ns, list, cols, rows, bw, bd };
  });

  const shelfWidth = Math.max(targetWidth, ...blockSpecs.map((b) => b.bw));
  const shelfRows = [];
  let curRow = [];
  let curW = 0;

  for (const b of blockSpecs) {
    if (curRow.length > 0 && curW + 1.4 + b.bw > shelfWidth) {
      shelfRows.push(curRow);
      curRow = [b];
      curW = b.bw;
    } else {
      curW += (curRow.length ? 1.4 : 0) + b.bw;
      curRow.push(b);
    }
  }
  if (curRow.length > 0) shelfRows.push(curRow);

  const totalD =
    shelfRows.reduce((s, r) => s + Math.max(...r.map((b) => b.bd)), 0) +
    Math.max(0, shelfRows.length - 1) * 1.5;
  const maxRowW = Math.max(
    ...shelfRows.map((r) => r.reduce((s, b) => s + b.bw, 0) + (r.length - 1) * 1.4)
  );

  const blocks = [];
  const pads = new Map();
  let zCursor = -totalD / 2;

  for (const r of shelfRows) {
    const rowD = Math.max(...r.map((b) => b.bd));
    const rowW = r.reduce((s, b) => s + b.bw, 0) + (r.length - 1) * 1.4;
    let xCursor = -rowW / 2;

    for (const b of r) {
      const bx = xCursor + b.bw / 2;
      const bz = zCursor + rowD / 2;
      const gridW = b.cols * padW + (b.cols - 1) * gapX;
      const gridD = b.rows * padD + (b.rows - 1) * gapZ;

      b.list.forEach((item, idx) => {
        const col = idx % b.cols;
        const row = Math.floor(idx / b.cols);
        const px = bx - gridW / 2 + padW / 2 + col * (padW + gapX);
        const pz = bz - gridD / 2 + padD / 2 + row * (padD + gapZ) + 0.15 * scale;
        pads.set(item.key, {
          key: item.key,
          deckId,
          namespace: b.ns,
          x: px,
          z: pz,
          y: 0,
          w: padW,
          d: padD,
          item,
        });
      });

      blocks.push({
        name: b.ns,
        machineType: b.list[0]?.machineType || null,
        deckId,
        x: bx,
        z: bz,
        y: 0,
        w: b.bw,
        d: b.bd,
        count: b.list.length,
      });

      xCursor += b.bw + 1.4;
    }
    zCursor += rowD + 1.5;
  }

  return {
    w: Math.max(targetWidth, maxRowW + ISLAND_MARGIN * 1.8),
    d: Math.max(10.5, totalD + ISLAND_MARGIN * 1.5),
    blocks,
    pads,
  };
}

/** Vertical gap between stacked decks so the upper deck doesn't obscure the lower deck at 25deg tilt. */
export function computeDeckGap(middleDeck, bottomDeck) {
  const maxD = Math.max(middleDeck.d || 16, bottomDeck.d || 12);
  return Math.min(21, Math.max(16, Math.round(0.28 * maxD + 8.5)));
}

/**
 * Plans a single cluster's Decks layout in '3-deck', '2-deck', or 'combined' mode:
 * - Deck 1 (Top, id: 'ingress'): Ingress & Routing (Gateways, HTTPRoutes, Services)
 * - Deck 2 (Middle, id: 'pods'): Workloads & Namespaces (Deployments, StatefulSets, DaemonSets, Jobs inside squarified Namespace Districts)
 * - Deck 3 (Bottom, id: 'controllers'): Pods & Substrate — either:
 *    - bottomMode === 'workloads' ('namespaces'): All Pods dynamically sized inside squarified Namespace Districts
 *    - bottomMode === 'nodes': GKE Compute Nodes grouped by Node Pool with capacity bars AND scheduled Pods on each Node!
 */
export function planClusterDecks(
  cluster,
  { layoutMode = '3-deck', bottomMode = 'workloads', drillFilter = null } = {}
) {
  const isNodes = bottomMode === 'nodes';

  // Deck 2 (Middle): Workloads & Namespaces
  const workloadsPlan = planWorkloadsDeck(cluster, 'pods');

  // Deck 3 (Bottom): Pods in Namespaces OR Pods on GKE Nodes
  const bottomPodsPlan = isNodes
    ? planNodesWithPodsDeck(cluster, 'controllers', workloadsPlan.w * 0.96, drillFilter)
    : planNamespaceDistricts(cluster, {
        deckId: 'controllers',
        targetW: workloadsPlan.w,
        targetD: workloadsPlan.d,
        drillFilter,
      });

  // Deck 1 (Top): Ingress & Routing
  const ingPlan = planPadDeck(cluster.ingresses || [], 'ingress', workloadsPlan.w * 0.92);

  const visiblePodCount =
    bottomPodsPlan.podLayout?.count ?? (cluster.podCount || cluster.pods?.length || 0);
  const visibleNodeCount = isNodes
    ? (bottomPodsPlan.pads?.size ?? (cluster.nodes || []).length)
    : (cluster.nodes || []).length;
  const drillLabel = drillFilter ? ` (scoped to ${drillFilter.key})` : '';
  const bottomTitle = isNodes ? 'Pods & GKE Nodes' : 'Pods & Namespaces';
  const bottomSubtitle = isNodes
    ? `${visiblePodCount.toLocaleString()} pods on ${visibleNodeCount.toLocaleString()} nodes${drillLabel}`
    : `${visiblePodCount.toLocaleString()} pods in ${bottomPodsPlan.districts.length} namespaces${drillLabel}`;

  const gap = computeDeckGap(workloadsPlan, bottomPodsPlan);

  if (layoutMode === 'combined') {
    const frontShiftZ = workloadsPlan.d / 2 + bottomPodsPlan.d / 2 + 1.4;
    const backShiftZ = -(workloadsPlan.d / 2 + ingPlan.d / 2 + 1.4);

    if (bottomPodsPlan.districts) {
      for (const d of bottomPodsPlan.districts) {
        d.z += frontShiftZ;
        d.deckId = 'pods';
      }
    }
    if (bottomPodsPlan.blocks) {
      for (const b of bottomPodsPlan.blocks) {
        b.z += frontShiftZ;
        b.deckId = 'pods';
      }
    }
    if (bottomPodsPlan.pads) {
      for (const p of bottomPodsPlan.pads.values()) {
        p.z += frontShiftZ;
        p.deckId = 'pods';
      }
    }
    for (const s of bottomPodsPlan.podSlots.values()) {
      s.z += frontShiftZ;
      s.deckId = 'pods';
    }
    if (bottomPodsPlan.podLayout) {
      bottomPodsPlan.podLayout.deckId = 'pods';
      const pos = bottomPodsPlan.podLayout.positions;
      for (let i = 0; i < bottomPodsPlan.podLayout.count; i++) {
        pos[i * 3 + 2] += frontShiftZ;
      }
    }

    for (const b of ingPlan.blocks) {
      b.z += backShiftZ;
      b.deckId = 'pods';
    }
    for (const p of ingPlan.pads.values()) {
      p.z += backShiftZ;
      p.deckId = 'pods';
    }

    const totalW = Math.max(workloadsPlan.w, bottomPodsPlan.w, ingPlan.w) + 2;
    const totalD = workloadsPlan.d + bottomPodsPlan.d + ingPlan.d + 5;

    return {
      mode: 'cluster',
      layoutMode: 'combined',
      bottomMode,
      drillFilter,
      clusterName: cluster.name,
      gap: 0,
      decks: [
        {
          id: 'pods',
          index: 1,
          title: `${cluster.name} · Combined Island`,
          subtitle: `${cluster.ingresses.length} ingresses · ${cluster.controllers.length} workloads · ${visiblePodCount.toLocaleString()} pods`,
          x: 0,
          y: 0,
          z: 0,
          w: totalW,
          d: totalD,
        },
      ],
      portal: {
        deckId: 'pods',
        x: -totalW / 2 + 2.8,
        y: 0,
        z: backShiftZ,
      },
      districts: workloadsPlan.districts,
      workloadPads: workloadsPlan.workloadPads,
      podDistricts: bottomPodsPlan.districts || [],
      podSlots: bottomPodsPlan.podSlots,
      podLayout: bottomPodsPlan.podLayout,
      nodeBlocks: bottomPodsPlan.blocks || [],
      nodePads: bottomPodsPlan.pads || new Map(),
      ctrlBlocks: isNodes ? bottomPodsPlan.blocks || [] : workloadsPlan.districts,
      ctrlPads: isNodes ? bottomPodsPlan.pads : workloadsPlan.workloadPads,
      ingBlocks: ingPlan.blocks,
      ingPads: ingPlan.pads,
    };
  }

  // Align front edges (+z) of stacked decks
  const frontZ = Math.max(workloadsPlan.d, bottomPodsPlan.d) / 2;
  const midZ = frontZ - workloadsPlan.d / 2;
  const botZ = frontZ - bottomPodsPlan.d / 2;
  const ingZ = frontZ - ingPlan.d / 2;

  for (const d of workloadsPlan.districts) d.z += midZ;
  for (const p of workloadsPlan.workloadPads.values()) p.z += midZ;

  if (bottomPodsPlan.districts) {
    for (const d of bottomPodsPlan.districts) {
      d.z += botZ;
      d.y = -gap;
    }
  }
  if (bottomPodsPlan.blocks) {
    for (const b of bottomPodsPlan.blocks) {
      b.z += botZ;
      b.y = -gap;
    }
  }
  if (bottomPodsPlan.pads) {
    for (const p of bottomPodsPlan.pads.values()) {
      p.z += botZ;
      p.y = -gap;
    }
  }
  for (const s of bottomPodsPlan.podSlots.values()) {
    s.z += botZ;
    s.y = (s.y || 0) - gap;
  }
  if (bottomPodsPlan.podLayout) {
    const pos = bottomPodsPlan.podLayout.positions;
    for (let i = 0; i < bottomPodsPlan.podLayout.count; i++) {
      pos[i * 3 + 2] += botZ;
    }
  }

  const decks = [];
  if (layoutMode === '3-deck') {
    const ingY = gap * 0.92;
    for (const b of ingPlan.blocks) {
      b.z += ingZ;
      b.y = ingY;
    }
    for (const p of ingPlan.pads.values()) {
      p.z += ingZ;
      p.y = ingY;
    }
    decks.push({
      id: 'ingress',
      index: 1,
      title: 'Ingress & Routing',
      subtitle: `${cluster.ingresses.length} gateways, routes & services`,
      x: 0,
      y: ingY,
      z: ingZ,
      w: ingPlan.w,
      d: ingPlan.d,
    });
    decks.push({
      id: 'pods',
      index: 2,
      title: 'Workloads & Namespaces',
      subtitle: `${cluster.controllers.length} workloads in ${workloadsPlan.districts.length} namespaces`,
      x: 0,
      y: 0,
      z: midZ,
      w: workloadsPlan.w,
      d: workloadsPlan.d,
    });
    decks.push({
      id: 'controllers',
      index: 3,
      title: bottomTitle,
      subtitle: bottomSubtitle,
      x: 0,
      y: -gap,
      z: botZ,
      w: bottomPodsPlan.w,
      d: bottomPodsPlan.d,
    });
  } else {
    // 2-deck mode: Top = Workloads & Namespaces (+ Gateway Portal), Bottom = Pods & Namespaces/Nodes
    decks.push({
      id: 'pods',
      index: 1,
      title: 'Workloads & Namespaces',
      subtitle: `${cluster.controllers.length} workloads in ${workloadsPlan.districts.length} namespaces`,
      x: 0,
      y: 0,
      z: midZ,
      w: workloadsPlan.w,
      d: workloadsPlan.d,
    });
    decks.push({
      id: 'controllers',
      index: 2,
      title: bottomTitle,
      subtitle: bottomSubtitle,
      x: 0,
      y: -gap,
      z: botZ,
      w: bottomPodsPlan.w,
      d: bottomPodsPlan.d,
    });
  }

  const portalDeck = decks[0];
  const portal = {
    deckId: portalDeck.id,
    x: -portalDeck.w / 2 + 2.4,
    y: portalDeck.y,
    z: portalDeck.z - portalDeck.d / 2 + 2.4,
  };

  return {
    mode: 'cluster',
    layoutMode,
    bottomMode,
    drillFilter,
    clusterName: cluster.name,
    gap,
    decks,
    portal,
    districts: workloadsPlan.districts,
    workloadPads: workloadsPlan.workloadPads,
    podDistricts: bottomPodsPlan.districts || [],
    podSlots: bottomPodsPlan.podSlots,
    podLayout: bottomPodsPlan.podLayout,
    nodeBlocks: bottomPodsPlan.blocks || [],
    nodePads: bottomPodsPlan.pads || new Map(),
    ctrlBlocks: isNodes ? bottomPodsPlan.blocks || [] : workloadsPlan.districts,
    ctrlPads: isNodes ? bottomPodsPlan.pads : workloadsPlan.workloadPads,
    ingBlocks: layoutMode === '3-deck' ? ingPlan.blocks : [],
    ingPads: layoutMode === '3-deck' ? ingPlan.pads : new Map(),
  };
}

/**
 * Plans Level 1: Multi-Cluster Fleet Overview Deck.
 * Each GKE cluster gets its own 3D Cluster Platform card on the Fleet slab.
 */
export function planFleetOverview(clusters = []) {
  const sorted = [...clusters].sort((a, b) => {
    const aCrash = a.counts?.crashed || 0;
    const bCrash = b.counts?.crashed || 0;
    if (aCrash !== bCrash) return bCrash - aCrash;
    return (b.podCount || b.pods?.length || 0) - (a.podCount || a.pods?.length || 0);
  });

  const n = Math.max(1, sorted.length);
  const cols = Math.max(2, Math.ceil(Math.sqrt(n * 1.25)));
  const rows = Math.max(1, Math.ceil(n / cols));

  const cardW = 11.5;
  const cardD = 8.2;
  const gapX = 2.6;
  const gapZ = 2.8;

  const gridW = cols * cardW + (cols - 1) * gapX;
  const gridD = rows * cardD + (rows - 1) * gapZ;

  const platforms = sorted.map((c, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = -gridW / 2 + cardW / 2 + col * (cardW + gapX);
    const z = -gridD / 2 + cardD / 2 + row * (cardD + gapZ);
    const counts = c.counts || { running: 0, transition: 0, crashed: 0, pending: 0, suspended: 0 };
    return {
      name: c.name,
      location: c.location,
      tier: c.tier,
      x,
      y: 0,
      z,
      w: cardW,
      d: cardD,
      counts,
      podCount: c.podCount || c.pods?.length || 0,
      nodeCount: c.nodes?.length || 0,
      controllerCount: c.controllers?.length || 0,
      ingressCount: c.ingresses?.length || 0,
      hasIncident: (counts.crashed || 0) > 0,
      cluster: c,
    };
  });

  return {
    mode: 'fleet',
    w: gridW + 7,
    d: gridD + 7,
    platforms,
    decks: [
      {
        id: 'fleet',
        index: 0,
        title: 'GKE Multi-Cluster Fleet Deck',
        subtitle: `${clusters.length} clusters · click any cluster platform to dive into its decks`,
        x: 0,
        y: 0,
        z: 0,
        w: gridW + 7,
        d: gridD + 7,
      },
    ],
  };
}

/**
 * Cubic-Bezier inner control points pulled toward shared waypoints (p, d)
 * so cross-deck beams bundle like cables and fan out cleanly at both ends.
 */
export function bundleControls(a, p, d, q, beta = 0.84) {
  const pull = (raw, shared) => ({
    x: raw.x + beta * (shared.x - raw.x),
    y: raw.y,
    z: raw.z + beta * (shared.z - raw.z),
  });
  const c1Raw = {
    x: a.x + (q.x - a.x) / 3,
    y: a.y + (q.y - a.y) / 3,
    z: a.z + (q.z - a.z) / 3,
  };
  const c2Raw = {
    x: a.x + (2 * (q.x - a.x)) / 3,
    y: a.y + (2 * (q.y - a.y)) / 3,
    z: a.z + (2 * (q.z - a.z)) / 3,
  };
  return [pull(c1Raw, p), pull(c2Raw, d)];
}

/** Evaluates a 3D cubic Bezier curve at t in [0, 1]. */
export function bezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
    z: b0 * p0.z + b1 * p1.z + b2 * p2.z + b3 * p3.z,
  };
}

export function createDeckOffsets() {
  return {
    ingress: { dx: 0, dy: 0, dz: 0 },
    pods: { dx: 0, dy: 0, dz: 0 },
    controllers: { dx: 0, dy: 0, dz: 0 },
  };
}

export function applyDeckMove(offsets, deckId, delta, linked = true) {
  const next = {
    ingress: { ...offsets.ingress },
    pods: { ...offsets.pods },
    controllers: { ...offsets.controllers },
  };
  if (!next[deckId]) return next;

  const dx = delta.dx || 0;
  const dz = delta.dz || 0;
  const dy = delta.dy || 0;

  next[deckId].dx = Math.max(-70, Math.min(70, next[deckId].dx + dx));
  next[deckId].dz = Math.max(-70, Math.min(70, next[deckId].dz + dz));
  next[deckId].dy = Math.max(-20, Math.min(35, next[deckId].dy + dy));

  if (linked && (dx !== 0 || dz !== 0)) {
    for (const other of ['ingress', 'pods', 'controllers']) {
      if (other !== deckId) {
        next[other].dx = Math.max(-70, Math.min(70, next[other].dx - dx * 0.65));
        next[other].dz = Math.max(-70, Math.min(70, next[other].dz - dz * 0.65));
      }
    }
  }
  return next;
}
