import { SimEventType, type SimEvent, type WebSocketServerNodeProps } from '@system-vis/shared';
import { ComponentModel, sampleNormal } from '../component-model.js';

export class WebSocketServerModel extends ComponentModel {
  private activeConnections = 0;

  handleEvent(event: SimEvent): SimEvent[] {
    switch (event.type) {
      case SimEventType.REQUEST_ARRIVE:
      case SimEventType.REQUEST_ROUTE: {
        const config = this.config as WebSocketServerNodeProps;
        const totalCapacity = config.instances * config.maxConcurrentRequests;

        if (this.activeConnections >= config.maxConnections || this.state.activeRequests >= totalCapacity) {
          this.state.totalFailed++;
          return [];
        }

        this.state.activeRequests++;
        this.activeConnections++;
        this.updateUtilization();

        const baseLatency = sampleNormal(config.baseLatencyMs, config.latencyStdDevMs);
        const broadcastOverhead = sampleNormal(10, 5);
        const processingTime = baseLatency + broadcastOverhead;

        if (this.shouldFail()) {
          return [{
            id: `evt_ws_fail_${event.requestId}`,
            type: SimEventType.REQUEST_FAIL,
            timestamp: event.timestamp + processingTime,
            requestId: event.requestId,
            nodeId: event.nodeId,
          }];
        }

        return [{
          id: `evt_ws_end_${event.requestId}`,
          type: SimEventType.REQUEST_PROCESS_END,
          timestamp: event.timestamp + processingTime,
          requestId: event.requestId,
          nodeId: event.nodeId,
          metadata: { arrivalTime: event.timestamp },
        }];
      }

      case SimEventType.REQUEST_PROCESS_END: {
        this.state.activeRequests = Math.max(0, this.state.activeRequests - 1);
        this.activeConnections = Math.max(0, this.activeConnections - 1);
        this.state.totalProcessed++;

        const arrivalTime = (event.metadata?.arrivalTime as number | undefined) ?? event.timestamp;
        this.state.completedLatencies.push(event.timestamp - arrivalTime);
        this.updateUtilization();

        return this.routeToDownstream(event.requestId, event.timestamp);
      }

      case SimEventType.REQUEST_FAIL: {
        this.state.activeRequests = Math.max(0, this.state.activeRequests - 1);
        this.activeConnections = Math.max(0, this.activeConnections - 1);
        this.state.totalFailed++;
        this.updateUtilization();
        return [];
      }

      default:
        return [];
    }
  }
}
