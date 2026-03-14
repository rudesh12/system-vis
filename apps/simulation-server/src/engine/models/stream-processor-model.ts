import { SimEventType, type SimEvent, type StreamProcessorNodeProps } from '@system-vis/shared';
import { ComponentModel, sampleNormal } from '../component-model.js';

export class StreamProcessorModel extends ComponentModel {
  private processedEvents = 0;
  private lagMs = 0;

  handleEvent(event: SimEvent): SimEvent[] {
    switch (event.type) {
      case SimEventType.REQUEST_ARRIVE:
      case SimEventType.REQUEST_ROUTE: {
        const config = this.config as StreamProcessorNodeProps;
        const totalCapacity = config.instances * config.maxConcurrentRequests;

        if (this.state.activeRequests >= totalCapacity) {
          this.state.totalFailed++;
          return [];
        }

        this.state.activeRequests++;
        this.updateUtilization();

        const mean = Math.max(1, config.processLatencyMs ?? config.baseLatencyMs);
        const processingTime = sampleNormal(mean, config.latencyStdDevMs);
        this.lagMs = Math.max(0, this.lagMs + processingTime);

        if (this.shouldFail()) {
          return [{
            id: `evt_stream_fail_${event.requestId}`,
            type: SimEventType.REQUEST_FAIL,
            timestamp: event.timestamp + processingTime,
            requestId: event.requestId,
            nodeId: event.nodeId,
          }];
        }

        return [{
          id: `evt_stream_end_${event.requestId}`,
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
        this.processedEvents++;

        const arrivalTime = (event.metadata?.arrivalTime as number | undefined) ?? event.timestamp;
        this.state.completedLatencies.push(event.timestamp - arrivalTime);

        // Reduce lag slowly.
        this.lagMs = Math.max(0, this.lagMs - 10);
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
