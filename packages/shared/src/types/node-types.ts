export enum ArchNodeType {
  CDN = 'cdn',
  LOAD_BALANCER = 'load_balancer',
  FRONTEND = 'frontend',
  API_GATEWAY = 'api_gateway',
  AUTH_SERVICE = 'auth_service',
  ORDER_SERVICE = 'order_service',
  CUSTOM_SERVICE = 'custom_service',
  DATABASE = 'database',
  CACHE = 'cache',
  QUEUE = 'queue',
  WEBSOCKET_SERVER = 'websocket_server',
  SEARCH_ENGINE = 'search_engine',
  STREAM_PROCESSOR = 'stream_processor',
  ML_MODEL_SERVICE = 'ml_model_service',
  PAYMENT_GATEWAY = 'payment_gateway',
  NOTIFICATION_SERVICE = 'notification_service',
  ANALYTICS_SERVICE = 'analytics_service',
  REAL_TIME_DB = 'real_time_db',
}

export interface NodeRequestResponseTemplate {
  requestTemplate: {
    description: string;
    sample: Record<string, any>;
    fields: Array<{ name: string; type: string; description: string }>;
  };
  responseTemplate: {
    description: string;
    sample: Record<string, any>;
    fields: Array<{ name: string; type: string; description: string }>;
  };
}

export interface BaseNodeProps {
  [key: string]: unknown;
  label: string;
  nodeType: ArchNodeType;
  maxRPS: number;
  baseLatencyMs: number;
  latencyStdDevMs: number;
  failureRate: number;
  maxConcurrentRequests: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
  /** Optional per-node custom request/response template. When provided by AI-generated designs,
   *  this takes priority over the generic type-based template. */
  requestResponseTemplate?: NodeRequestResponseTemplate;
  tooltip?: string;
}

export interface CDNNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.CDN;
  cacheHitRate: number;
  regions: string[];
}

export interface LoadBalancerNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.LOAD_BALANCER;
  algorithm: 'round_robin' | 'least_connections' | 'ip_hash' | 'weighted';
  healthCheckIntervalMs: number;
}

export interface ServiceNodeProps extends BaseNodeProps {
  nodeType:
  | ArchNodeType.AUTH_SERVICE
  | ArchNodeType.ORDER_SERVICE
  | ArchNodeType.CUSTOM_SERVICE
  | ArchNodeType.FRONTEND
  | ArchNodeType.NOTIFICATION_SERVICE
  | ArchNodeType.ANALYTICS_SERVICE;
  instances: number;
  cpuPerInstance: number;
  memoryPerInstanceMB: number;
  autoScale: boolean;
  autoScaleThreshold: number;
}

export interface APIGatewayNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.API_GATEWAY;
  rateLimitRPS: number;
  authEnabled: boolean;
  corsEnabled: boolean;
}

export interface DatabaseNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.DATABASE;
  dbType: 'postgresql' | 'mysql' | 'mongodb' | 'dynamodb';
  maxConnections: number;
  readReplicas: number;
  avgQueryLatencyMs: number;
  connectionPoolSize: number;
}

export interface CacheNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.CACHE;
  cacheType: 'redis' | 'memcached';
  maxMemoryMB: number;
  hitRate: number;
  ttlSeconds: number;
  evictionPolicy: 'lru' | 'lfu' | 'random';
}

export interface QueueNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.QUEUE;
  queueType: 'kafka' | 'rabbitmq' | 'sqs';
  maxQueueDepth: number;
  consumerCount: number;
  consumerProcessingMs: number;
  partitions: number;
}

export interface WebSocketServerNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.WEBSOCKET_SERVER;
  instances: number;
  cpuPerInstance: number;
  memoryPerInstanceMB: number;
  autoScale: boolean;
  autoScaleThreshold: number;
  maxConnections: number;
}

export interface SearchEngineNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.SEARCH_ENGINE;
  engineType: 'elasticsearch' | 'solr' | 'opensearch';
  maxMemoryMB: number;
  shardCount: number;
  replicaCount: number;
  indexingLatencyMs: number;
}

export interface StreamProcessorNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.STREAM_PROCESSOR;
  processorType: 'kafka-streams' | 'flink' | 'spark';
  instances: number;
  cpuPerInstance: number;
  memoryPerInstanceMB: number;
  autoScale: boolean;
  autoScaleThreshold: number;
  processLatencyMs: number;
}

export interface MLModelServiceNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.ML_MODEL_SERVICE;
  instances: number;
  cpuPerInstance: number;
  memoryPerInstanceMB: number;
  autoScale: boolean;
  autoScaleThreshold: number;
  gpuSupport: boolean;
  inferenceLatencyMs: number;
}

export interface PaymentGatewayNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.PAYMENT_GATEWAY;
  provider: 'stripe' | 'paypal' | 'square' | 'razorpay';
  instances: number;
  cpuPerInstance: number;
  memoryPerInstanceMB: number;
  transactionLatencyMs: number;
}

export interface NotificationServiceNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.NOTIFICATION_SERVICE;
  instances: number;
  cpuPerInstance: number;
  memoryPerInstanceMB: number;
  autoScale: boolean;
  autoScaleThreshold: number;
  channels: ('email' | 'sms' | 'push' | 'webhook')[];
}

export interface AnalyticsServiceNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.ANALYTICS_SERVICE;
  instances: number;
  cpuPerInstance: number;
  memoryPerInstanceMB: number;
  dataWarehouse: 'bigquery' | 'redshift' | 'snowflake';
  aggregationLatencyMs: number;
}

export interface RealTimeDBNodeProps extends BaseNodeProps {
  nodeType: ArchNodeType.REAL_TIME_DB;
  dbType: 'firebase' | 'dynamodb' | 'supabase';
  maxMemoryMB: number;
  maxConnections: number;
  replicationLatencyMs: number;
}

export type ArchNodeData =
  | CDNNodeProps
  | LoadBalancerNodeProps
  | ServiceNodeProps
  | APIGatewayNodeProps
  | DatabaseNodeProps
  | CacheNodeProps
  | QueueNodeProps
  | WebSocketServerNodeProps
  | SearchEngineNodeProps
  | StreamProcessorNodeProps
  | MLModelServiceNodeProps
  | PaymentGatewayNodeProps
  | NotificationServiceNodeProps
  | AnalyticsServiceNodeProps
  | RealTimeDBNodeProps;

export interface ArchNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: ArchNodeData;
}


