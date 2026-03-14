export interface ArchEdgeData {
  [key: string]: unknown;
  protocol: 'http' | 'grpc' | 'websocket' | 'tcp' | 'amqp' | 'kafka';
  bandwidthMbps: number;
  latencyOverheadMs: number;
  encrypted: boolean;
  label?: string;
  // Network-condition controls (advanced mode)
  jitterMs?: number;
  packetLossRate?: number;
  disconnectRate?: number;
  timeoutProbability?: number;
}

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data: ArchEdgeData;
  animated?: boolean;
}
