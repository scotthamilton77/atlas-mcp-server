/**
 * Storage metrics collection and monitoring
 */
import { Logger } from '../../logging/index.js';
import { EventManager } from '../../events/event-manager.js';
import { EventTypes } from '../../types/events.js';
import { MonitoringMetrics } from '../../types/storage.js';

export interface MetricsCollectorOptions {
  checkInterval?: number;
  errorThreshold?: number;
  responseTimeThreshold?: number;
  metricsInterval?: number;
}

export class MetricsCollector {
  private readonly logger: Logger;
  private readonly eventManager: EventManager;
  private readonly options: Required<MetricsCollectorOptions>;
  private metricsInterval: NodeJS.Timeout | null = null;
  private readonly DEFAULT_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly DEFAULT_ERROR_THRESHOLD = 5;
  private readonly DEFAULT_RESPONSE_TIME_THRESHOLD = 1000; // 1 second
  private readonly DEFAULT_METRICS_INTERVAL = 60000; // 1 minute

  private totalQueries = 0;
  private errorCount = 0;
  private totalResponseTime = 0;
  private slowQueries = 0;

  constructor(options: MetricsCollectorOptions = {}) {
    this.logger = Logger.getInstance().child({ component: 'MetricsCollector' });
    this.eventManager = EventManager.getInstance();
    this.options = {
      checkInterval: options.checkInterval || this.DEFAULT_CHECK_INTERVAL,
      errorThreshold: options.errorThreshold || this.DEFAULT_ERROR_THRESHOLD,
      responseTimeThreshold: options.responseTimeThreshold || this.DEFAULT_RESPONSE_TIME_THRESHOLD,
      metricsInterval: options.metricsInterval || this.DEFAULT_METRICS_INTERVAL,
    };
  }

  /**
   * Start metrics collection
   */
  start(): void {
    if (this.metricsInterval) {
      return;
    }

    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, this.options.metricsInterval);

    // Ensure the interval doesn't prevent the process from exiting
    this.metricsInterval.unref();

    this.logger.info('Metrics collection started', {
      interval: this.options.metricsInterval,
    });
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    this.logger.info('Metrics collection stopped');
  }

  /**
   * Record query execution
   */
  recordQuery(duration: number, error?: Error): void {
    this.totalQueries++;
    if (error) {
      this.errorCount++;
    }
    this.totalResponseTime += duration;
    if (duration > this.options.responseTimeThreshold) {
      this.slowQueries++;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): MonitoringMetrics {
    const memoryUsage = process.memoryUsage();
    return {
      cache: {
        hits: 0, // Populated by storage implementation
        misses: 0,
        size: 0,
        maxSize: 0,
        hitRate: 0,
        evictions: 0,
        memoryUsage: memoryUsage.heapUsed,
      },
      connections: {
        total: 0, // Populated by connection pool
        active: 0,
        idle: 0,
        errors: this.errorCount,
        avgResponseTime: this.totalQueries > 0 ? this.totalResponseTime / this.totalQueries : 0,
      },
      queries: {
        total: this.totalQueries,
        errors: this.errorCount,
        avgExecutionTime: this.totalQueries > 0 ? this.totalResponseTime / this.totalQueries : 0,
        slowQueries: this.slowQueries,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Reset metrics counters
   */
  reset(): void {
    this.totalQueries = 0;
    this.errorCount = 0;
    this.totalResponseTime = 0;
    this.slowQueries = 0;
  }

  /**
   * Collect and emit metrics
   */
  private collectMetrics(): void {
    const metrics = this.getMetrics();

    // Emit metrics event
    this.eventManager.emitSystemEvent({
      type: EventTypes.SYSTEM_STARTUP,
      timestamp: Date.now(),
      metadata: {
        component: 'MetricsCollector',
        memoryUsage: process.memoryUsage(),
        metrics,
      },
    });

    // Log metrics summary
    this.logger.info('Storage metrics collected', {
      queries: metrics.queries,
      connections: metrics.connections,
      cache: metrics.cache,
    });

    // Check for concerning metrics
    if (metrics.queries.errors > this.options.errorThreshold) {
      this.logger.warn('High error rate detected', {
        errors: metrics.queries.errors,
        threshold: this.options.errorThreshold,
      });
    }

    if (metrics.queries.slowQueries > 0) {
      this.logger.warn('Slow queries detected', {
        count: metrics.queries.slowQueries,
        avgTime: metrics.queries.avgExecutionTime,
      });
    }

    // Reset counters after collection
    this.reset();
  }
}
