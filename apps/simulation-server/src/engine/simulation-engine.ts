import type { Architecture, SimulationConfig, SimulationTickResult, SimEvent, ArchEdgeData, BaseNodeProps } from '@system-vis/shared';
import { ArchNodeType, SimEventType } from '@system-vis/shared';
import { EventQueue } from './event-queue.js';
import { generateArrivals, InternalTrafficGenerator } from './traffic-generator.js';
import { collectMetrics } from './metrics-collector.js';
import { detectBottlenecks } from './bottleneck-detector.js';
import { ComponentModel } from './component-model.js';
import { ServiceModel } from './models/service-model.js';
import { LoadBalancerModel } from './models/load-balancer-model.js';
import { DatabaseModel } from './models/database-model.js';
import { CacheModel } from './models/cache-model.js';
import { QueueModel } from './models/queue-model.js';
import { CDNModel } from './models/cdn-model.js';
import { GatewayModel } from './models/gateway-model.js';
import { WebSocketServerModel } from './models/websocket-server-model.js';
import { SearchEngineModel } from './models/search-engine-model.js';
import { StreamProcessorModel } from './models/stream-processor-model.js';
import { MLModelServiceModel } from './models/ml-model-service-model.js';
import { PaymentGatewayModel } from './models/payment-gateway-model.js';
import { NotificationServiceModel } from './models/notification-service-model.js';
import { AnalyticsServiceModel } from './models/analytics-service-model.js';
import { RealTimeDBModel } from './models/realtime-db-model.js';

const DEFAULT_EDGE: Required<Pick<ArchEdgeData, 'latencyOverheadMs' | 'bandwidthMbps' | 'jitterMs' | 'packetLossRate' | 'disconnectRate' | 'timeoutProbability'>> = {
  latencyOverheadMs: 1,
  bandwidthMbps: 1000,
  jitterMs: 0,
  packetLossRate: 0,
  disconnectRate: 0,
  timeoutProbability: 0,
};

const DEFAULT_RETRY_POLICY = {
  requestTimeoutMs: 1200,
  retryCount: 2,
  retryBackoffMs: 120,
  retryBackoffStrategy: 'exponential' as const,
};

export class SimulationEngine {
  private eventQueue = new EventQueue();
  private models = new Map<string, ComponentModel>();
  private edgeMap = new Map<string, ArchEdgeData>();
  private config: SimulationConfig;
  private architecture: Architecture;
  private internalTrafficGenerator?: InternalTrafficGenerator;
  private tickCount = 0;
  private simulationTimeMs = 0;
  private totalRequests = 0;
  private completedRequests = 0;
  private failedRequests = 0;

  constructor(architecture: Architecture, config: SimulationConfig) {
    this.architecture = architecture;
    this.config = config;
    this._initEdgeMap();
    this._initModels();
    this._initTrafficGenerators();
  }

  private _edgeKey(sourceNodeId: string, targetNodeId: string): string {
    return `${sourceNodeId}->${targetNodeId}`;
  }

  private _initEdgeMap(): void {
    for (const edge of this.architecture.edges) {
      this.edgeMap.set(this._edgeKey(edge.source, edge.target), edge.data);
    }
  }

  private _initTrafficGenerators(): void {
    // Initialize internal traffic generator if enabled
    if (this.config.trafficGeneration?.internal?.enabled) {
      this.internalTrafficGenerator = new InternalTrafficGenerator(this.architecture);
    }
  }

  private _initModels(): void {
    for (const node of this.architecture.nodes) {
      const downstreamIds = this.architecture.edges
        .filter((e) => e.source === node.id)
        .map((e) => e.target);

      const data = node.data;
      let model: ComponentModel;

      switch (data.nodeType) {
        case ArchNodeType.LOAD_BALANCER:
          model = new LoadBalancerModel(data, downstreamIds);
          break;
        case ArchNodeType.DATABASE:
          model = new DatabaseModel(data, downstreamIds);
          break;
        case ArchNodeType.CACHE:
          model = new CacheModel(data, downstreamIds);
          break;
        case ArchNodeType.QUEUE:
          model = new QueueModel(data, downstreamIds);
          break;
        case ArchNodeType.CDN:
          model = new CDNModel(data, downstreamIds);
          break;
        case ArchNodeType.API_GATEWAY:
          model = new GatewayModel(data, downstreamIds);
          break;
        case ArchNodeType.WEBSOCKET_SERVER:
          model = new WebSocketServerModel(data, downstreamIds);
          break;
        case ArchNodeType.SEARCH_ENGINE:
          model = new SearchEngineModel(data, downstreamIds);
          break;
        case ArchNodeType.STREAM_PROCESSOR:
          model = new StreamProcessorModel(data, downstreamIds);
          break;
        case ArchNodeType.ML_MODEL_SERVICE:
          model = new MLModelServiceModel(data, downstreamIds);
          break;
        case ArchNodeType.PAYMENT_GATEWAY:
          model = new PaymentGatewayModel(data, downstreamIds);
          break;
        case ArchNodeType.NOTIFICATION_SERVICE:
          model = new NotificationServiceModel(data, downstreamIds);
          break;
        case ArchNodeType.ANALYTICS_SERVICE:
          model = new AnalyticsServiceModel(data, downstreamIds);
          break;
        case ArchNodeType.REAL_TIME_DB:
          model = new RealTimeDBModel(data, downstreamIds);
          break;
        default:
          model = new ServiceModel(data, downstreamIds);
          break;
      }

      this.models.set(node.id, model);
    }
  }

  private _boundedRate(value: number | undefined): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value ?? 0));
  }

  private _retryDelayMs(backoffMs: number, strategy: 'fixed' | 'exponential', attempt: number): number {
    const safeBackoff = Math.max(1, backoffMs);
    if (strategy === 'exponential') {
      return safeBackoff * Math.pow(2, attempt);
    }
    return safeBackoff;
  }

  private _computeNetworkDelayMs(edge: Pick<ArchEdgeData, 'latencyOverheadMs' | 'bandwidthMbps' | 'jitterMs'>): number {
    const baseLatency = edge.latencyOverheadMs ?? DEFAULT_EDGE.latencyOverheadMs;
    const jitter = edge.jitterMs ?? DEFAULT_EDGE.jitterMs;
    const jitterDelta = jitter > 0 ? (Math.random() * 2 - 1) * jitter : 0;

    // Simple transfer delay estimate with 4KB payload.
    const bandwidthMbps = Math.max(0.1, edge.bandwidthMbps ?? DEFAULT_EDGE.bandwidthMbps);
    const transferDelayMs = 32 / bandwidthMbps;

    return Math.max(0, baseLatency + jitterDelta + transferDelayMs);
  }

  private _recordNetworkFailure(targetNodeId: string): void {
    const targetModel = this.models.get(targetNodeId);
    if (targetModel) {
      targetModel.state.totalFailed++;
    }
    this.failedRequests++;
  }

  private _applyRouteNetworkEffects(sourceEvent: SimEvent, routeEvent: SimEvent): SimEvent[] {
    const sourceNodeId = sourceEvent.nodeId;
    const targetNodeId = routeEvent.nodeId;

    const sourceModel = this.models.get(sourceNodeId);
    const sourceConfig = (sourceModel?.getConfig() ?? {}) as BaseNodeProps;

    const requestTimeoutMs = Number(sourceConfig.requestTimeoutMs ?? DEFAULT_RETRY_POLICY.requestTimeoutMs);
    const retryCount = Math.max(0, Number(sourceConfig.retryCount ?? DEFAULT_RETRY_POLICY.retryCount));
    const retryBackoffMs = Math.max(1, Number(sourceConfig.retryBackoffMs ?? DEFAULT_RETRY_POLICY.retryBackoffMs));
    const retryBackoffStrategy =
      sourceConfig.retryBackoffStrategy === 'fixed' || sourceConfig.retryBackoffStrategy === 'exponential'
        ? sourceConfig.retryBackoffStrategy
        : DEFAULT_RETRY_POLICY.retryBackoffStrategy;

    const edge = this.edgeMap.get(this._edgeKey(sourceNodeId, targetNodeId)) ?? DEFAULT_EDGE;

    const packetLossRate = this._boundedRate((edge.packetLossRate as number | undefined) ?? DEFAULT_EDGE.packetLossRate);
    const disconnectRate = this._boundedRate((edge.disconnectRate as number | undefined) ?? DEFAULT_EDGE.disconnectRate);
    const timeoutProbability = this._boundedRate((edge.timeoutProbability as number | undefined) ?? DEFAULT_EDGE.timeoutProbability);

    const networkDelayMs = this._computeNetworkDelayMs(edge);
    const attempt = Number(routeEvent.metadata?.retryAttempt ?? 0);

    const packetLoss = Math.random() < packetLossRate;
    const disconnected = !packetLoss && Math.random() < disconnectRate;
    const probabilisticTimeout = !packetLoss && !disconnected && Math.random() < timeoutProbability;
    const latencyTimeout = requestTimeoutMs > 0 && networkDelayMs > requestTimeoutMs;

    let failureReason: string | null = null;
    if (packetLoss) failureReason = 'packet_loss';
    else if (disconnected) failureReason = 'intermittent_disconnect';
    else if (probabilisticTimeout) failureReason = 'timeout_probability';
    else if (latencyTimeout) failureReason = 'timeout_latency';

    if (failureReason) {
      if (attempt < retryCount) {
        const nextAttempt = attempt + 1;
        const retryDelayMs = this._retryDelayMs(retryBackoffMs, retryBackoffStrategy, attempt);

        return [{
          ...routeEvent,
          id: `${routeEvent.id}_retry_${nextAttempt}`,
          timestamp: sourceEvent.timestamp + retryDelayMs,
          metadata: {
            ...(routeEvent.metadata ?? {}),
            sourceNodeId,
            targetNodeId,
            retryAttempt: nextAttempt,
            retryReason: failureReason,
            priorDelayMs: networkDelayMs,
          },
        }];
      }

      this._recordNetworkFailure(targetNodeId);
      return [];
    }

    return [{
      ...routeEvent,
      timestamp: routeEvent.timestamp + networkDelayMs,
      metadata: {
        ...(routeEvent.metadata ?? {}),
        sourceNodeId,
        targetNodeId,
        retryAttempt: attempt,
        networkDelayMs,
      },
    }];
  }

  tick(): SimulationTickResult {
    this.tickCount++;
    const tickDurationMs = this.config.tickIntervalMs;
    const tickStartMs = this.simulationTimeMs;
    this.simulationTimeMs += tickDurationMs;

    // 1. Generate arrivals from external traffic injection (Locust)
    const externalArrivals = generateArrivals(
      this.config.trafficPattern,
      tickStartMs,
      tickDurationMs,
      this.config.entryNodeId
    );

    // 2. Generate arrivals from internal traffic simulation
    let internalArrivals: typeof externalArrivals = [];
    if (this.internalTrafficGenerator) {
      internalArrivals = this.internalTrafficGenerator.generateArrivals(
        this.config.trafficGeneration!.internal!.loadPattern,
        tickStartMs,
        tickDurationMs
      );
    }

    // 3. Merge both traffic sources
    const allArrivals = [...externalArrivals, ...internalArrivals];
    this.totalRequests += allArrivals.length;
    for (const evt of allArrivals) {
      this.eventQueue.push(evt);
    }

    // 4. Process event queue
    let processedEvents = 0;
    const maxEventsPerTick = 50000;
    while (this.eventQueue.length > 0 && processedEvents < maxEventsPerTick) {
      const event = this.eventQueue.peek()!;
      if (event.timestamp > this.simulationTimeMs) break;

      this.eventQueue.pop();
      processedEvents++;

      const model = this.models.get(event.nodeId);
      if (!model) continue;

      const resultEvents = model.handleEvent(event);
      for (const re of resultEvents) {
        if (re.type === SimEventType.REQUEST_ROUTE) {
          const routed = this._applyRouteNetworkEffects(event, re);
          for (const routedEvent of routed) {
            this.eventQueue.push(routedEvent);
          }
          continue;
        }

        if (re.type === SimEventType.REQUEST_COMPLETE) {
          if (re.metadata?.success === false) {
            this.failedRequests++;
          } else {
            this.completedRequests++;
          }
          continue;
        }

        this.eventQueue.push(re);
      }
    }

    // 5. Update utilization for all models
    for (const model of this.models.values()) {
      model.updateUtilization();
    }

    // 6. Collect metrics
    const timeSec = this.simulationTimeMs / 1000;
    const componentMetrics = collectMetrics(this.models, timeSec, tickDurationMs / 1000);

    // 7. Detect bottlenecks
    const bottlenecks = detectBottlenecks(componentMetrics);

    // 8. Compute global metrics
    const allLatencies: number[] = [];
    let totalErrors = 0;
    let totalProcessed = 0;
    for (const m of Object.values(componentMetrics)) {
      totalErrors += m.errorCount;
      totalProcessed += m.throughput;
      allLatencies.push(m.latencyP50Ms);
    }

    const avgLatency = allLatencies.length > 0
      ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
      : 0;

    return {
      tick: this.tickCount,
      timeSec,
      componentMetrics,
      activePackets: [],
      bottlenecks,
      globalMetrics: {
        totalRPS: allArrivals.length / (tickDurationMs / 1000),
        avgLatencyMs: avgLatency,
        p99LatencyMs: Math.max(...Object.values(componentMetrics).map((m) => m.latencyP99Ms), 0),
        errorRate: totalProcessed > 0 ? totalErrors / totalProcessed : 0,
      },
    };
  }

  isComplete(): boolean {
    return this.simulationTimeMs >= this.config.durationSec * 1000;
  }

  getSimulationTimeMs(): number {
    return this.simulationTimeMs;
  }
}

