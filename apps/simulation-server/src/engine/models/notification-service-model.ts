import { SimEventType, type SimEvent, type NotificationServiceNodeProps } from '@system-vis/shared';
import { ComponentModel, sampleNormal } from '../component-model.js';

export class NotificationServiceModel extends ComponentModel {
  private notificationQueue = 0;

  handleEvent(event: SimEvent): SimEvent[] {
    switch (event.type) {
      case SimEventType.REQUEST_ARRIVE:
      case SimEventType.REQUEST_ROUTE: {
        const config = this.config as NotificationServiceNodeProps;
        const totalCapacity = config.instances * config.maxConcurrentRequests;

        if (this.notificationQueue > 50000 || this.state.activeRequests >= totalCapacity) {
          this.state.totalFailed++;
          return [];
        }

        this.state.activeRequests++;
        this.notificationQueue++;
        this.state.queueDepth = this.notificationQueue;
        this.updateUtilization();

        const enqueueTime = sampleNormal(10, 5);

        if (this.shouldFail()) {
          return [{
            id: `evt_notif_fail_${event.requestId}`,
            type: SimEventType.REQUEST_FAIL,
            timestamp: event.timestamp + enqueueTime,
            requestId: event.requestId,
            nodeId: event.nodeId,
          }];
        }

        return [{
          id: `evt_notif_end_${event.requestId}`,
          type: SimEventType.REQUEST_PROCESS_END,
          timestamp: event.timestamp + enqueueTime,
          requestId: event.requestId,
          nodeId: event.nodeId,
          metadata: { arrivalTime: event.timestamp },
        }];
      }

      case SimEventType.REQUEST_PROCESS_END: {
        this.state.activeRequests = Math.max(0, this.state.activeRequests - 1);
        this.notificationQueue = Math.max(0, this.notificationQueue - 1);
        this.state.queueDepth = this.notificationQueue;
        this.state.totalProcessed++;

        const arrivalTime = (event.metadata?.arrivalTime as number | undefined) ?? event.timestamp;
        this.state.completedLatencies.push(event.timestamp - arrivalTime);
        this.updateUtilization();

        return this.routeToDownstream(event.requestId, event.timestamp);
      }

      case SimEventType.REQUEST_FAIL: {
        this.state.activeRequests = Math.max(0, this.state.activeRequests - 1);
        this.notificationQueue = Math.max(0, this.notificationQueue - 1);
        this.state.queueDepth = this.notificationQueue;
        this.state.totalFailed++;
        this.updateUtilization();
        return [];
      }

      default:
        return [];
    }
  }
}
