import { SimEventType, type SimEvent, type PaymentGatewayNodeProps } from '@system-vis/shared';
import { ComponentModel, sampleNormal } from '../component-model.js';

export class PaymentGatewayModel extends ComponentModel {
  private successRate = 0.98; // 2% transaction failure rate

  handleEvent(event: SimEvent): SimEvent[] {
    switch (event.type) {
      case SimEventType.REQUEST_ARRIVE:
      case SimEventType.REQUEST_ROUTE: {
        const config = this.config as PaymentGatewayNodeProps;
        const totalCapacity = config.instances * config.maxConcurrentRequests;

        if (this.state.activeRequests >= totalCapacity) {
          this.state.totalFailed++;
          return [];
        }

        this.state.activeRequests++;
        this.updateUtilization();

        const mean = Math.max(1, config.transactionLatencyMs ?? config.baseLatencyMs);
        const transactionTime = sampleNormal(mean, config.latencyStdDevMs);

        // Model provider outcomes + generic failureRate.
        const providerSuccess = Math.random() < this.successRate;
        const failedByConfig = this.shouldFail();

        if (!providerSuccess || failedByConfig) {
          const transientRetry = !providerSuccess && Math.random() < 0.5;
          return [{
            id: `evt_payment_fail_${event.requestId}`,
            type: SimEventType.REQUEST_FAIL,
            timestamp: event.timestamp + transactionTime,
            requestId: event.requestId,
            nodeId: event.nodeId,
            metadata: { transientRetry },
          }];
        }

        return [{
          id: `evt_payment_end_${event.requestId}`,
          type: SimEventType.REQUEST_PROCESS_END,
          timestamp: event.timestamp + transactionTime,
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
