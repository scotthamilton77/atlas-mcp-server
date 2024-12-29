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
    this.events.push({
      ...event,
      success: true,
      timestamp: event.timestamp || Date.now(),
    });
    this.logger.debug('Recorded success metric', { event });
  }

  recordError(event: MetricEvent): void {
    this.events.push({
      ...event,
      success: false,
      timestamp: event.timestamp || Date.now(),
    });
    this.logger.debug('Recorded error metric', { event });
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
    this.events = [];
    this.logger.debug('Cleared metrics');
  }
}
