/**
 * Request tracing for monitoring and debugging
 */
import { Logger } from '../logging/index.js';

export interface TraceEvent {
    type: string;
    tool?: string;
    timestamp: number;
    success?: boolean;
    error?: string;
    duration?: number;
    [key: string]: unknown;
}

export class RequestTracer {
    private traces: Map<string, TraceEvent[]> = new Map();
    private startTimes: Map<string, number> = new Map();
    private logger: Logger;

    constructor() {
        this.logger = Logger.getInstance().child({ component: 'RequestTracer' });
    }

    startTrace(requestId: string, event: TraceEvent): void {
        this.traces.set(requestId, [event]);
        this.startTimes.set(requestId, event.timestamp);
        this.logger.debug('Started trace', { requestId, event });
    }

    addEvent(requestId: string, event: TraceEvent): void {
        const events = this.traces.get(requestId) || [];
        events.push(event);
        this.traces.set(requestId, events);
        this.logger.debug('Added trace event', { requestId, event });
    }

    endTrace(requestId: string, event: TraceEvent): void {
        const events = this.traces.get(requestId) || [];
        const startTime = this.startTimes.get(requestId);
        
        if (startTime) {
            event.duration = event.timestamp - startTime;
        }
        
        events.push(event);
        this.traces.set(requestId, events);
        this.logger.debug('Ended trace', { requestId, event });
    }

    getTrace(requestId: string): TraceEvent[] {
        return this.traces.get(requestId) || [];
    }

    getStartTime(requestId: string): number | undefined {
        return this.startTimes.get(requestId);
    }

    clearTrace(requestId: string): void {
        this.traces.delete(requestId);
        this.startTimes.delete(requestId);
    }
}
