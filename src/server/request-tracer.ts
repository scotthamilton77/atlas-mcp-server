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
    this.logger = Logger.getInstance().child({
      component: 'RequestTracer',
      context: {
        maxTraces: this.config.maxTraces,
        maxEventsPerTrace: this.config.maxEventsPerTrace,
        retentionMs: this.config.traceRetentionMs,
      },
    });

    // Start cleanup timer
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      this.config.cleanupIntervalMs ?? DEFAULT_CONFIG.cleanupIntervalMs!
    ) as unknown as NodeJS.Timeout;

    // Bind cleanup to process events
    process.on('SIGINT', () => this.destroy());
    process.on('SIGTERM', () => this.destroy());

    this.logger.info('Request tracer initialized', {
      config: this.config,
      context: {
        operation: 'initialize',
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Cleanup old traces and enforce size limits
   */
  private cleanup(): void {
    const cleanupStart = Date.now();
    const cutoff =
      cleanupStart - (this.config.traceRetentionMs ?? DEFAULT_CONFIG.traceRetentionMs!);
    let removedCount = 0;
    let removedEvents = 0;

    // Remove old traces
    for (const [requestId, events] of this.traces.entries()) {
      const startTime = this.startTimes.get(requestId);
      if (startTime && startTime < cutoff) {
        removedEvents += events.length;
        removedCount++;
        this.traces.delete(requestId);
        this.startTimes.delete(requestId);
      }
    }

    // Enforce maximum traces limit
    const maxTraces = this.config.maxTraces ?? DEFAULT_CONFIG.maxTraces!;
    if (this.traces.size > maxTraces) {
      const sortedTraces = Array.from(this.startTimes.entries()).sort(([, a], [, b]) => b - a);
      const tracesToRemove = sortedTraces.slice(maxTraces);

      for (const [requestId] of tracesToRemove) {
        const events = this.traces.get(requestId) || [];
        removedEvents += events.length;
        removedCount++;
        this.traces.delete(requestId);
        this.startTimes.delete(requestId);
      }
    }

    if (removedCount > 0) {
      this.logger.info('Traces cleaned up', {
        removedTraces: removedCount,
        removedEvents,
        remainingTraces: this.traces.size,
        duration: Date.now() - cleanupStart,
        context: {
          operation: 'cleanup',
          timestamp: cleanupStart,
          cutoff,
        },
      });
    }
  }

  startTrace(requestId: string, event: TraceEvent): void {
    // Cleanup if we're at the limit
    if (this.traces.size >= (this.config.maxTraces ?? DEFAULT_CONFIG.maxTraces!)) {
      this.cleanup();
    }

    const enrichedEvent = {
      ...event,
      context: {
        operation: 'startTrace',
        requestId,
        timestamp: event.timestamp,
        tool: event.tool,
        traceSize: this.traces.size,
      },
    };

    this.traces.set(requestId, [enrichedEvent]);
    this.startTimes.set(requestId, event.timestamp);

    this.logger.debug('Trace started', {
      requestId,
      event: enrichedEvent,
      stats: {
        activeTraces: this.traces.size,
        memoryUsage: process.memoryUsage().heapUsed,
      },
    });
  }

  addEvent(requestId: string, event: TraceEvent): void {
    const events = this.traces.get(requestId) || [];
    const startTime = this.startTimes.get(requestId);

    // Enforce maximum events per trace
    const maxEvents = this.config.maxEventsPerTrace ?? DEFAULT_CONFIG.maxEventsPerTrace!;
    if (events.length >= maxEvents) {
      this.logger.warn('Maximum events per trace reached', {
        requestId,
        limit: maxEvents,
        context: {
          operation: 'addEvent',
          timestamp: event.timestamp,
          eventCount: events.length,
          traceDuration: startTime ? event.timestamp - startTime : undefined,
        },
      });
      return;
    }

    const enrichedEvent = {
      ...event,
      context: {
        operation: 'addEvent',
        requestId,
        timestamp: event.timestamp,
        tool: event.tool,
        eventIndex: events.length,
        traceDuration: startTime ? event.timestamp - startTime : undefined,
      },
    };

    events.push(enrichedEvent);
    this.traces.set(requestId, events);

    this.logger.debug('Event added to trace', {
      requestId,
      event: enrichedEvent,
      stats: {
        eventCount: events.length,
        traceDuration: startTime ? event.timestamp - startTime : undefined,
      },
    });
  }

  endTrace(requestId: string, event: TraceEvent): void {
    const events = this.traces.get(requestId) || [];
    const startTime = this.startTimes.get(requestId);
    const duration = startTime ? event.timestamp - startTime : undefined;

    const enrichedEvent = {
      ...event,
      duration,
      context: {
        operation: 'endTrace',
        requestId,
        timestamp: event.timestamp,
        tool: event.tool,
        eventCount: events.length + 1,
        traceDuration: duration,
        success: event.success,
        error: event.error,
      },
    };

    events.push(enrichedEvent);
    this.traces.set(requestId, events);

    const logLevel = event.error ? 'warn' : 'info';
    this.logger[logLevel]('Trace completed', {
      requestId,
      event: enrichedEvent,
      stats: {
        eventCount: events.length,
        duration,
        success: event.success,
        error: event.error,
      },
    });
  }

  getTrace(requestId: string): TraceEvent[] {
    return this.traces.get(requestId) || [];
  }

  getStartTime(requestId: string): number | undefined {
    return this.startTimes.get(requestId);
  }

  clearTrace(requestId: string): void {
    const events = this.traces.get(requestId);
    const startTime = this.startTimes.get(requestId);

    this.traces.delete(requestId);
    this.startTimes.delete(requestId);

    this.logger.debug('Trace cleared', {
      requestId,
      stats: {
        eventCount: events?.length || 0,
        duration: startTime ? Date.now() - startTime : undefined,
      },
    });
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

    const stats = {
      traceCount: this.traces.size,
      totalEvents,
      memoryUsage: process.memoryUsage(),
    };

    this.logger.debug('Stats retrieved', {
      stats,
      context: {
        operation: 'getStats',
        timestamp: Date.now(),
      },
    });

    return stats;
  }

  /**
   * Cleanup resources and stop timers
   */
  destroy(): void {
    const stats = this.getStats();
    clearInterval(this.cleanupTimer);
    this.traces.clear();
    this.startTimes.clear();

    this.logger.info('Request tracer destroyed', {
      stats,
      context: {
        operation: 'destroy',
        timestamp: Date.now(),
      },
    });
  }
}
