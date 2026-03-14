import type { Edge, Node } from '@xyflow/react';
import { ArchNodeType, type ArchEdgeData, type ArchNodeData } from '@system-vis/shared';

export type ScenarioInjectorId =
  | 'retry_storm'
  | 'slow_downstream'
  | 'partial_outage'
  | 'db_saturation'
  | 'cache_degradation'
  | 'queue_backlog';

export interface ScenarioInjectorDefinition {
  id: ScenarioInjectorId;
  name: string;
  category: 'core' | 'advanced-stateful';
  description: string;
}

export const SCENARIO_INJECTORS: ScenarioInjectorDefinition[] = [
  {
    id: 'retry_storm',
    name: 'Retry Storm',
    category: 'core',
    description: 'Aggressive retries + tighter timeouts on caller services, with degraded downstream links.',
  },
  {
    id: 'slow_downstream',
    name: 'Slow Downstream Dependency',
    category: 'core',
    description: 'Leaf/stateful dependencies remain up but become much slower and slightly error-prone.',
  },
  {
    id: 'partial_outage',
    name: 'Partial Outage',
    category: 'core',
    description: 'A subset of service pools become partially unavailable with lower capacity and higher failure rate.',
  },
  {
    id: 'db_saturation',
    name: 'DB Saturation',
    category: 'advanced-stateful',
    description: 'Connection pools shrink, query/replication latency spikes, and incoming DB links become more failure-prone.',
  },
  {
    id: 'cache_degradation',
    name: 'Cache Degradation',
    category: 'advanced-stateful',
    description: 'Cache hit ratio drops and cache latency rises, indirectly increasing database pressure.',
  },
  {
    id: 'queue_backlog',
    name: 'Queue Backlog / Consumer Lag',
    category: 'advanced-stateful',
    description: 'Consumers slow down and queue processing falls behind, increasing lag and downstream delays.',
  },
];

export interface ScenarioApplyResult {
  nodes: Node<ArchNodeData>[];
  edges: Edge<ArchEdgeData>[];
  summary: string;
}

export interface ScenarioImpactPreview {
  summary: string;
  changedNodeCount: number;
  changedEdgeCount: number;
  changedNodeLabels: string[];
  changedEdgeLabels: string[];
}

function cloneNodes(nodes: Node<ArchNodeData>[]): Node<ArchNodeData>[] {
  return nodes.map((node) => ({
    ...node,
    data: { ...(node.data as Record<string, unknown>) } as ArchNodeData,
  }));
}

function cloneEdges(edges: Edge<ArchEdgeData>[]): Edge<ArchEdgeData>[] {
  return edges.map((edge) => ({
    ...edge,
    data: withSafeEdgeData(edge.data),
  }));
}

function jsonString(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getNum(data: Record<string, unknown>, key: string, fallback: number): number {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function setNum(data: Record<string, unknown>, key: string, value: number): void {
  data[key] = value;
}

function withSafeEdgeData(data?: ArchEdgeData): ArchEdgeData {
  return {
    protocol: 'http',
    bandwidthMbps: 1000,
    latencyOverheadMs: 1,
    encrypted: true,
    jitterMs: 0,
    packetLossRate: 0,
    disconnectRate: 0,
    timeoutProbability: 0,
    ...(data ?? {}),
  };
}

function edgePatch(edgeData: ArchEdgeData, patch: {
  latencyPlus?: number;
  jitterAtLeast?: number;
  packetLossPlus?: number;
  timeoutPlus?: number;
  disconnectPlus?: number;
}): ArchEdgeData {
  const latencyOverheadMs = getNum(edgeData as Record<string, unknown>, 'latencyOverheadMs', 1) + (patch.latencyPlus ?? 0);
  const jitterMs = Math.max(
    getNum(edgeData as Record<string, unknown>, 'jitterMs', 0),
    patch.jitterAtLeast ?? 0
  );
  const packetLossRate = clamp(
    getNum(edgeData as Record<string, unknown>, 'packetLossRate', 0) + (patch.packetLossPlus ?? 0),
    0,
    0.95
  );
  const timeoutProbability = clamp(
    getNum(edgeData as Record<string, unknown>, 'timeoutProbability', 0) + (patch.timeoutPlus ?? 0),
    0,
    0.95
  );
  const disconnectRate = clamp(
    getNum(edgeData as Record<string, unknown>, 'disconnectRate', 0) + (patch.disconnectPlus ?? 0),
    0,
    0.95
  );

  return {
    ...edgeData,
    latencyOverheadMs,
    jitterMs,
    packetLossRate,
    timeoutProbability,
    disconnectRate,
  };
}

function mutateServiceCapacity(data: Record<string, unknown>, scale: number): void {
  const maxConcurrentRequests = getNum(data, 'maxConcurrentRequests', 1000);
  setNum(data, 'maxConcurrentRequests', Math.max(1, Math.floor(maxConcurrentRequests * scale)));

  if (typeof data.instances === 'number') {
    setNum(data, 'instances', Math.max(1, Math.ceil(Number(data.instances) * scale)));
  }
}

function health(data: Record<string, unknown>, value: ArchNodeData['healthStatus']): void {
  data.healthStatus = value;
}

function applyRetryStorm(nodes: Node<ArchNodeData>[], edges: Edge<ArchEdgeData>[]): string {
  const callerTypes = new Set<ArchNodeType>([
    ArchNodeType.FRONTEND,
    ArchNodeType.API_GATEWAY,
    ArchNodeType.AUTH_SERVICE,
    ArchNodeType.ORDER_SERVICE,
    ArchNodeType.CUSTOM_SERVICE,
  ]);

  let callerCount = 0;
  for (const node of nodes) {
    const data = node.data as unknown as Record<string, unknown>;
    if (!callerTypes.has(node.data.nodeType)) continue;

    setNum(data, 'requestTimeoutMs', Math.min(getNum(data, 'requestTimeoutMs', 1200), 300));
    setNum(data, 'retryCount', Math.max(getNum(data, 'retryCount', 2), 4));
    setNum(data, 'retryBackoffMs', Math.min(getNum(data, 'retryBackoffMs', 120), 50));
    data.retryBackoffStrategy = 'fixed';
    health(data, 'degraded');
    callerCount++;
  }

  const highRiskTargetTypes = new Set<ArchNodeType>([
    ArchNodeType.PAYMENT_GATEWAY,
    ArchNodeType.DATABASE,
    ArchNodeType.QUEUE,
    ArchNodeType.SEARCH_ENGINE,
    ArchNodeType.REAL_TIME_DB,
    ArchNodeType.NOTIFICATION_SERVICE,
  ]);

  const nodeTypeById = new Map(nodes.map((n) => [n.id, n.data.nodeType]));
  let edgeCount = 0;
  for (const edge of edges) {
    const targetType = nodeTypeById.get(edge.target);
    if (!targetType || !highRiskTargetTypes.has(targetType)) continue;

    edge.data = edgePatch(withSafeEdgeData(edge.data), {
      latencyPlus: 180,
      jitterAtLeast: 50,
      packetLossPlus: 0.04,
      timeoutPlus: 0.18,
      disconnectPlus: 0.02,
    });
    edgeCount++;
  }

  return `Retry Storm applied to ${callerCount} caller node(s) and ${edgeCount} downstream edge(s).`;
}

function applySlowDownstream(nodes: Node<ArchNodeData>[], edges: Edge<ArchEdgeData>[]): string {
  const outgoingCounts = new Map<string, number>();
  for (const edge of edges) {
    outgoingCounts.set(edge.source, (outgoingCounts.get(edge.source) ?? 0) + 1);
  }

  const leafTargets = nodes.filter((n) => (outgoingCounts.get(n.id) ?? 0) === 0 && n.data.nodeType !== ArchNodeType.FRONTEND);
  const targets = leafTargets.length > 0
    ? leafTargets
    : nodes.filter((n) => [ArchNodeType.PAYMENT_GATEWAY, ArchNodeType.DATABASE, ArchNodeType.SEARCH_ENGINE].includes(n.data.nodeType));

  const targetIds = new Set(targets.map((n) => n.id));
  let nodeCount = 0;
  for (const node of targets) {
    const data = node.data as unknown as Record<string, unknown>;
    setNum(data, 'baseLatencyMs', Math.min(10000, getNum(data, 'baseLatencyMs', 20) * 8));
    setNum(data, 'latencyStdDevMs', Math.min(4000, getNum(data, 'latencyStdDevMs', 5) * 3));
    setNum(data, 'failureRate', clamp(getNum(data, 'failureRate', 0.005) + 0.05, 0, 0.8));
    health(data, 'degraded');
    nodeCount++;
  }

  let edgeCount = 0;
  for (const edge of edges) {
    if (!targetIds.has(edge.target)) continue;
    edge.data = edgePatch(withSafeEdgeData(edge.data), {
      latencyPlus: 250,
      jitterAtLeast: 80,
      timeoutPlus: 0.2,
      packetLossPlus: 0.02,
    });
    edgeCount++;
  }

  return `Slow Downstream applied to ${nodeCount} dependency node(s) and ${edgeCount} incoming edge(s).`;
}

function applyPartialOutage(nodes: Node<ArchNodeData>[], edges: Edge<ArchEdgeData>[]): string {
  const candidates = nodes.filter((n) => [
    ArchNodeType.API_GATEWAY,
    ArchNodeType.AUTH_SERVICE,
    ArchNodeType.ORDER_SERVICE,
    ArchNodeType.CUSTOM_SERVICE,
    ArchNodeType.STREAM_PROCESSOR,
    ArchNodeType.NOTIFICATION_SERVICE,
    ArchNodeType.WEBSOCKET_SERVER,
  ].includes(n.data.nodeType));

  const count = Math.max(1, Math.ceil(candidates.length * 0.35));
  const impacted = candidates.slice(0, count);
  const impactedIds = new Set(impacted.map((n) => n.id));

  for (const node of impacted) {
    const data = node.data as unknown as Record<string, unknown>;
    health(data, 'partially_down');
    setNum(data, 'failureRate', clamp(Math.max(getNum(data, 'failureRate', 0.01), 0.18) + 0.05, 0, 0.85));
    mutateServiceCapacity(data, 0.55);
  }

  let edgeCount = 0;
  for (const edge of edges) {
    if (!impactedIds.has(edge.source) && !impactedIds.has(edge.target)) continue;
    edge.data = edgePatch(withSafeEdgeData(edge.data), {
      jitterAtLeast: 30,
      timeoutPlus: 0.1,
      disconnectPlus: 0.08,
    });
    edgeCount++;
  }

  return `Partial Outage impacted ${impacted.length} service node(s) and ${edgeCount} connected edge(s).`;
}

function applyDbSaturation(nodes: Node<ArchNodeData>[], edges: Edge<ArchEdgeData>[]): string {
  const dbNodes = nodes.filter((n) => [ArchNodeType.DATABASE, ArchNodeType.REAL_TIME_DB].includes(n.data.nodeType));
  const dbIds = new Set(dbNodes.map((n) => n.id));

  for (const node of dbNodes) {
    const data = node.data as unknown as Record<string, unknown>;
    health(data, 'saturated');
    setNum(data, 'baseLatencyMs', Math.min(12000, getNum(data, 'baseLatencyMs', 15) * 4));
    setNum(data, 'latencyStdDevMs', Math.min(6000, getNum(data, 'latencyStdDevMs', 5) * 2));
    setNum(data, 'failureRate', clamp(getNum(data, 'failureRate', 0.01) + 0.12, 0, 0.9));
    setNum(data, 'maxConcurrentRequests', Math.max(10, Math.floor(getNum(data, 'maxConcurrentRequests', 500) * 0.6)));

    if (typeof data.maxConnections === 'number') {
      setNum(data, 'maxConnections', Math.max(20, Math.floor(Number(data.maxConnections) * 0.3)));
    }
    if (typeof data.connectionPoolSize === 'number') {
      setNum(data, 'connectionPoolSize', Math.max(10, Math.floor(Number(data.connectionPoolSize) * 0.4)));
    }
    if (typeof data.avgQueryLatencyMs === 'number') {
      setNum(data, 'avgQueryLatencyMs', Math.min(15000, Number(data.avgQueryLatencyMs) * 5));
    }
    if (typeof data.replicationLatencyMs === 'number') {
      setNum(data, 'replicationLatencyMs', Math.min(15000, Number(data.replicationLatencyMs) * 4));
    }
  }

  let edgeCount = 0;
  for (const edge of edges) {
    if (!dbIds.has(edge.target)) continue;
    edge.data = edgePatch(withSafeEdgeData(edge.data), {
      latencyPlus: 220,
      jitterAtLeast: 60,
      timeoutPlus: 0.2,
      packetLossPlus: 0.03,
    });
    edgeCount++;
  }

  return `DB Saturation applied to ${dbNodes.length} DB node(s) and ${edgeCount} incoming edge(s).`;
}

function applyCacheDegradation(nodes: Node<ArchNodeData>[], edges: Edge<ArchEdgeData>[]): string {
  const cacheNodes = nodes.filter((n) => [ArchNodeType.CACHE, ArchNodeType.CDN].includes(n.data.nodeType));
  const dbNodes = nodes.filter((n) => n.data.nodeType === ArchNodeType.DATABASE);
  const dbIds = new Set(dbNodes.map((n) => n.id));

  for (const node of cacheNodes) {
    const data = node.data as unknown as Record<string, unknown>;
    health(data, 'degraded');
    setNum(data, 'baseLatencyMs', Math.min(5000, getNum(data, 'baseLatencyMs', 5) * 5));
    setNum(data, 'failureRate', clamp(getNum(data, 'failureRate', 0.002) + 0.03, 0, 0.7));

    if (typeof data.hitRate === 'number') {
      setNum(data, 'hitRate', clamp(Number(data.hitRate) - 0.35, 0.3, 0.99));
    }
    if (typeof data.cacheHitRate === 'number') {
      setNum(data, 'cacheHitRate', clamp(Number(data.cacheHitRate) - 0.3, 0.5, 0.99));
    }
  }

  for (const node of dbNodes) {
    const data = node.data as unknown as Record<string, unknown>;
    health(data, 'degraded');
    setNum(data, 'baseLatencyMs', Math.min(12000, getNum(data, 'baseLatencyMs', 10) * 1.8));
    if (typeof data.avgQueryLatencyMs === 'number') {
      setNum(data, 'avgQueryLatencyMs', Math.min(15000, Number(data.avgQueryLatencyMs) * 2));
    }
  }

  let edgeCount = 0;
  for (const edge of edges) {
    if (!dbIds.has(edge.target)) continue;
    edge.data = edgePatch(withSafeEdgeData(edge.data), {
      latencyPlus: 90,
      timeoutPlus: 0.08,
      jitterAtLeast: 30,
    });
    edgeCount++;
  }

  return `Cache Degradation applied to ${cacheNodes.length} cache node(s), ${dbNodes.length} DB node(s), and ${edgeCount} DB edge(s).`;
}

function applyQueueBacklog(nodes: Node<ArchNodeData>[], edges: Edge<ArchEdgeData>[]): string {
  const queueNodes = nodes.filter((n) => n.data.nodeType === ArchNodeType.QUEUE);
  const queueIds = new Set(queueNodes.map((n) => n.id));

  for (const node of queueNodes) {
    const data = node.data as unknown as Record<string, unknown>;
    health(data, 'saturated');
    setNum(data, 'baseLatencyMs', Math.min(8000, getNum(data, 'baseLatencyMs', 5) * 2));
    setNum(data, 'failureRate', clamp(getNum(data, 'failureRate', 0.002) + 0.03, 0, 0.75));

    if (typeof data.consumerCount === 'number') {
      setNum(data, 'consumerCount', Math.max(1, Math.floor(Number(data.consumerCount) * 0.35)));
    }
    if (typeof data.consumerProcessingMs === 'number') {
      setNum(data, 'consumerProcessingMs', Math.min(20000, Number(data.consumerProcessingMs) * 4));
    }
    if (typeof data.maxQueueDepth === 'number') {
      setNum(data, 'maxQueueDepth', Math.max(100, Math.floor(Number(data.maxQueueDepth) * 0.6)));
    }
  }

  let edgeCount = 0;
  for (const edge of edges) {
    if (queueIds.has(edge.target)) {
      edge.data = edgePatch(withSafeEdgeData(edge.data), {
        latencyPlus: 140,
        jitterAtLeast: 50,
        timeoutPlus: 0.12,
        packetLossPlus: 0.02,
      });
      edgeCount++;
      continue;
    }

    if (queueIds.has(edge.source)) {
      edge.data = edgePatch(withSafeEdgeData(edge.data), {
        jitterAtLeast: 20,
        timeoutPlus: 0.07,
      });
      edgeCount++;
    }
  }

  const streamNodes = nodes.filter((n) => n.data.nodeType === ArchNodeType.STREAM_PROCESSOR);
  for (const node of streamNodes) {
    const data = node.data as unknown as Record<string, unknown>;
    health(data, 'degraded');
    if (typeof data.processLatencyMs === 'number') {
      setNum(data, 'processLatencyMs', Math.min(12000, Number(data.processLatencyMs) * 2));
    }
  }

  return `Queue Backlog applied to ${queueNodes.length} queue node(s), ${streamNodes.length} stream node(s), and ${edgeCount} queue edge(s).`;
}

export function applyScenarioInjector(
  nodes: Node<ArchNodeData>[],
  edges: Edge<ArchEdgeData>[],
  scenarioId: ScenarioInjectorId
): ScenarioApplyResult {
  const nextNodes = cloneNodes(nodes);
  const nextEdges = cloneEdges(edges);

  let summary = '';
  switch (scenarioId) {
    case 'retry_storm':
      summary = applyRetryStorm(nextNodes, nextEdges);
      break;
    case 'slow_downstream':
      summary = applySlowDownstream(nextNodes, nextEdges);
      break;
    case 'partial_outage':
      summary = applyPartialOutage(nextNodes, nextEdges);
      break;
    case 'db_saturation':
      summary = applyDbSaturation(nextNodes, nextEdges);
      break;
    case 'cache_degradation':
      summary = applyCacheDegradation(nextNodes, nextEdges);
      break;
    case 'queue_backlog':
      summary = applyQueueBacklog(nextNodes, nextEdges);
      break;
    default:
      summary = 'No scenario applied.';
      break;
  }

  return {
    nodes: nextNodes,
    edges: nextEdges,
    summary,
  };
}

export function previewScenarioInjectorImpact(
  nodes: Node<ArchNodeData>[],
  edges: Edge<ArchEdgeData>[],
  scenarioId: ScenarioInjectorId
): ScenarioImpactPreview {
  const baseNodes = cloneNodes(nodes);
  const baseEdges = cloneEdges(edges);
  const applied = applyScenarioInjector(nodes, edges, scenarioId);

  const nodeById = new Map(baseNodes.map((node) => [node.id, node]));
  const edgeById = new Map(baseEdges.map((edge) => [edge.id, edge]));

  const changedNodeLabels: string[] = [];
  for (const node of applied.nodes) {
    const baseline = nodeById.get(node.id);
    if (!baseline) continue;
    if (jsonString(baseline.data) !== jsonString(node.data)) {
      changedNodeLabels.push(node.data.label || node.id);
    }
  }

  const changedEdgeLabels: string[] = [];
  for (const edge of applied.edges) {
    const baseline = edgeById.get(edge.id);
    if (!baseline) continue;
    if (jsonString(baseline.data) !== jsonString(edge.data)) {
      const label = typeof edge.data.label === 'string' && edge.data.label.trim().length > 0
        ? edge.data.label
        : `${edge.source} -> ${edge.target}`;
      changedEdgeLabels.push(label);
    }
  }

  return {
    summary: applied.summary,
    changedNodeCount: changedNodeLabels.length,
    changedEdgeCount: changedEdgeLabels.length,
    changedNodeLabels: changedNodeLabels.slice(0, 8),
    changedEdgeLabels: changedEdgeLabels.slice(0, 8),
  };
}
