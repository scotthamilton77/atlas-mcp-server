/**
 * Request tracer for tracking request lifecycle and debugging
 */

import { generateShortId } from '../utils/id-generator.js';

interface TraceEvent {
    id: string;
    type: 'start' | 'end' | 'error';
    timestamp: number;
    duration?: number;
    error?: unknown;
    metadata?: Record<string, unknown>;
}

interface RequestTrace {
    id: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    events: TraceEvent[];
    error?: unknown;
    metadata: Record<string, unknown>;
}

export class RequestTracer {
    private traces: Map<string, RequestTrace> = new Map();
    private readonly maxTraces = 1000;
    private readonly traceTTL = 3600000; // 1 hour

    constructor() {
        // Clean up old traces periodically
        setInterval(() => this.cleanup(), 60000); // Every minute
    }

    /**
     * Starts tracing a new request
     */
    startRequest(metadata: Record<string, unknown> = {}): string {
        const id = generateShortId();
        const startTime = Date.now();

        const trace: RequestTrace = {
            id,
            startTime,
            events: [{
                id: generateShortId(),
                type: 'start',
                timestamp: startTime,
                metadata
            }],
            metadata
        };

        this.traces.set(id, trace);
        return id;
    }

    /**
     * Ends tracing for a request
     */
    endRequest(id: string, metadata: Record<string, unknown> = {}): void {
        const trace = this.traces.get(id);
        if (!trace) return;

        const endTime = Date.now();
        trace.endTime = endTime;
        trace.duration = endTime - trace.startTime;
        trace.metadata = { ...trace.metadata, ...metadata };

        trace.events.push({
            id: generateShortId(),
            type: 'end',
            timestamp: endTime,
            duration: trace.duration,
            metadata
        });
    }

    /**
     * Records an error for a request
     */
    recordError(id: string, error: unknown, metadata: Record<string, unknown> = {}): void {
        const trace = this.traces.get(id);
        if (!trace) return;

        trace.error = error;
        trace.metadata = { ...trace.metadata, ...metadata };

        trace.events.push({
            id: generateShortId(),
            type: 'error',
            timestamp: Date.now(),
            error,
            metadata
        });
    }

    /**
     * Gets trace for a request
     */
    getTrace(id: string): RequestTrace | undefined {
        return this.traces.get(id);
    }

    /**
     * Gets all traces within a time range
     */
    getTraces(startTime: number, endTime: number): RequestTrace[] {
        return Array.from(this.traces.values())
            .filter(trace => 
                trace.startTime >= startTime && 
                (trace.endTime || trace.startTime) <= endTime
            );
    }

    /**
     * Gets traces with errors
     */
    getErrorTraces(): RequestTrace[] {
        return Array.from(this.traces.values())
            .filter(trace => trace.error !== undefined);
    }

    /**
     * Gets trace summary
     */
    getTraceSummary(): {
        total: number;
        active: number;
        completed: number;
        errors: number;
        avgDuration: number;
    } {
        const traces = Array.from(this.traces.values());
        const completed = traces.filter(t => t.endTime !== undefined);
        const errors = traces.filter(t => t.error !== undefined);

        const totalDuration = completed.reduce((sum, t) => sum + (t.duration || 0), 0);
        const avgDuration = completed.length > 0 ? totalDuration / completed.length : 0;

        return {
            total: traces.length,
            active: traces.length - completed.length,
            completed: completed.length,
            errors: errors.length,
            avgDuration
        };
    }

    /**
     * Cleans up old traces
     */
    private cleanup(): void {
        const now = Date.now();
        const cutoff = now - this.traceTTL;

        // Remove old traces
        for (const [id, trace] of this.traces) {
            if (trace.startTime < cutoff) {
                this.traces.delete(id);
            }
        }

        // If still over limit, remove oldest traces
        if (this.traces.size > this.maxTraces) {
            const sorted = Array.from(this.traces.entries())
                .sort(([, a], [, b]) => a.startTime - b.startTime);

            const toRemove = sorted.slice(0, this.traces.size - this.maxTraces);
            for (const [id] of toRemove) {
                this.traces.delete(id);
            }
        }
    }

    /**
     * Gets active traces
     */
    getActiveTraces(): RequestTrace[] {
        return Array.from(this.traces.values())
            .filter(trace => trace.endTime === undefined);
    }

    /**
     * Gets completed traces
     */
    getCompletedTraces(): RequestTrace[] {
        return Array.from(this.traces.values())
            .filter(trace => trace.endTime !== undefined);
    }

    /**
     * Gets trace count
     */
    getTraceCount(): number {
        return this.traces.size;
    }

    /**
     * Clears all traces
     */
    clear(): void {
        this.traces.clear();
    }
}
