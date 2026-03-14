import { SimEventType, type SimEvent, type RealTimeDBNodeProps } from '@system-vis/shared';
import { ComponentModel, sampleNormal } from '../component-model.js';

export class RealTimeDBModel extends ComponentModel {
  private activeSubscriptions = 0;

  handleEvent(event: SimEvent): SimEvent[] {
    switch (event.type) {
      case SimEventType.REQUEST_ARRIVE:
      case SimEventType.REQUEST_ROUTE: {
        const config = this.config as RealTimeDBNodeProps;
        const totalCapacity = Math.min(
          Math.max(1, config.maxConcurrentRequests),
          Math.max(1, config.maxConnections)
        );

        if (this.state.activeRequests >= totalCapacity) {
          this.state.totalFailed++;
          return [];
        }

        this.state.activeRequests++;
        this.updateUtilization();

        // Track subscriptions (long-lived connections) roughly.
        if (Math.random() < 0.3) {
          this.activeSubscriptions++;
        }

        const baseTime = sampleNormal(config.baseLatencyMs, config.latencyStdDevMs);
        const replicationTime = sampleNormal(
          Math.max(1, config.replicationLatencyMs),
          Math.max(1, config.replicationLatencyMs) * 0.3
        );
        const opTime = baseTime + replicationTime;

        if (this.shouldFail()) {
          return [{
            id: `evt_rtdb_fail_${event.requestId}`,
            type: SimEventType.REQUEST_FAIL,
            timestamp: event.timestamp + opTime,
            requestId: event.requestId,
            nodeId: event.nodeId,
            metadata: { subscriptions: this.activeSubscriptions },
          }];
        }

        return [{
          id: `evt_rtdb_end_${event.requestId}`,
          type: SimEventType.REQUEST_PROCESS_END,
          timestamp: event.timestamp + opTime,
          requestId: event.requestId,
          nodeId: event.nodeId,
          metadata: { arrivalTime: event.timestamp, subscriptions: this.activeSubscriptions },
        }];
      }

      case SimEventType.REQUEST_PROCESS_END: {
        this.state.activeRequests = Math.max(0, this.state.activeRequests - 1);
        this.state.totalProcessed++;

        const arrivalTime = (event.metadata?.arrivalTime as number | undefined) ?? event.timestamp;
        this.state.completedLatencies.push(event.timestamp - arrivalTime);

        // Occasional subscription cleanup.
        if (Math.random() < 0.05) {
          this.activeSubscriptions = Math.max(0, this.activeSubscriptions - 1);
        }

        this.updateUtilization();
        return this.routeToDownstream(event.requestId, event.timestamp);
      }

      case SimEventType.REQUEST_FAIL: {
        this.state.activeRequests = Math.max(0, this.state.activeRequests - 1);
        this.state.totalFailed++;

        if (Math.random() < 0.05) {
          this.activeSubscriptions = Math.max(0, this.activeSubscriptions - 1);
        }

        this.updateUtilization();
        return [];
      }

      default:
        return [];
    }
  }
}
