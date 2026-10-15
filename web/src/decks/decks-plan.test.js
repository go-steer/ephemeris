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

import { describe, it, expect } from 'vitest';
import { THEMES, TOKENS, token, themeById, cssVars } from './themes.js';
import {
  buildMockFleet,
  adaptLiveTopologyToFleet,
  remediateTarget,
  nextMockEvent,
  materializePodAt,
} from './mock-data.js';
import {
  planFleetOverview,
  planClusterDecks,
  bundleControls,
  bezier,
  createDeckOffsets,
  applyDeckMove,
} from './decks-plan.js';
import {
  synthesizeDecksTriagePayload,
  defaultPromptForItem,
  generateSimulatedLogEntry,
} from './decks-triage.js';
import { ArrowSandboxRuntime } from '../sandbox/runtime.js';

describe('Ephemeris Decks Themes (Dark & Light parity with substrate-scope)', () => {
  it('defines both dark and light themes with all required tokens', () => {
    const modes = new Set(THEMES.map((t) => t.mode));
    expect(modes.has('dark')).toBe(true);
    expect(modes.has('light')).toBe(true);

    for (const t of THEMES) {
      for (const tk of TOKENS) {
        if (tk === 'scene.stars') continue;
        expect(token(t, tk), `${t.id}.${tk}`).toBeDefined();
      }
      const vars = cssVars(t);
      expect(vars['--bg']).toBe(t.scene.background);
      expect(vars['--running']).toBe(t.states.running);
      expect(vars['--crashed']).toBe(t.states.crashed);
    }
  });

  it('resolves themeById with fallback to abyss-neon', () => {
    expect(themeById('google-light').mode).toBe('light');
    expect(themeById('abyss-neon').mode).toBe('dark');
    expect(themeById('unknown-theme').id).toBe('abyss-neon');
  });
});

describe('Ephemeris Decks Mock Fleet & Scenarios', () => {
  it('generates multi-cluster fleet with ingresses, workloads (including Jobs), and pods', () => {
    const fleet = buildMockFleet({ scenario: 'default' });
    expect(fleet.clusters.length).toBeGreaterThanOrEqual(6);

    const primary = fleet.clusters[0];
    expect(primary.name).toBe('ap-iap-testing');
    expect(primary.pods.length).toBeGreaterThan(15);
    expect(primary.controllers.length).toBeGreaterThan(5);
    expect(primary.controllers.some((c) => c.kind === 'Job')).toBe(true);
    expect(primary.ingresses.length).toBeGreaterThan(4);
    expect(primary.counts.crashed).toBeGreaterThan(0);

    const ev = nextMockEvent(primary, 0);
    expect(ev).not.toBeNull();
    expect(ev.cluster).toBe('ap-iap-testing');
  });

  it('heals crashing pods via remediateTarget', () => {
    const fleet = buildMockFleet({ scenario: 'default' });
    const primary = fleet.clusters[0];
    const crashedPod = primary.pods.find((p) => p.visualClass === 'crashed');
    expect(crashedPod).toBeDefined();

    const healed = remediateTarget(primary, crashedPod.controller);
    expect(healed).toBeGreaterThan(0);
    expect(crashedPod.visualClass).toBe('running');
  });

  it('adapts live /ws TopologyData (with ns.resources and ephemeris.io/node labels) to Decks fleet', () => {
    const liveTopo = {
      mode: 'live',
      project_id: 'gke-demos-345619',
      clusters: [
        {
          name: 'std-stable-1-35',
          location: 'us-central1',
          namespaces: [
            {
              name: 'default',
              resources: [
                { kind: 'Deployment', name: 'web-frontend', replicas: '2/2', status: 'Healthy' },
                { kind: 'Gateway', name: 'external-gw', status: 'Healthy' },
              ],
              pods: [
                {
                  name: 'web-frontend-7b9f-x1',
                  status: 'Running',
                  restarts: 0,
                  labels: { 'ephemeris.io/node': 'gke-std-stable-default-pool-a1b2' },
                },
                {
                  name: 'web-frontend-7b9f-x2',
                  status: 'Running',
                  restarts: 0,
                  labels: { 'ephemeris.io/node': 'gke-std-stable-default-pool-a1b2' },
                },
              ],
            },
          ],
        },
      ],
    };

    const adapted = adaptLiveTopologyToFleet(liveTopo);
    expect(adapted.mode).toBe('live');
    expect(adapted.clusters[0].name).toBe('std-stable-1-35');
    expect(adapted.clusters[0].controllers.length).toBe(1);
    expect(adapted.clusters[0].controllers[0].readyReplicas).toBe(2);
    expect(adapted.clusters[0].ingresses.length).toBe(1);
    expect(adapted.clusters[0].nodes[0].name).toBe('gke-std-stable-default-pool-a1b2');
  });
});

describe('Ephemeris Decks Spatial Planner (3-Deck Hierarchy + 500 Namespaces / 100K Pods Scale)', () => {
  const fleet = buildMockFleet({ scenario: 'default' });
  const cluster = fleet.clusters[0];

  it('plans Level 1 Multi-Cluster Fleet Overview Deck with incident sorting', () => {
    const plan = planFleetOverview(fleet.clusters);
    expect(plan.mode).toBe('fleet');
    expect(plan.platforms.length).toBe(fleet.clusters.length);
    expect(plan.platforms[0].hasIncident).toBe(true);
  });

  it('plans 3-deck mode: Deck 1 Ingress, Deck 2 Workloads & Namespaces, Deck 3 Pods & Namespaces', () => {
    const plan = planClusterDecks(cluster, { layoutMode: '3-deck', bottomMode: 'namespaces' });
    expect(plan.decks.map((d) => d.id)).toEqual(['ingress', 'pods', 'controllers']);
    expect(plan.decks[0].title).toBe('Ingress & Routing');
    expect(plan.decks[1].title).toBe('Workloads & Namespaces');
    expect(plan.decks[2].title).toBe('Pods & Namespaces');
    expect(plan.decks[0].y).toBeGreaterThan(0);
    expect(plan.decks[1].y).toBe(0);
    expect(plan.decks[2].y).toBeLessThan(0);
    expect(plan.ingPads.size).toBe(cluster.ingresses.length);
    expect(plan.workloadPads.size).toBe(cluster.controllers.length);
    expect(plan.podLayout.count).toBe(cluster.pods.length);
  });

  it('plans Deck 3 bottomMode = nodes with GKE Node Pads and scheduled Pods packed on each Node', () => {
    expect(cluster.nodes.length).toBeGreaterThanOrEqual(5);
    const plan = planClusterDecks(cluster, { layoutMode: '3-deck', bottomMode: 'nodes' });
    expect(plan.bottomMode).toBe('nodes');
    expect(plan.decks[2].title).toBe('Pods & GKE Nodes');
    expect(plan.nodePads.size).toBe(cluster.nodes.length);
    expect(plan.nodeBlocks.length).toBeGreaterThanOrEqual(3);
    expect(plan.podLayout.count).toBe(cluster.pods.length);
    for (const p of cluster.pods) {
      expect(plan.nodePads.has(p.nodeKey)).toBe(true);
    }
  });

  it('scopes Deck 3 Pods when drillFilter is set to a Namespace or Workload and enlarges cells', () => {
    const fullPlan = planClusterDecks(cluster, { layoutMode: '3-deck', bottomMode: 'namespaces' });
    const scopedPlan = planClusterDecks(cluster, {
      layoutMode: '3-deck',
      bottomMode: 'namespaces',
      drillFilter: { type: 'namespace', key: 'payments', label: 'Namespace: payments' },
    });
    const paymentsPods = cluster.pods.filter((p) => p.namespace === 'payments').length;
    expect(scopedPlan.podLayout.count).toBe(paymentsPods);
    expect(scopedPlan.podLayout.count).toBeLessThan(fullPlan.podLayout.count);
    // Scoped pods have larger dynamic cell size than full cluster pods
    expect(scopedPlan.podLayout.cellSizes[0]).toBeGreaterThanOrEqual(
      fullPlan.podLayout.cellSizes[0]
    );
  });

  it('scales to 500 Namespaces, 5,000 GKE Nodes, and 100,000 Pods (scale-100k) with typed-array podLayout', () => {
    const megaFleet = buildMockFleet({ scenario: 'scale-100k' });
    const megaCluster = megaFleet.clusters[0];
    expect(megaCluster.namespaces.length).toBe(500);
    expect(megaCluster.nodes.length).toBe(5000);
    expect(megaCluster.podCount).toBe(100000);
    expect(megaCluster.podTable).not.toBeNull();

    const samplePod = materializePodAt(megaCluster, 42);
    expect(samplePod).not.toBeNull();
    expect(samplePod.cluster).toBe('ap-iap-testing');

    const nsPlan = planClusterDecks(megaCluster, {
      layoutMode: '3-deck',
      bottomMode: 'namespaces',
    });
    expect(nsPlan.districts.length).toBe(500);
    expect(nsPlan.podDistricts.length).toBe(500);
    expect(nsPlan.podLayout.count).toBe(100000);

    const nodesPlan = planClusterDecks(megaCluster, {
      layoutMode: '3-deck',
      bottomMode: 'nodes',
    });
    expect(nodesPlan.nodePads.size).toBe(5000);
    expect(nodesPlan.nodeBlocks.length).toBe(4);
    expect(nodesPlan.podLayout.count).toBe(100000);
    // Bounded deck depth even at 5,000 nodes so camera framing stays tight
    expect(nodesPlan.decks[2].d).toBeLessThan(60);

    // Scoping to a namespace in nodes mode scopes Deck 3 to only the active GKE nodes hosting those pods
    const scopedNodesPlan = planClusterDecks(megaCluster, {
      layoutMode: '3-deck',
      bottomMode: 'nodes',
      drillFilter: { type: 'namespace', key: 'payments-001', label: 'Namespace: payments-001' },
    });
    expect(scopedNodesPlan.podLayout.count).toBe(200);
    expect(scopedNodesPlan.nodePads.size).toBeGreaterThan(0);
    expect(scopedNodesPlan.nodePads.size).toBeLessThan(100);
  });

  it('plans 2-deck and combined modes cleanly', () => {
    const twoDeck = planClusterDecks(cluster, { layoutMode: '2-deck' });
    expect(twoDeck.decks.map((d) => d.id)).toEqual(['pods', 'controllers']);

    const combined = planClusterDecks(cluster, { layoutMode: 'combined' });
    expect(combined.decks.length).toBe(1);
    expect(combined.podLayout.count).toBe(cluster.pods.length);
  });

  it('computes bundled cubic-bezier focus beam control points and deck offsets', () => {
    const a = { x: -4, y: 0, z: -2 };
    const p = { x: 0, y: 0, z: 0 };
    const d = { x: 2, y: -16, z: 1 };
    const q = { x: 5, y: -16, z: 3 };
    const [c1, c2] = bundleControls(a, p, d, q, 0.85);
    const mid = bezier(a, c1, c2, q, 0.5);
    expect(mid.y).toBeCloseTo(-8, 1);

    const offsets = createDeckOffsets();
    const moved = applyDeckMove(offsets, 'pods', { dx: 10, dz: -4, dy: 2 }, true);
    expect(moved.pods.dx).toBe(10);
    expect(moved.controllers.dx).toBeCloseTo(-6.5, 2);
  });
});

describe('Ephemeris Decks Generative ArrowJS Triage & Live Log Streaming', () => {
  const fleet = buildMockFleet({ scenario: 'default' });
  const cluster = fleet.clusters[0];

  it('synthesizes valid ArrowJS triage components for pod, controller, node, and ingress that mount in ShadowRoot', () => {
    const host = document.createElement('div');
    const runtime = new ArrowSandboxRuntime(host);

    const pod = cluster.pods.find((p) => p.visualClass === 'crashed') || cluster.pods[0];
    const podPayload = synthesizeDecksTriagePayload({ type: 'pod', data: pod }, '', cluster);
    expect(podPayload.title).toContain(pod.name);
    const podRes = runtime.execute(podPayload.code, podPayload.telemetry);
    expect(podRes.success).toBe(true);
    expect(host.shadowRoot.innerHTML).toContain(pod.name);

    const ctrl = cluster.controllers[0];
    const ctrlPayload = synthesizeDecksTriagePayload(
      { type: 'controller', data: ctrl },
      'Check rollout wave',
      cluster
    );
    const ctrlRes = runtime.execute(ctrlPayload.code, ctrlPayload.telemetry);
    expect(ctrlRes.success).toBe(true);
    expect(host.shadowRoot.innerHTML).toContain(ctrl.name);

    const node = cluster.nodes[0];
    const nodePayload = synthesizeDecksTriagePayload({ type: 'node', data: node }, '', cluster);
    const nodeRes = runtime.execute(nodePayload.code, nodePayload.telemetry);
    expect(nodeRes.success).toBe(true);
    expect(host.shadowRoot.innerHTML).toContain(node.name);

    const ing = cluster.ingresses[0];
    const ingPayload = synthesizeDecksTriagePayload({ type: 'ingress', data: ing }, '', cluster);
    const ingRes = runtime.execute(ingPayload.code, ingPayload.telemetry);
    expect(ingRes.success).toBe(true);
    expect(host.shadowRoot.innerHTML).toContain(ing.name);
  });

  it('generates contextual default prompts and live UTC RFC3339 container log stream entries', () => {
    const crashedPod = cluster.pods.find((p) => p.visualClass === 'crashed');
    expect(defaultPromptForItem({ type: 'pod', data: crashedPod })).toContain('CrashLoopBackOff');

    const logEntry = generateSimulatedLogEntry(crashedPod, 0);
    expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(logEntry.severity).toBe('ERROR');
    expect(logEntry.message.length).toBeGreaterThan(10);
  });
});
