import { SimEventType, type SimEvent, type AnalyticsServiceNodeProps } from '@system-vis/shared';
import { ComponentModel, sampleNormal } from '../component-model.js';

export class AnalyticsServiceModel extends ComponentModel {
  private bufferedEvents = 0;
  private aggregationBuffer = 1000;

  handleEvent(event: SimEvent): SimEvent[] {
    switch (event.type) {
      case SimEventType.REQUEST_ARRIVE:
      case SimEventType.REQUEST_ROUTE: {
        const config = this.config as AnalyticsServiceNodeProps;
        const totalCapacity = config.instances * config.maxConcurrentRequests;

        if (this.state.activeRequests >= totalCapacity) {
          this.state.totalFailed++;
          return [];
        }

        this.state.activeRequests++;
        this.updateUtilization();

        // Analytics is usually async: fast buffer, occasional heavier aggregation.
        let processingTime = sampleNormal(5, 2);
        this.bufferedEvents++;

        if (this.bufferedEvents >= this.aggregationBuffer) {
          const aggMean = Math.max(1, config.aggregationLatencyMs ?? config.baseLatencyMs);
          processingTime += sampleNormal(aggMean, Math.max(1, aggMean) * 0.3);
          this.bufferedEvents = 0;
        }

        if (this.shouldFail()) {
          return [{
            id: `evt_analytics_fail_${event.requestId}`,
            type: SimEventType.REQUEST_FAIL,
            timestamp: event.timestamp + processingTime,
            requestId: event.requestId,
            nodeId: event.nodeId,
          }];
        }

        return [{
          id: `evt_analytics_end_${event.requestId}`,
          type: SimEventType.REQUEST_PROCESS_END,
          timestamp: event.timestamp + processingTime,
          requestId: event.requestId,
          nodeId: event.nodeId,
          metadata: { arrivalTime: event.timestamp },
        }];
      }

      case SimEventType.REQUEST_PROCESS_END: {
        this.state.activeRequests = Math.max(0, this.state.activeRequests - 1);
        this.state.totalProcessed++;

        const arrivalTime = (event.metadata?.arrivalTime as number | undefined) ?? event.timestamp;
        this.state.completedLatencies.push(event.timestamp - arrivalTime);
        this.updateUtilization();

        return this.routeToDownstream(event.requestId, event.timestamp);
      }

      case SimEventType.REQUEST_FAIL: {
        this.state.activeRequests = Math.max(0, this.state.activeRequests - 1);
        this.state.totalFailed++;
        this.updateUtilization();
        return [];
      }

      default:
        return [];
    }
  }
}
