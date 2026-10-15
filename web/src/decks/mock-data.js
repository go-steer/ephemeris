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

// Standalone Multi-Cluster GKE Mock & Synthetic Data Engine for /decks.
// Inspired by substrate-scope's synth.js: lets users test all multi-cluster
// views, 2-deck / 3-deck (Ingress) / combined layouts, focus beams, scenarios,
// and scale presets out-of-the-box with zero external dependencies.

export const SCENARIOS = [
  {
    id: 'default',
    label: 'Incident: Payment CrashLoop + IAP',
    description: 'payment-service CrashLoopBackOff in ap-iap-testing + checkout latency in prod',
  },
  {
    id: 'redis-oom',
    label: 'Chaos: Redis OOM Cascade',
    description: 'redis-cart StatefulSet OOMKilled causing cascading cart & checkout restarts',
  },
  {
    id: 'gateway-spike',
    label: 'Chaos: Gateway 5xx Surge (HPA Scale)',
    description: 'Traffic surge on iap-gateway triggering HPA burst (Updating + Pending pods)',
  },
  {
    id: 'canary-rollout',
    label: 'Rollout: Canary Wave v2.4',
    description: 'Progressive rollout of store-v2-canary across namespaces with active transitions',
  },
  {
    id: 'healthy',
    label: 'Baseline: All Clusters Healthy',
    description: '100% green steady-state across all 6 GKE clusters',
  },
  {
    id: 'scale-180',
    label: 'Scale Test: 8 Namespaces / 180 Pods',
    description: 'Medium-scale synthetic stress test across 8 namespaces',
  },
  {
    id: 'scale-400',
    label: 'Scale Test: 10 Namespaces / 400 Pods',
    description: 'High-density squarified district and bundled beam stress test',
  },
  {
    id: 'scale-5k',
    label: 'Scale Test: 50 NS / 250 Nodes / 5K Pods',
    description:
      'Large enterprise GKE cluster with 50 namespaces, 100 workloads, 250 nodes, and 5,000 pods',
  },
  {
    id: 'scale-100k',
    label: 'Mega Scale: 500 NS / 5K Nodes / 100K Pods',
    description:
      'Hyperscale GKE stress test: 500 namespaces, 1,000 workloads, 5,000 GKE nodes, and 100,000 GPU-instanced pods',
  },
];

/** Deterministic PRNG so a given scenario + cluster always lays out reproducibly. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function statusToVisualClass(status) {
  const s = (status || '').toLowerCase();
  if (
    s.includes('crash') ||
    s.includes('oom') ||
    s.includes('err') ||
    s.includes('fail') ||
    s.includes('backoff')
  ) {
    return 'crashed';
  }
  if (
    s.includes('creat') ||
    s.includes('init') ||
    s.includes('terminat') ||
    s.includes('updat') ||
    s.includes('rollout')
  ) {
    return 'transition';
  }
  if (s.includes('pend') || s.includes('unsched')) {
    return 'pending';
  }
  if (
    s.includes('complete') ||
    s.includes('succeed') ||
    s.includes('suspend') ||
    s.includes('park')
  ) {
    return 'suspended';
  }
  return 'running';
}

const CLUSTER_BLUEPRINTS = [
  {
    name: 'ap-iap-testing',
    location: 'us-central1',
    tier: 'Autopilot · IAP Mesh',
    workloads: [
      {
        ns: 'default',
        controller: 'store-v1',
        kind: 'Deployment',
        replicas: 4,
        cpuReq: 350,
        memReq: 512,
        ingress: {
          name: 'iap-gateway',
          kind: 'Gateway',
          route: 'store-httproute',
          service: 'store-v1-svc',
          vip: '34.149.88.12',
          rps: 840,
        },
      },
      {
        ns: 'default',
        controller: 'frontend-proxy',
        kind: 'Deployment',
        replicas: 3,
        cpuReq: 250,
        memReq: 384,
        ingress: {
          name: 'iap-gateway',
          kind: 'Gateway',
          route: 'store-httproute',
          service: 'frontend-proxy-svc',
          vip: '34.149.88.12',
          rps: 1120,
        },
      },
      {
        ns: 'payments',
        controller: 'payment-service',
        kind: 'Deployment',
        replicas: 4,
        cpuReq: 500,
        memReq: 1024,
        ingress: {
          name: 'payments-gw',
          kind: 'Gateway',
          route: 'payments-api-route',
          service: 'payment-svc',
          vip: '34.149.91.44',
          rps: 310,
        },
      },
      {
        ns: 'payments',
        controller: 'ledger-writer',
        kind: 'StatefulSet',
        replicas: 3,
        cpuReq: 600,
        memReq: 1536,
        ingress: {
          name: 'payments-gw',
          kind: 'Gateway',
          route: 'ledger-grpc-route',
          service: 'ledger-hl-svc',
          vip: '10.96.42.18',
          rps: 195,
        },
      },
      {
        ns: 'payments',
        controller: 'settlement-batch',
        kind: 'Job',
        replicas: 2,
        cpuReq: 300,
        memReq: 512,
        ingress: null,
      },
      {
        ns: 'checkout',
        controller: 'cart-service',
        kind: 'Deployment',
        replicas: 4,
        cpuReq: 400,
        memReq: 768,
        ingress: {
          name: 'checkout-ingress',
          kind: 'Ingress',
          route: 'cart-http-route',
          service: 'cart-svc',
          vip: '34.149.95.10',
          rps: 620,
        },
      },
      {
        ns: 'checkout',
        controller: 'redis-cart',
        kind: 'StatefulSet',
        replicas: 3,
        cpuReq: 750,
        memReq: 2048,
        ingress: {
          name: 'redis-internal-svc',
          kind: 'Service',
          route: 'redis-tcp-route',
          service: 'redis-cart-svc',
          vip: '10.96.88.10',
          rps: 2450,
        },
      },
      {
        ns: 'kube-system',
        controller: 'gke-metadata-server',
        kind: 'DaemonSet',
        replicas: 3,
        cpuReq: 120,
        memReq: 256,
        ingress: null,
      },
      {
        ns: 'kube-system',
        controller: 'kube-dns',
        kind: 'Deployment',
        replicas: 2,
        cpuReq: 150,
        memReq: 256,
        ingress: {
          name: 'kube-dns-svc',
          kind: 'Service',
          route: 'cluster-dns',
          service: 'kube-dns',
          vip: '10.96.0.10',
          rps: 3900,
        },
      },
    ],
  },
  {
    name: 'production-us-central1',
    location: 'us-central1-a',
    tier: 'Standard · Core Prod',
    workloads: [
      {
        ns: 'production',
        controller: 'api-gateway-envoy',
        kind: 'Deployment',
        replicas: 5,
        cpuReq: 600,
        memReq: 1024,
        ingress: {
          name: 'prod-external-gw',
          kind: 'Gateway',
          route: 'global-edge-route',
          service: 'envoy-edge-svc',
          vip: '35.201.70.5',
          rps: 4200,
        },
      },
      {
        ns: 'production',
        controller: 'catalog-service',
        kind: 'Deployment',
        replicas: 5,
        cpuReq: 450,
        memReq: 768,
        ingress: {
          name: 'prod-external-gw',
          kind: 'Gateway',
          route: 'catalog-httproute',
          service: 'catalog-svc',
          vip: '35.201.70.5',
          rps: 1850,
        },
      },
      {
        ns: 'checkout',
        controller: 'checkout-worker',
        kind: 'Deployment',
        replicas: 4,
        cpuReq: 550,
        memReq: 1024,
        ingress: {
          name: 'checkout-mesh-gw',
          kind: 'Gateway',
          route: 'checkout-httproute',
          service: 'checkout-svc',
          vip: '35.201.74.19',
          rps: 740,
        },
      },
      {
        ns: 'checkout',
        controller: 'pricing-engine',
        kind: 'Deployment',
        replicas: 3,
        cpuReq: 500,
        memReq: 896,
        ingress: {
          name: 'checkout-mesh-gw',
          kind: 'Gateway',
          route: 'pricing-route',
          service: 'pricing-svc',
          vip: '10.104.12.9',
          rps: 980,
        },
      },
      {
        ns: 'shipping',
        controller: 'fulfillment-tracker',
        kind: 'StatefulSet',
        replicas: 3,
        cpuReq: 400,
        memReq: 1024,
        ingress: {
          name: 'shipping-ing',
          kind: 'Ingress',
          route: 'shipping-webhook',
          service: 'fulfillment-svc',
          vip: '35.201.81.22',
          rps: 310,
        },
      },
      {
        ns: 'observability',
        controller: 'otel-collector',
        kind: 'DaemonSet',
        replicas: 4,
        cpuReq: 250,
        memReq: 512,
        ingress: {
          name: 'otel-grpc-svc',
          kind: 'Service',
          route: 'otlp-ingest',
          service: 'otel-collector-svc',
          vip: '10.104.99.4',
          rps: 5100,
        },
      },
    ],
  },
  {
    name: 'checkout-eu-west1',
    location: 'eu-west1-b',
    tier: 'Standard · EU Regional',
    workloads: [
      {
        ns: 'eu-checkout',
        controller: 'eu-storefront',
        kind: 'Deployment',
        replicas: 4,
        cpuReq: 400,
        memReq: 640,
        ingress: {
          name: 'eu-edge-gw',
          kind: 'Gateway',
          route: 'eu-store-route',
          service: 'eu-storefront-svc',
          vip: '34.77.14.88',
          rps: 1340,
        },
      },
      {
        ns: 'eu-checkout',
        controller: 'eu-redis-cluster',
        kind: 'StatefulSet',
        replicas: 3,
        cpuReq: 800,
        memReq: 2048,
        ingress: {
          name: 'eu-redis-svc',
          kind: 'Service',
          route: 'eu-redis-tcp',
          service: 'eu-redis-hl',
          vip: '10.112.8.40',
          rps: 3100,
        },
      },
      {
        ns: 'eu-payments',
        controller: 'sepa-processor',
        kind: 'Deployment',
        replicas: 3,
        cpuReq: 450,
        memReq: 1024,
        ingress: {
          name: 'eu-edge-gw',
          kind: 'Gateway',
          route: 'sepa-httproute',
          service: 'sepa-svc',
          vip: '34.77.14.88',
          rps: 420,
        },
      },
      {
        ns: 'kube-system',
        controller: 'cilium-agent',
        kind: 'DaemonSet',
        replicas: 3,
        cpuReq: 200,
        memReq: 384,
        ingress: null,
      },
    ],
  },
  {
    name: 'ai-inference-gpu',
    location: 'us-east4-c',
    tier: 'L4 GPU · Model Serving',
    workloads: [
      {
        ns: 'ai-serving',
        controller: 'gemini-router-proxy',
        kind: 'Deployment',
        replicas: 4,
        cpuReq: 500,
        memReq: 1024,
        ingress: {
          name: 'ai-inference-gw',
          kind: 'Gateway',
          route: 'v1-generate-route',
          service: 'gemini-router-svc',
          vip: '34.145.60.11',
          rps: 590,
        },
      },
      {
        ns: 'ai-serving',
        controller: 'vllm-l4-worker',
        kind: 'StatefulSet',
        replicas: 4,
        cpuReq: 900,
        memReq: 3072,
        ingress: {
          name: 'ai-inference-gw',
          kind: 'Gateway',
          route: 'vllm-tensor-route',
          service: 'vllm-worker-svc',
          vip: '10.120.4.55',
          rps: 410,
        },
      },
      {
        ns: 'ai-serving',
        controller: 'embedding-cache',
        kind: 'Deployment',
        replicas: 3,
        cpuReq: 400,
        memReq: 1536,
        ingress: {
          name: 'embedding-svc',
          kind: 'Service',
          route: 'vector-lookup',
          service: 'embedding-cache-svc',
          vip: '10.120.4.90',
          rps: 1620,
        },
      },
    ],
  },
  {
    name: 'analytics-us-east1',
    location: 'us-east1-b',
    tier: 'Standard · Streaming Data',
    workloads: [
      {
        ns: 'streaming',
        controller: 'kafka-ingest-broker',
        kind: 'StatefulSet',
        replicas: 4,
        cpuReq: 700,
        memReq: 2048,
        ingress: {
          name: 'ingest-ing',
          kind: 'Ingress',
          route: 'events-ingest-route',
          service: 'kafka-broker-svc',
          vip: '34.74.19.203',
          rps: 6400,
        },
      },
      {
        ns: 'streaming',
        controller: 'spark-stream-driver',
        kind: 'Deployment',
        replicas: 3,
        cpuReq: 650,
        memReq: 1536,
        ingress: {
          name: 'spark-ui-svc',
          kind: 'Service',
          route: 'spark-driver-route',
          service: 'spark-driver-svc',
          vip: '10.130.12.7',
          rps: 890,
        },
      },
      {
        ns: 'warehouse',
        controller: 'bq-sink-connector',
        kind: 'Deployment',
        replicas: 3,
        cpuReq: 350,
        memReq: 768,
        ingress: null,
      },
    ],
  },
  {
    name: 'staging-asia-east1',
    location: 'asia-east1-a',
    tier: 'Autopilot · Canary Staging',
    workloads: [
      {
        ns: 'staging',
        controller: 'store-v2-canary',
        kind: 'Deployment',
        replicas: 3,
        cpuReq: 300,
        memReq: 512,
        ingress: {
          name: 'staging-canary-gw',
          kind: 'Gateway',
          route: 'canary-split-route',
          service: 'store-v2-svc',
          vip: '35.234.18.92',
          rps: 260,
        },
      },
      {
        ns: 'staging',
        controller: 'synthetic-loadgen',
        kind: 'Deployment',
        replicas: 2,
        cpuReq: 200,
        memReq: 384,
        ingress: null,
      },
    ],
  },
];

function buildPodStatusForScenario(scenario, clusterName, workload, idx, rand) {
  if (scenario === 'healthy') {
    return { status: 'Running', restarts: 0, reason: 'Ready' };
  }

  if (scenario === 'default') {
    if (clusterName === 'ap-iap-testing' && workload.controller === 'payment-service' && idx < 2) {
      return {
        status: 'CrashLoopBackOff',
        restarts: 14 + idx * 3,
        reason: 'dial tcp 10.96.88.10:6379: i/o timeout (Redis cart pool exhausted)',
      };
    }
    if (clusterName === 'ap-iap-testing' && workload.controller === 'redis-cart' && idx === 0) {
      return {
        status: 'OOMKilled',
        restarts: 6,
        reason: 'Container redis exceeded memory limit (2048Mi)',
      };
    }
    if (clusterName === 'ap-iap-testing' && workload.controller === 'store-v1' && idx === 3) {
      return {
        status: 'ContainerCreating',
        restarts: 0,
        reason: 'Pulling image gcr.io/gke-demos/store-v1:sha-8b9f2c',
      };
    }
    if (
      clusterName === 'production-us-central1' &&
      workload.controller === 'checkout-worker' &&
      idx === 0
    ) {
      return {
        status: 'CrashLoopBackOff',
        restarts: 9,
        reason: 'upstream gRPC deadline exceeded calling payment-service',
      };
    }
    if (
      clusterName === 'staging-asia-east1' &&
      workload.controller === 'store-v2-canary' &&
      idx === 2
    ) {
      return {
        status: 'ContainerCreating',
        restarts: 0,
        reason: 'Waiting for readiness probe /healthz',
      };
    }
  }

  if (scenario === 'redis-oom') {
    if (workload.controller.includes('redis')) {
      return {
        status: idx === 0 ? 'OOMKilled' : 'CrashLoopBackOff',
        restarts: 18 + idx * 5,
        reason: 'OOMKilled: maxmemory-policy noeviction reached at 2048Mi',
      };
    }
    if (workload.controller.includes('cart') || workload.controller.includes('checkout')) {
      if (idx < 2) {
        return {
          status: 'CrashLoopBackOff',
          restarts: 11 + idx * 2,
          reason: 'READONLY You cant write against a read only replica / connection refused',
        };
      }
      return {
        status: 'ContainerCreating',
        restarts: 3,
        reason: 'Back-off restarting failed container',
      };
    }
  }

  if (scenario === 'gateway-spike') {
    if (
      workload.ingress &&
      (workload.controller.includes('store') ||
        workload.controller.includes('proxy') ||
        workload.controller.includes('envoy'))
    ) {
      if (idx === 0) {
        return {
          status: 'Pending',
          restarts: 0,
          reason: '0/6 nodes available: triggering GKE Autopilot node nap-standard-4 provisioning',
        };
      }
      if (idx === 1) {
        return {
          status: 'ContainerCreating',
          restarts: 0,
          reason: 'HorizontalPodAutoscaler scaled replicas 4 -> 8 (CPU 142% > target 70%)',
        };
      }
    }
  }

  if (scenario === 'canary-rollout') {
    if (idx === 0 && rand() < 0.65) {
      return {
        status: 'ContainerCreating',
        restarts: 0,
        reason: 'RollingUpdate: surging new pod template v2.4.0',
      };
    }
    if (idx === workload.replicas - 1 && rand() < 0.35) {
      return {
        status: 'Completed',
        restarts: 0,
        reason: 'Draining old ReplicaSet revision',
      };
    }
  }

  if (scenario.startsWith('scale-')) {
    const r = rand();
    if (r < 0.05) {
      return { status: 'CrashLoopBackOff', restarts: 7, reason: 'Liveness probe failed: HTTP 503' };
    }
    if (r < 0.12) {
      return { status: 'ContainerCreating', restarts: 0, reason: 'Scaling replica set' };
    }
    if (r < 0.16) {
      return {
        status: 'Pending',
        restarts: 0,
        reason: 'Unschedulable: awaiting node pool scale-up',
      };
    }
    if (r < 0.2) {
      return { status: 'Completed', restarts: 0, reason: 'Scale-down warm standby' };
    }
  }

  return { status: 'Running', restarts: 0, reason: 'Ready' };
}

function buildPodLogs(clusterName, ns, podName, status, reason) {
  const now = Date.now();
  const ts = (offsetMs) => new Date(now - offsetMs).toISOString();
  if (status === 'CrashLoopBackOff' || status === 'OOMKilled') {
    return [
      {
        timestamp: ts(18420),
        severity: 'INFO',
        message: `[${podName}] Starting container server on :8080 (cluster=${clusterName}, ns=${ns})`,
      },
      {
        timestamp: ts(12310),
        severity: 'WARNING',
        message: `[${podName}] High latency detected on upstream pool: p99=1420ms`,
      },
      { timestamp: ts(6105), severity: 'ERROR', message: `[${podName}] FATAL: ${reason}` },
      {
        timestamp: ts(2410),
        severity: 'ERROR',
        message: `[kubelet] Back-off restarting failed container in pod ${podName}_${ns}`,
      },
    ];
  }
  if (status === 'ContainerCreating' || status === 'Pending') {
    return [
      {
        timestamp: ts(9500),
        severity: 'INFO',
        message: `[default-scheduler] Successfully assigned ${ns}/${podName} to gke-${clusterName}-pool-a4f2`,
      },
      { timestamp: ts(4120), severity: 'INFO', message: `[kubelet] ${reason}` },
    ];
  }
  return [
    {
      timestamp: ts(25100),
      severity: 'INFO',
      message: `[${podName}] Listening on :8080 — readiness probe succeeded`,
    },
    { timestamp: ts(8420), severity: 'INFO', message: `[${podName}] GET /healthz 200 OK (1.4ms)` },
    {
      timestamp: ts(1950),
      severity: 'INFO',
      message: `[${podName}] Processed 142 RPC requests (0 errors)`,
    },
  ];
}

function buildNodePoolsBlueprint(bp, scaleMultiplier = 1) {
  const isGpu = bp.name.includes('gpu') || bp.tier.includes('GPU');
  const baseLoc = bp.location.replace(/-[a-z]$/, '');
  const pools = [
    {
      pool: 'default-pool',
      machineType: 'e2-standard-4',
      count: Math.max(3, 3 * scaleMultiplier),
      maxPods: 16,
      cpuCapMillis: 4000,
      memoryCapMi: 16384,
      zones: [`${baseLoc}-a`, `${baseLoc}-b`, `${baseLoc}-c`],
    },
    {
      pool: 'highmem-pool',
      machineType: 'n2-highmem-8',
      count: Math.max(2, 2 * scaleMultiplier),
      maxPods: 24,
      cpuCapMillis: 8000,
      memoryCapMi: 65536,
      zones: [`${baseLoc}-a`, `${baseLoc}-b`],
    },
    isGpu
      ? {
          pool: 'gpu-l4-pool',
          machineType: 'g2-standard-12',
          count: Math.max(2, 2 * scaleMultiplier),
          maxPods: 16,
          cpuCapMillis: 12000,
          memoryCapMi: 49152,
          zones: [`${baseLoc}-c`, `${baseLoc}-a`],
        }
      : {
          pool: 'spot-burst-pool',
          machineType: 'c3-standard-8',
          count: Math.max(2, 2 * scaleMultiplier),
          maxPods: 20,
          cpuCapMillis: 8000,
          memoryCapMi: 32768,
          zones: [`${baseLoc}-b`, `${baseLoc}-c`],
        },
  ];

  const nodes = [];
  for (const p of pools) {
    for (let i = 0; i < p.count; i++) {
      const shortHash = ((hashStr(`${bp.name}:${p.pool}:${i}`) & 0xffff) + 0x1000)
        .toString(16)
        .slice(0, 4);
      const nodeName = `gke-${bp.name.slice(0, 10)}-${p.pool.split('-')[0]}-${shortHash}`;
      const nodeKey = `${p.pool}/${nodeName}`;
      nodes.push({
        key: nodeKey,
        name: nodeName,
        nodePool: p.pool,
        namespace: p.pool, // enables uniform grouping with planPadDeck
        machineType: p.machineType,
        zone: p.zones[i % p.zones.length],
        cluster: bp.name,
        kubeletVersion: 'v1.31.2-gke.1140000',
        status: 'Ready',
        conditionReason: 'KubeletReady',
        usedPods: 0,
        maxPods: p.maxPods,
        podPct: 0,
        cpuMillis: 0,
        cpuCapMillis: p.cpuCapMillis,
        cpuPct: 0,
        memoryMi: 0,
        memoryCapMi: p.memoryCapMi,
        memPct: 0,
        pods: [],
      });
    }
  }
  return nodes;
}

function materializeCluster(bp, scenario, scaleMultiplier = 1) {
  const rand = rng(hashStr(`${bp.name}:${scenario}:${scaleMultiplier}`));
  const pods = [];
  const controllers = [];
  const ingressesMap = new Map();
  const nodes = buildNodePoolsBlueprint(bp, scaleMultiplier);
  const defaultPoolNodes = nodes.filter((n) => n.nodePool === 'default-pool');
  const highmemPoolNodes = nodes.filter((n) => n.nodePool === 'highmem-pool');
  const burstOrGpuNodes = nodes.filter(
    (n) => n.nodePool === 'spot-burst-pool' || n.nodePool === 'gpu-l4-pool'
  );

  const workloads = [...bp.workloads];
  if (scaleMultiplier > 1) {
    const extraNamespaces = [
      'analytics',
      'search',
      'recommendations',
      'billing',
      'notifications',
      'auth-mesh',
    ];
    for (let i = 0; i < scaleMultiplier * 3; i++) {
      const ns = extraNamespaces[i % extraNamespaces.length];
      const ctrlName = `${ns}-worker-v${(i % 3) + 1}-${i}`;
      workloads.push({
        ns,
        controller: ctrlName,
        kind: i % 4 === 0 ? 'StatefulSet' : 'Deployment',
        replicas: Math.max(4, Math.round(5 * (scaleMultiplier / 2))),
        cpuReq: 300,
        memReq: 512,
        ingress: {
          name: `${ns}-gw`,
          kind: 'Gateway',
          route: `${ctrlName}-route`,
          service: `${ctrlName}-svc`,
          vip: `10.98.${10 + i}.${20 + i}`,
          rps: 250 + i * 75,
        },
      });
    }
  }

  for (const w of workloads) {
    const ctrlKey = `${w.ns}/${w.controller}`;
    const replicaCount =
      scenario === 'gateway-spike' && w.ingress
        ? w.replicas + 2
        : Math.max(2, Math.round(w.replicas * (scaleMultiplier > 1 ? 1.35 : 1)));

    const ctrlPods = [];
    let readyCount = 0;
    let totalCpuMillis = 0;
    let totalMemMi = 0;

    let ingKey = null;
    if (w.ingress) {
      ingKey = `${w.ns}/${w.ingress.route || w.ingress.name}`;
      if (!ingressesMap.has(ingKey)) {
        ingressesMap.set(ingKey, {
          key: ingKey,
          name: w.ingress.route || w.ingress.name,
          gatewayName: w.ingress.name,
          kind: w.ingress.kind,
          namespace: w.ns,
          cluster: bp.name,
          serviceName: w.ingress.service,
          vip: w.ingress.vip,
          rps: w.ingress.rps,
          errPct: 0,
          p99Ms: 18 + Math.round(rand() * 25),
          pods: [],
          controllers: [],
          healthyBackends: 0,
          totalBackends: 0,
        });
      }
      ingressesMap.get(ingKey).controllers.push(ctrlKey);
    }

    for (let i = 0; i < replicaCount; i++) {
      const suffix =
        w.kind === 'StatefulSet'
          ? `${i}`
          : ((hashStr(`${ctrlKey}:${i}`) & 0xfffff) + 0x10000).toString(16).slice(0, 5);
      const podName = `${w.controller}-${suffix}`;
      const podKey = `${w.ns}/${podName}`;
      const st = buildPodStatusForScenario(scenario, bp.name, w, i, rand);
      const vClass = statusToVisualClass(st.status);

      const cpuLoadFactor =
        vClass === 'crashed' ? 0.92 : vClass === 'transition' ? 0.78 : 0.42 + rand() * 0.35;
      const memLoadFactor =
        st.status === 'OOMKilled' ? 0.99 : vClass === 'crashed' ? 0.88 : 0.48 + rand() * 0.32;

      const cpuMillis = Math.round(w.cpuReq * cpuLoadFactor);
      const memoryMi = Math.round(w.memReq * memLoadFactor);
      totalCpuMillis += cpuMillis;
      totalMemMi += memoryMi;
      if (vClass === 'running') readyCount++;

      // Assign pod to a GKE node pool based on workload profile
      let poolNodes = defaultPoolNodes;
      if (w.kind === 'StatefulSet' || w.memReq >= 1536) {
        poolNodes = highmemPoolNodes.length ? highmemPoolNodes : nodes;
      } else if (
        w.controller.includes('gpu') ||
        w.controller.includes('vllm') ||
        w.controller.includes('embed') ||
        w.cpuReq >= 550
      ) {
        poolNodes = burstOrGpuNodes.length ? burstOrGpuNodes : nodes;
      }
      const targetNode =
        poolNodes[(hashStr(ctrlKey) + i) % poolNodes.length] || nodes[i % nodes.length];

      const podObj = {
        key: podKey,
        name: podName,
        namespace: w.ns,
        cluster: bp.name,
        status: st.status,
        visualClass: vClass,
        reason: st.reason,
        restarts: st.restarts,
        controller: ctrlKey,
        controllerName: w.controller,
        controllerKind: w.kind,
        ingresses: ingKey ? [ingKey] : [],
        serviceName: w.ingress?.service || `${w.controller}-svc`,
        node: targetNode.name,
        nodeKey: targetNode.key,
        nodePool: targetNode.nodePool,
        ip: `10.24.${(hashStr(w.ns) % 40) + 10}.${15 + i * 3}`,
        cpuMillis,
        cpuLimitMillis: w.cpuReq,
        memoryMi,
        memoryLimitMi: w.memReq,
        age: `${2 + (i % 6)}d${(i * 5) % 24}h`,
        logs: buildPodLogs(bp.name, w.ns, podName, st.status, st.reason),
        conditions: [
          { type: 'Initialized', status: 'True', reason: 'PodCompleted' },
          {
            type: 'Ready',
            status: vClass === 'running' ? 'True' : 'False',
            reason: st.reason,
          },
          {
            type: 'ContainersReady',
            status: vClass === 'running' ? 'True' : 'False',
            reason: st.reason,
          },
          {
            type: 'PodScheduled',
            status: vClass === 'pending' ? 'False' : 'True',
            reason: vClass === 'pending' ? st.reason : 'Scheduled',
          },
        ],
      };

      pods.push(podObj);
      ctrlPods.push(podKey);

      targetNode.pods.push(podKey);
      targetNode.usedPods++;
      targetNode.cpuMillis += cpuMillis;
      targetNode.memoryMi += memoryMi;
      if (st.status === 'OOMKilled' || (vClass === 'crashed' && w.memReq >= 1024)) {
        targetNode.status = 'MemoryPressure';
        targetNode.conditionReason = 'KubeletHasInsufficientMemory (eviction threshold neared)';
      }

      if (ingKey) {
        const ing = ingressesMap.get(ingKey);
        ing.pods.push(podKey);
        ing.totalBackends++;
        if (vClass === 'running') ing.healthyBackends++;
        if (vClass === 'crashed') {
          ing.errPct = Math.min(48, +(ing.errPct + 6.4).toFixed(1));
          ing.p99Ms = Math.max(ing.p99Ms, 840);
        }
      }
    }

    const cpuCap = replicaCount * w.cpuReq;
    const memCap = replicaCount * w.memReq;
    controllers.push({
      key: ctrlKey,
      name: w.controller,
      kind: w.kind,
      namespace: w.ns,
      cluster: bp.name,
      readyReplicas: readyCount,
      desiredReplicas: replicaCount,
      cpuMillis: totalCpuMillis,
      cpuCapMillis: cpuCap,
      cpuPct: cpuCap > 0 ? Math.min(1, totalCpuMillis / cpuCap) : 0,
      memoryMi: totalMemMi,
      memoryCapMi: memCap,
      memPct: memCap > 0 ? Math.min(1, totalMemMi / memCap) : 0,
      pods: ctrlPods,
      ingressKey: ingKey,
      strategy:
        w.kind === 'StatefulSet' ? 'OnDelete / OrderedReady' : 'RollingUpdate (25% maxSurge)',
      image: `us-docker.pkg.dev/gke-demos/ephemeris/${w.controller}:v2.4.1`,
    });
  }

  for (const n of nodes) {
    n.podPct = n.maxPods > 0 ? Math.min(1, n.usedPods / n.maxPods) : 0;
    n.cpuPct = n.cpuCapMillis > 0 ? Math.min(1, n.cpuMillis / n.cpuCapMillis) : 0.12;
    n.memPct = n.memoryCapMi > 0 ? Math.min(1, n.memoryMi / n.memoryCapMi) : 0.18;
    if (n.memPct > 0.88 && n.status === 'Ready') {
      n.status = 'MemoryPressure';
      n.conditionReason = 'KubeletHasInsufficientMemory';
    }
  }

  const ingresses = [...ingressesMap.values()];
  const counts = {
    running: 0,
    transition: 0,
    crashed: 0,
    pending: 0,
    suspended: 0,
  };
  for (const p of pods) {
    counts[p.visualClass] = (counts[p.visualClass] || 0) + 1;
  }

  return {
    name: bp.name,
    location: bp.location,
    tier: bp.tier,
    pods,
    podCount: pods.length,
    controllers,
    ingresses,
    nodes,
    counts,
  };
}

export const VISUAL_CLASSES = ['running', 'transition', 'crashed', 'pending', 'suspended'];

const MEGA_DOMAINS = [
  'payments',
  'checkout',
  'storefront',
  'catalog',
  'shipping',
  'auth-mesh',
  'analytics',
  'search',
  'billing',
  'ai-serving',
  'recommendations',
  'ledger',
  'notifications',
  'inventory',
  'fraud-engine',
  'telemetry',
];

/**
 * Ultra-fast typed-array generator for hyperscale GKE stress testing
 * (e.g., 500 Namespaces / 1,000 Workloads / 5,000 Nodes / 100,000 Pods in <25ms).
 */
function materializeMegaCluster(bp, { nsCount = 500, podCount = 100000, nodeCount = 5000 } = {}) {
  const rand = rng(hashStr(`${bp.name}:mega:${nsCount}:${podCount}:${nodeCount}`));

  // 1. Generate GKE Compute Nodes across 4 Node Pools (e.g. 5,000 nodes)
  const poolDefs = [
    {
      pool: 'default-pool',
      machineType: 'e2-standard-16',
      maxPods: 110,
      cpuCap: 16000,
      memCap: 65536,
    },
    {
      pool: 'highmem-pool',
      machineType: 'n2-highmem-32',
      maxPods: 110,
      cpuCap: 32000,
      memCap: 262144,
    },
    {
      pool: 'spot-burst-pool',
      machineType: 'c3-standard-22',
      maxPods: 110,
      cpuCap: 22000,
      memCap: 88064,
    },
    {
      pool: 'gpu-l4-pool',
      machineType: 'g2-standard-24',
      maxPods: 64,
      cpuCap: 24000,
      memCap: 98304,
    },
  ];
  const maxPodsPerNode = Math.max(32, Math.ceil((podCount * 1.35) / Math.max(1, nodeCount)));
  const padDigits = nodeCount >= 1000 ? 4 : 3;
  const nodes = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    const p = poolDefs[i % poolDefs.length];
    const nodeName = `gke-${bp.name.slice(0, 8)}-${p.pool.split('-')[0]}-${String(i + 1).padStart(padDigits, '0')}`;
    const nodeKey = `${p.pool}/${nodeName}`;
    nodes[i] = {
      key: nodeKey,
      name: nodeName,
      nodePool: p.pool,
      namespace: p.pool,
      machineType: p.machineType,
      zone: `${bp.location.replace(/-[a-z]$/, '')}-${['a', 'b', 'c'][i % 3]}`,
      cluster: bp.name,
      kubeletVersion: 'v1.31.2-gke.1140000',
      status: 'Ready',
      conditionReason: 'KubeletReady',
      usedPods: 0,
      maxPods: maxPodsPerNode,
      podPct: 0,
      cpuMillis: 0,
      cpuCapMillis: p.cpuCap,
      cpuPct: 0,
      memoryMi: 0,
      memoryCapMi: p.memCap,
      memPct: 0,
      pods: [],
      nodeIdx: i,
    };
  }

  // 2. Generate Namespaces, Workloads (Deployments, StatefulSets, DaemonSets, Jobs), and Ingresses
  const namespaces = new Array(nsCount);
  const controllers = [];
  const ingresses = [];
  const kinds = ['Deployment', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job'];

  for (let n = 0; n < nsCount; n++) {
    const dom = MEGA_DOMAINS[n % MEGA_DOMAINS.length];
    const nsName = `${dom}-${String(n + 1).padStart(3, '0')}`;
    namespaces[n] = nsName;

    const workloadsInNs = 2;
    for (let w = 0; w < workloadsInNs; w++) {
      const ctrlIdx = controllers.length;
      const kind = kinds[(n + w) % kinds.length];
      const ctrlName = `${dom}-${w === 0 ? 'api' : 'worker'}-${String(n + 1).padStart(3, '0')}`;
      const ctrlKey = `${nsName}/${ctrlName}`;
      let ingKey = null;

      if (w === 0 && n < 36) {
        ingKey = `${nsName}/${ctrlName}-route`;
        ingresses.push({
          key: ingKey,
          name: `${ctrlName}-route`,
          gatewayName: `${dom}-gateway`,
          kind: n % 3 === 0 ? 'Gateway' : 'HTTPRoute',
          namespace: nsName,
          cluster: bp.name,
          serviceName: `${ctrlName}-svc`,
          vip: `34.149.${20 + (n % 200)}.${10 + (n % 240)}`,
          rps: 450 + ((n * 73) % 2400),
          errPct: n < 4 ? 4.2 : 0,
          p99Ms: n < 4 ? 620 : 24,
          pods: [],
          controllers: [ctrlKey],
          healthyBackends: 0,
          totalBackends: 0,
        });
      }

      controllers.push({
        key: ctrlKey,
        name: ctrlName,
        kind,
        namespace: nsName,
        nsIdx: n,
        ctrlIdx,
        cluster: bp.name,
        readyReplicas: 0,
        crashedReplicas: 0,
        transitionReplicas: 0,
        desiredReplicas: 0,
        cpuMillis: 0,
        cpuCapMillis: 0,
        cpuPct: 0.42 + rand() * 0.36,
        memoryMi: 0,
        memoryCapMi: 0,
        memPct: 0.45 + rand() * 0.36,
        pods: [],
        ingressKey: ingKey,
        strategy: kind === 'StatefulSet' ? 'OrderedReady' : 'RollingUpdate (25% maxSurge)',
        image: `us-docker.pkg.dev/gke-demos/ephemeris/${dom}:v2.4.1`,
      });
    }
  }

  // 3. Populate compact Pod Table (100,000 pods in typed arrays)
  const ctrlCount = controllers.length;
  const visualClassCode = new Uint8Array(podCount);
  const nsIdxArr = new Uint16Array(podCount);
  const ctrlIdxArr = new Uint16Array(podCount);
  const nodeIdxArr = new Uint16Array(podCount);
  const ordInCtrlArr = new Uint16Array(podCount);

  const nsPodCounts = new Uint32Array(nsCount);
  const nsStateCounts = Array.from({ length: nsCount }, () => ({
    running: 0,
    transition: 0,
    crashed: 0,
    pending: 0,
    suspended: 0,
  }));

  const counts = { running: 0, transition: 0, crashed: 0, pending: 0, suspended: 0 };
  const nodesPerNs = Math.max(4, Math.ceil(nodeCount / Math.max(1, nsCount)));
  const spreadSpan = Math.max(8, nodesPerNs + 4);

  for (let i = 0; i < podCount; i++) {
    const cIdx = i % ctrlCount;
    const ctrl = controllers[cIdx];
    const nIdx = ctrl.nsIdx;
    const ord = ctrl.desiredReplicas++;
    const ndIdx = (nIdx * nodesPerNs + (ord % spreadSpan) + (cIdx & 3) * 3) % nodeCount;

    const r = rand();
    // Realistic localized incident & rollout zones so 95% of the 500 namespaces are healthy green
    // and incident/rollout namespaces stand out as clear spatial hotspots across the cluster:
    const isIncidentNs = nIdx < 6 || nIdx === 85 || nIdx === 190 || nIdx === 310 || nIdx === 425;
    const isRolloutNs = (nIdx >= 6 && nIdx < 18) || nIdx === 140 || nIdx === 260 || nIdx === 380;

    let vCode = 0; // running
    if (isIncidentNs) {
      if (r < 0.28)
        vCode = 2; // crashed
      else if (r < 0.36) vCode = 1; // transition
    } else if (isRolloutNs) {
      if (r < 0.24)
        vCode = 1; // transition (ContainerCreating)
      else if (r < 0.32) vCode = 3; // pending (HPA scale-up)
    } else if (ctrl.kind === 'Job' && r < 0.18) {
      vCode = 4; // completed job pod
    }

    visualClassCode[i] = vCode;
    nsIdxArr[i] = nIdx;
    ctrlIdxArr[i] = cIdx;
    nodeIdxArr[i] = ndIdx;
    ordInCtrlArr[i] = ord;

    const vName = VISUAL_CLASSES[vCode];
    counts[vName]++;
    nsPodCounts[nIdx]++;
    nsStateCounts[nIdx][vName]++;

    if (vCode === 0 || vCode === 4) {
      ctrl.readyReplicas++;
    } else if (vCode === 2) {
      ctrl.crashedReplicas++;
    } else {
      ctrl.transitionReplicas++;
    }
    const node = nodes[ndIdx];
    node.usedPods++;
    if (vCode === 2 && node.usedPods % 4 === 0) {
      node.status = 'MemoryPressure';
      node.conditionReason = 'KubeletHasInsufficientMemory';
    }
  }

  for (const ctrl of controllers) {
    ctrl.cpuCapMillis = ctrl.desiredReplicas * 500;
    ctrl.cpuMillis = Math.round(ctrl.cpuCapMillis * ctrl.cpuPct);
    ctrl.memoryCapMi = ctrl.desiredReplicas * 1024;
    ctrl.memoryMi = Math.round(ctrl.memoryCapMi * ctrl.memPct);
  }

  for (const ing of ingresses) {
    const c = controllers.find((ct) => ct.key === ing.controllers[0]);
    if (c) {
      ing.totalBackends = c.desiredReplicas;
      ing.healthyBackends = c.readyReplicas;
    }
  }

  for (const n of nodes) {
    n.podPct = Math.min(1, n.usedPods / Math.max(1, n.maxPods));
    n.cpuPct = Math.min(0.96, 0.25 + n.podPct * 0.62);
    n.memPct = Math.min(0.98, 0.3 + n.podPct * 0.64);
    n.cpuMillis = Math.round(n.cpuCapMillis * n.cpuPct);
    n.memoryMi = Math.round(n.memoryCapMi * n.memPct);
  }

  // Materialize the first 60 pods into cluster.pods for backwards-compatible event feed & tests
  const samplePods = [];
  const podTable = {
    count: podCount,
    podCount,
    namespaces,
    nsPodCounts,
    nsStateCounts,
    visualClassCode,
    nsIdx: nsIdxArr,
    ctrlIdx: ctrlIdxArr,
    nodeIdx: nodeIdxArr,
    ordInCtrl: ordInCtrlArr,
  };

  const clusterObj = {
    name: bp.name,
    location: bp.location,
    tier: `${bp.tier} · ${nsCount} NS / ${nodeCount.toLocaleString()} Nodes / ${(podCount / 1000).toFixed(0)}K Pods`,
    namespaces,
    pods: samplePods,
    podCount,
    podTable,
    controllers,
    ingresses,
    nodes,
    counts,
  };

  for (let i = 0; i < Math.min(80, podCount); i++) {
    samplePods.push(materializePodAt(clusterObj, i));
  }

  return clusterObj;
}

/** Synthesizes a rich Pod object on-demand from cluster.podTable (or returns cluster.pods[idx]). */
export function materializePodAt(cluster, podIdx) {
  if (!cluster.podTable) {
    return cluster.pods[podIdx] || null;
  }
  const pt = cluster.podTable;
  if (podIdx < 0 || podIdx >= pt.count) return null;

  const cIdx = pt.ctrlIdx[podIdx];
  const nIdx = pt.nsIdx[podIdx];
  const ndIdx = pt.nodeIdx[podIdx];
  const ord = pt.ordInCtrl[podIdx];
  const vCode = pt.visualClassCode[podIdx];
  const vClass = VISUAL_CLASSES[vCode] || 'running';

  const ctrl = cluster.controllers[cIdx];
  const node = cluster.nodes[ndIdx];
  const nsName = pt.namespaces[nIdx];
  const podName = `${ctrl.name}-${ord.toString(36).padStart(3, '0')}`;
  const podKey = `${nsName}/${podName}`;

  const statusMap = {
    running: 'Running',
    transition: 'ContainerCreating',
    crashed: 'CrashLoopBackOff',
    pending: 'Pending',
    suspended: 'Completed',
  };
  const status = statusMap[vClass] || 'Running';
  const reason =
    vClass === 'crashed'
      ? 'CrashLoopBackOff: upstream RPC deadline exceeded (503)'
      : vClass === 'transition'
        ? 'RollingUpdate replica surge in progress'
        : vClass === 'pending'
          ? 'Awaiting GKE node pool autoscaler slot'
          : 'Ready';

  return {
    key: podKey,
    podIdx,
    _podIdx: podIdx,
    name: podName,
    namespace: nsName,
    cluster: cluster.name,
    status,
    visualClass: vClass,
    reason,
    restarts: vClass === 'crashed' ? 8 + (podIdx % 9) : 0,
    controller: ctrl.key,
    controllerName: ctrl.name,
    controllerKind: ctrl.kind,
    ingresses: ctrl.ingressKey ? [ctrl.ingressKey] : [],
    serviceName: `${ctrl.name}-svc`,
    node: node.name,
    nodeKey: node.key,
    nodePool: node.nodePool,
    ip: `10.${24 + (nIdx % 180)}.${(cIdx * 3) % 250}.${10 + (ord % 230)}`,
    cpuMillis: vClass === 'crashed' ? 460 : 280,
    cpuLimitMillis: 500,
    memoryMi: vClass === 'crashed' ? 920 : 540,
    memoryLimitMi: 1024,
    age: `${1 + (podIdx % 9)}d${(podIdx * 3) % 24}h`,
    logs: buildPodLogs(cluster.name, nsName, podName, status, reason),
  };
}

export function buildMockFleet({ scenario = 'default', synthetic = 0 } = {}) {
  let scaleMultiplier = 1;
  if (scenario === 'scale-180' || (synthetic >= 120 && synthetic < 300)) {
    scaleMultiplier = 2;
  } else if (scenario === 'scale-400' || (synthetic >= 300 && synthetic < 2000)) {
    scaleMultiplier = 4;
  }

  const clusters = CLUSTER_BLUEPRINTS.map((bp, idx) => {
    if (idx === 0 && (scenario === 'scale-100k' || synthetic >= 50000)) {
      return materializeMegaCluster(bp, { nsCount: 500, podCount: 100000, nodeCount: 5000 });
    }
    if (idx === 0 && (scenario === 'scale-5k' || (synthetic >= 2000 && synthetic < 50000))) {
      return materializeMegaCluster(bp, { nsCount: 50, podCount: 5000, nodeCount: 250 });
    }
    return materializeCluster(bp, scenario, idx === 0 ? scaleMultiplier : 1);
  });

  return {
    scenario,
    mode: 'mock',
    projectID: 'gke-demos-345619',
    updatedAt: new Date().toISOString(),
    clusters,
  };
}

/** Converts live/WS TopologyData from Go backend into the rich Decks fleet structure. */
export function adaptLiveTopologyToFleet(topo) {
  if (!topo || !Array.isArray(topo.clusters) || topo.clusters.length === 0) {
    return buildMockFleet({ scenario: 'default' });
  }

  const clusters = topo.clusters.map((c) => {
    const pods = [];
    const controllers = [];
    const ingresses = [];
    const counts = { running: 0, transition: 0, crashed: 0, pending: 0, suspended: 0 };

    const ctrlByKey = new Map();
    const ingByKey = new Map();
    const nodesByKey = new Map();

    for (const ns of c.namespaces || []) {
      const resources = ns.resources || [];
      const resIngresses = resources.filter(
        (r) =>
          r.kind === 'Gateway' ||
          r.kind === 'HTTPRoute' ||
          r.kind === 'Ingress' ||
          r.kind === 'Service'
      );
      const resWorkloads = resources.filter(
        (r) =>
          r.kind === 'Deployment' ||
          r.kind === 'StatefulSet' ||
          r.kind === 'DaemonSet' ||
          r.kind === 'Job' ||
          r.kind === 'SparkApplication' ||
          r.kind === 'RayCluster'
      );

      for (const gw of [
        ...resIngresses,
        ...(ns.gateways || []),
        ...(ns.httpRoutes || []),
        ...(ns.ingresses || []),
        ...(ns.services || []),
      ]) {
        const key = `${ns.name}/${gw.name}`;
        ingByKey.set(key, {
          key,
          name: gw.name,
          gatewayName: gw.name,
          kind: gw.kind || 'Service',
          namespace: ns.name,
          cluster: c.name,
          serviceName: gw.name,
          vip: gw.ip || '10.96.0.1',
          rps: 420,
          errPct: 0,
          p99Ms: 24,
          pods: [],
          controllers: [],
          healthyBackends: 0,
          totalBackends: 0,
        });
      }

      for (const dep of [
        ...resWorkloads,
        ...(ns.deployments || []),
        ...(ns.statefulSets || []),
        ...(ns.daemonSets || []),
        ...(ns.replicaSets || []),
      ]) {
        const key = `${ns.name}/${dep.name}`;
        let readyReplicas = dep.readyReplicas ?? 0;
        let desiredReplicas = dep.replicas ?? 1;
        if (typeof dep.replicas === 'string' && dep.replicas.includes('/')) {
          const [rStr, dStr] = dep.replicas.split('/');
          readyReplicas = Number(rStr) || 0;
          desiredReplicas = Math.max(1, Number(dStr) || 1);
        }
        ctrlByKey.set(key, {
          key,
          name: dep.name,
          kind: dep.kind || 'Deployment',
          namespace: ns.name,
          cluster: c.name,
          readyReplicas,
          desiredReplicas,
          cpuMillis: 400,
          cpuCapMillis: 1000,
          cpuPct: 0.45,
          memoryMi: 512,
          memoryCapMi: 1024,
          memPct: 0.5,
          pods: [],
          ingressKey: null,
          strategy: 'RollingUpdate',
          image: `gke.io/${c.name}/${dep.name}:latest`,
        });
      }

      for (const p of ns.pods || []) {
        const podKey = `${ns.name}/${p.name}`;
        const vClass = statusToVisualClass(p.status);
        counts[vClass] = (counts[vClass] || 0) + 1;

        let matchedCtrlKey = null;
        for (const [ck, ctrl] of ctrlByKey.entries()) {
          if (ck.startsWith(`${ns.name}/`) && p.name.startsWith(ctrl.name)) {
            matchedCtrlKey = ck;
            ctrl.pods.push(podKey);
            break;
          }
        }
        if (!matchedCtrlKey) {
          const fallbackName = p.name.split('-').slice(0, -1).join('-') || p.name;
          matchedCtrlKey = `${ns.name}/${fallbackName}`;
          if (!ctrlByKey.has(matchedCtrlKey)) {
            ctrlByKey.set(matchedCtrlKey, {
              key: matchedCtrlKey,
              name: fallbackName,
              kind: 'Deployment',
              namespace: ns.name,
              cluster: c.name,
              readyReplicas: 0,
              desiredReplicas: 0,
              cpuMillis: 350,
              cpuCapMillis: 1000,
              cpuPct: 0.35,
              memoryMi: 512,
              memoryCapMi: 1024,
              memPct: 0.5,
              pods: [],
              ingressKey: null,
              strategy: 'RollingUpdate',
              image: `gke.io/${c.name}/${fallbackName}:latest`,
            });
          }
          const ctrl = ctrlByKey.get(matchedCtrlKey);
          ctrl.pods.push(podKey);
          ctrl.desiredReplicas++;
          if (vClass === 'running') ctrl.readyReplicas++;
        }

        const matchedIngKeys = [];
        for (const [ik, ing] of ingByKey.entries()) {
          if (ik.startsWith(`${ns.name}/`)) {
            matchedIngKeys.push(ik);
            ing.pods.push(podKey);
            ing.totalBackends++;
            if (vClass === 'running') ing.healthyBackends++;
            break;
          }
        }

        const nodeName =
          p.node ||
          p.labels?.['ephemeris.io/node'] ||
          `gke-${c.name}-default-${(pods.length % 4) + 1}`;
        const nodePool = nodeName.includes('highmem') ? 'highmem-pool' : 'default-pool';
        const nodeKey = `${nodePool}/${nodeName}`;
        if (!nodesByKey.has(nodeKey)) {
          nodesByKey.set(nodeKey, {
            key: nodeKey,
            name: nodeName,
            nodePool,
            namespace: nodePool,
            machineType: nodePool === 'highmem-pool' ? 'n2-highmem-8' : 'e2-standard-4',
            zone: `${c.location || 'us-central1'}-a`,
            cluster: c.name,
            kubeletVersion: 'v1.31.2-gke.1140000',
            status: 'Ready',
            conditionReason: 'KubeletReady',
            usedPods: 0,
            maxPods: 16,
            podPct: 0,
            cpuMillis: 0,
            cpuCapMillis: 4000,
            cpuPct: 0,
            memoryMi: 0,
            memoryCapMi: 16384,
            memPct: 0,
            pods: [],
          });
        }
        const nObj = nodesByKey.get(nodeKey);
        nObj.pods.push(podKey);
        nObj.usedPods++;
        nObj.cpuMillis += 380;
        nObj.memoryMi += 520;
        nObj.podPct = Math.min(1, nObj.usedPods / nObj.maxPods);
        nObj.cpuPct = Math.min(1, nObj.cpuMillis / nObj.cpuCapMillis);
        nObj.memPct = Math.min(1, nObj.memoryMi / nObj.memoryCapMi);

        pods.push({
          key: podKey,
          name: p.name,
          namespace: ns.name,
          cluster: c.name,
          status: p.status || 'Running',
          visualClass: vClass,
          reason: vClass === 'crashed' ? 'CrashLoopBackOff container error' : 'Ready',
          restarts: p.restarts || 0,
          controller: matchedCtrlKey,
          controllerName: matchedCtrlKey.split('/')[1],
          controllerKind: ctrlByKey.get(matchedCtrlKey)?.kind || 'Deployment',
          ingresses: matchedIngKeys,
          serviceName: `${matchedCtrlKey.split('/')[1]}-svc`,
          node: nodeName,
          nodeKey,
          nodePool,
          ip: p.ip || '10.24.0.12',
          cpuMillis: 380,
          cpuLimitMillis: 1000,
          memoryMi: 520,
          memoryLimitMi: 1024,
          age: '3d4h',
          logs: buildPodLogs(
            c.name,
            ns.name,
            p.name,
            p.status || 'Running',
            'Container status update'
          ),
          conditions: [
            {
              type: 'Ready',
              status: vClass === 'running' ? 'True' : 'False',
              reason: p.status || 'Running',
            },
          ],
        });
      }
    }

    controllers.push(...ctrlByKey.values());
    ingresses.push(...ingByKey.values());
    const nodes = [...nodesByKey.values()];
    const namespaces = [
      ...new Set([...pods.map((p) => p.namespace), ...controllers.map((ct) => ct.namespace)]),
    ].sort();

    return {
      name: c.name,
      location: c.location || 'us-central1',
      tier: topo.mode === 'live' ? 'Live GKE Cluster' : 'Mock GKE Cluster',
      namespaces,
      pods,
      podCount: pods.length,
      controllers,
      ingresses,
      nodes,
      counts,
    };
  });

  return {
    scenario: 'live-ws',
    mode: topo.mode || 'live',
    projectID: topo.project_id || topo.projectId || 'gke-demos-345619',
    updatedAt: new Date().toISOString(),
    clusters,
  };
}

/** Remediates a crashing pod, controller, or node in-place in the mock fleet and returns count. */
export function remediateTarget(cluster, targetKey) {
  let healed = 0;

  if (cluster.podTable) {
    const pt = cluster.podTable;
    const ctrlIdx = cluster.controllers.findIndex((c) => c.key === targetKey);
    const nodeIdx = (cluster.nodes || []).findIndex((n) => n.key === targetKey);
    for (let i = 0; i < pt.count; i++) {
      const vCode = pt.visualClassCode[i];
      if (vCode === 0) continue;
      if (
        (ctrlIdx >= 0 && pt.ctrlIdx[i] === ctrlIdx) ||
        (nodeIdx >= 0 && pt.nodeIdx[i] === nodeIdx)
      ) {
        const oldClass = VISUAL_CLASSES[vCode];
        cluster.counts[oldClass] = Math.max(0, (cluster.counts[oldClass] || 1) - 1);
        cluster.counts.running++;
        pt.nsStateCounts[pt.nsIdx[i]][oldClass] = Math.max(
          0,
          pt.nsStateCounts[pt.nsIdx[i]][oldClass] - 1
        );
        pt.nsStateCounts[pt.nsIdx[i]].running++;
        pt.visualClassCode[i] = 0;
        cluster.controllers[pt.ctrlIdx[i]].readyReplicas = Math.min(
          cluster.controllers[pt.ctrlIdx[i]].desiredReplicas,
          cluster.controllers[pt.ctrlIdx[i]].readyReplicas + 1
        );
        healed++;
      }
    }
    if (nodeIdx >= 0) {
      cluster.nodes[nodeIdx].status = 'Ready';
      cluster.nodes[nodeIdx].conditionReason = 'KubeletReady';
    }
    return Math.max(1, healed);
  }

  for (const pod of cluster.pods) {
    if (
      pod.key === targetKey ||
      pod.controller === targetKey ||
      pod.nodeKey === targetKey ||
      pod.ingresses.includes(targetKey)
    ) {
      if (pod.visualClass !== 'running') {
        cluster.counts[pod.visualClass] = Math.max(0, (cluster.counts[pod.visualClass] || 1) - 1);
        pod.status = 'Running';
        pod.visualClass = 'running';
        pod.reason = 'Remediated via Ephemeris SRE action (Pod restarted & healthy)';
        pod.restarts = 0;
        pod.logs.push({
          timestamp: new Date().toISOString(),
          severity: 'INFO',
          message: `[ephemeris-sre] Pod ${pod.name} remediated and readiness probe passed`,
        });
        cluster.counts.running = (cluster.counts.running || 0) + 1;
        healed++;
      }
    }
  }
  for (const ctrl of cluster.controllers) {
    ctrl.readyReplicas = cluster.pods.filter(
      (p) => p.controller === ctrl.key && p.visualClass === 'running'
    ).length;
  }
  for (const node of cluster.nodes || []) {
    if (node.key === targetKey || healed > 0) {
      const hasCrashing = cluster.pods.some(
        (p) => p.nodeKey === node.key && p.visualClass === 'crashed'
      );
      if (!hasCrashing) {
        node.status = 'Ready';
        node.conditionReason = 'KubeletReady';
      }
    }
  }
  for (const ing of cluster.ingresses) {
    ing.healthyBackends = cluster.pods.filter(
      (p) => p.ingresses.includes(ing.key) && p.visualClass === 'running'
    ).length;
    if (ing.healthyBackends === ing.totalBackends) {
      ing.errPct = 0;
      ing.p99Ms = 22;
    }
  }
  return healed;
}

/** Generates a realistic live Kubernetes event for the left event feed panel. */
export function nextMockEvent(cluster, seq) {
  if (!cluster || cluster.pods.length === 0) return null;
  const crashedPods = cluster.pods.filter((p) => p.visualClass === 'crashed');
  const transitionPods = cluster.pods.filter((p) => p.visualClass === 'transition');
  let pod = cluster.pods[seq % cluster.pods.length];
  if (crashedPods.length > 0 && seq % 3 === 0) {
    pod = crashedPods[seq % crashedPods.length];
  } else if (transitionPods.length > 0 && seq % 3 === 1) {
    pod = transitionPods[seq % transitionPods.length];
  }

  const now = new Date();
  const timeStr = now.toISOString().slice(11, 23);

  if (pod.visualClass === 'crashed') {
    return {
      seq,
      time: timeStr,
      kind: 'BackOff',
      badgeClass: 'ev-crashed',
      glyph: '✕',
      cluster: cluster.name,
      namespace: pod.namespace,
      podKey: pod.key,
      podName: pod.name,
      controllerKey: pod.controller,
      summary: `${pod.reason}`,
    };
  }
  if (pod.visualClass === 'transition') {
    return {
      seq,
      time: timeStr,
      kind: 'Rollout',
      badgeClass: 'ev-task',
      glyph: '↻',
      cluster: cluster.name,
      namespace: pod.namespace,
      podKey: pod.key,
      podName: pod.name,
      controllerKey: pod.controller,
      summary: `${pod.controllerName}: ${pod.reason}`,
    };
  }
  if (pod.visualClass === 'pending') {
    return {
      seq,
      time: timeStr,
      kind: 'ScaleUp',
      badgeClass: 'ev-added',
      glyph: '⋯',
      cluster: cluster.name,
      namespace: pod.namespace,
      podKey: pod.key,
      podName: pod.name,
      controllerKey: pod.controller,
      summary: `Triggered scale-up for ${pod.namespace}/${pod.name}`,
    };
  }
  return {
    seq,
    time: timeStr,
    kind: 'Ready',
    badgeClass: 'ev-woke',
    glyph: '●',
    cluster: cluster.name,
    namespace: pod.namespace,
    podKey: pod.key,
    podName: pod.name,
    controllerKey: pod.controller,
    summary: `Readiness probe succeeded on ${pod.node} (${pod.serviceName})`,
  };
}
