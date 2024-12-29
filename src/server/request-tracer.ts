/**
 * Request tracing for monitoring and debugging with memory management
 */
import { Logger } from '../logging/index.js';

export interface TracerConfig {
  maxTraces?: number; // Maximum number of traces to store
  maxEventsPerTrace?: number; // Maximum events per trace
  traceRetentionMs?: number; // How long to keep traces
  cleanupIntervalMs?: number; // How often to run cleanup
}

const DEFAULT_CONFIG: TracerConfig = {
  maxTraces: 1000,
  maxEventsPerTrace: 100,
  traceRetentionMs: 24 * 60 * 60 * 1000, // 24 hours
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
};

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
  private config: TracerConfig;
  private cleanupTimer!: NodeJS.Timeout;

  constructor(config: TracerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = Logger.getInstance().child({ component: 'RequestTracer' });

    // Start cleanup timer
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      this.config.cleanupIntervalMs ?? DEFAULT_CONFIG.cleanupIntervalMs!
    ) as unknown as NodeJS.Timeout;

    // Bind cleanup to process events
    process.on('SIGINT', () => this.destroy());
    process.on('SIGTERM', () => this.destroy());
  }

  /**
   * Cleanup old traces and enforce size limits
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - (this.config.traceRetentionMs ?? DEFAULT_CONFIG.traceRetentionMs!);

    // Remove old traces
    for (const [requestId, _] of this.traces.entries()) {
      const startTime = this.startTimes.get(requestId);
      if (startTime && startTime < cutoff) {
        this.traces.delete(requestId);
        this.startTimes.delete(requestId);
        this.logger.debug('Cleaned up old trace', { requestId, age: now - startTime });
      }
    }

    // Enforce maximum traces limit
    const maxTraces = this.config.maxTraces ?? DEFAULT_CONFIG.maxTraces!;
    if (this.traces.size > maxTraces) {
      const sortedTraces = Array.from(this.startTimes.entries()).sort(([, a], [, b]) => b - a);

      const tracesToRemove = sortedTraces.slice(maxTraces);
      for (const [requestId] of tracesToRemove) {
        this.traces.delete(requestId);
        this.startTimes.delete(requestId);
        this.logger.debug('Removed excess trace', { requestId });
      }
    }
  }

  startTrace(requestId: string, event: TraceEvent): void {
    // Cleanup if we're at the limit
    if (this.traces.size >= (this.config.maxTraces ?? DEFAULT_CONFIG.maxTraces!)) {
      this.cleanup();
    }

    this.traces.set(requestId, [event]);
    this.startTimes.set(requestId, event.timestamp);
    this.logger.debug('Started trace', { requestId, event });
  }

  addEvent(requestId: string, event: TraceEvent): void {
    const events = this.traces.get(requestId) || [];

    // Enforce maximum events per trace
    const maxEvents = this.config.maxEventsPerTrace ?? DEFAULT_CONFIG.maxEventsPerTrace!;
    if (events.length >= maxEvents) {
      this.logger.warn('Maximum events per trace reached', {
        requestId,
        limit: maxEvents,
      });
      return;
    }

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
    this.logger.debug('Cleared trace', { requestId });
  }

  /**
   * Get memory usage statistics
   */
  getStats(): {
    traceCount: number;
    totalEvents: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    let totalEvents = 0;
    for (const events of this.traces.values()) {
      totalEvents += events.length;
    }

    return {
      traceCount: this.traces.size,
      totalEvents,
      memoryUsage: process.memoryUsage(),
    };
  }

  /**
   * Cleanup resources and stop timers
   */
  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.traces.clear();
    this.startTimes.clear();
    this.logger.info('Request tracer destroyed');
  }
}
