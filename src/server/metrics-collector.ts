/**
 * Metrics collection for monitoring and analysis
 */
import { Logger } from '../logging/index.js';

export interface MetricEvent {
  type: string;
  tool?: string;
  timestamp: number;
  duration?: number;
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface Metrics {
  requests: {
    total: number;
    success: number;
    failed: number;
    avgDuration: number;
  };
  tools: Record<
    string,
    {
      total: number;
      success: number;
      failed: number;
      avgDuration: number;
      errors: Record<string, number>;
    }
  >;
}

export class MetricsCollector {
  private events: MetricEvent[] = [];
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance().child({ component: 'MetricsCollector' });
  }

  recordSuccess(event: MetricEvent): void {
    const timestamp = event.timestamp || Date.now();
    const enrichedEvent = {
      ...event,
      success: true,
      timestamp,
      context: {
        operation: event.type,
        tool: event.tool,
        duration: event.duration,
        recordedAt: timestamp,
      },
    };

    this.events.push(enrichedEvent);
    this.logger.debug('Success metric recorded', {
      event: enrichedEvent,
      metrics: this.calculateCurrentMetrics(event.tool),
    });
  }

  recordError(event: MetricEvent): void {
    const timestamp = event.timestamp || Date.now();
    const enrichedEvent = {
      ...event,
      success: false,
      timestamp,
      context: {
        operation: event.type,
        tool: event.tool,
        duration: event.duration,
        error: event.error,
        errorType: event.error ? this.categorizeError(event.error) : 'unknown',
        recordedAt: timestamp,
      },
    };

    this.events.push(enrichedEvent);
    this.logger.warn('Error metric recorded', {
      event: enrichedEvent,
      metrics: this.calculateCurrentMetrics(event.tool),
      errorRate: this.calculateErrorRate(event.tool),
    });
  }

  private categorizeError(error: string): string {
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('validation')) return 'validation';
    if (error.includes('permission')) return 'permission';
    if (error.includes('not found')) return 'notFound';
    return 'other';
  }

  private calculateErrorRate(tool?: string): number {
    const now = Date.now();
    const recentEvents = this.events.filter(
      e => now - e.timestamp < 3600000 && (!tool || e.tool === tool)
    );

    if (recentEvents.length === 0) return 0;

    const failedCount = recentEvents.filter(e => !e.success).length;
    return Number((failedCount / recentEvents.length).toFixed(4));
  }

  private calculateCurrentMetrics(tool?: string): Record<string, unknown> {
    const now = Date.now();
    const recentEvents = this.events.filter(
      e => now - e.timestamp < 3600000 && (!tool || e.tool === tool)
    );

    return {
      total: recentEvents.length,
      success: recentEvents.filter(e => e.success).length,
      failed: recentEvents.filter(e => !e.success).length,
      avgDuration: this.calculateAvgDuration(recentEvents),
      lastHour: {
        total: recentEvents.length,
        errorRate: this.calculateErrorRate(tool),
      },
    };
  }

  getMetrics(): Metrics {
    const now = Date.now();
    const recentEvents = this.events.filter(e => now - e.timestamp < 3600000); // Last hour

    const metrics: Metrics = {
      requests: {
        total: recentEvents.length,
        success: recentEvents.filter(e => e.success).length,
        failed: recentEvents.filter(e => !e.success).length,
        avgDuration: this.calculateAvgDuration(recentEvents),
      },
      tools: {},
    };

    // Calculate per-tool metrics
    const toolEvents = recentEvents.filter(e => e.tool);
    const tools = new Set(toolEvents.map(e => e.tool!));

    for (const tool of tools) {
      const toolMetrics = toolEvents.filter(e => e.tool === tool);
      metrics.tools[tool] = {
        total: toolMetrics.length,
        success: toolMetrics.filter(e => e.success).length,
        failed: toolMetrics.filter(e => !e.success).length,
        avgDuration: this.calculateAvgDuration(toolMetrics),
        errors: this.calculateErrorFrequency(toolMetrics),
      };
    }

    return metrics;
  }

  private calculateAvgDuration(events: MetricEvent[]): number {
    const eventsWithDuration = events.filter(e => e.duration);
    if (eventsWithDuration.length === 0) return 0;

    const total = eventsWithDuration.reduce((sum, e) => sum + (e.duration || 0), 0);
    return total / eventsWithDuration.length;
  }

  private calculateErrorFrequency(events: MetricEvent[]): Record<string, number> {
    const errors: Record<string, number> = {};

    for (const event of events) {
      if (!event.success && event.error) {
        errors[event.error] = (errors[event.error] || 0) + 1;
      }
    }

    return errors;
  }

  clearMetrics(): void {
    const metrics = this.getMetrics();
    this.events = [];
    this.logger.info('Metrics cleared', {
      context: {
        operation: 'clearMetrics',
        timestamp: Date.now(),
        previousMetrics: metrics,
      },
    });
  }
}
