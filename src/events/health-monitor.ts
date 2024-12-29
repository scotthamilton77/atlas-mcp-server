import { EventTypes, EventHandler, AtlasEvent } from '../types/events.js';
import { Logger } from '../logging/index.js';

interface HandlerStats {
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  lastExecuted?: number;
  consecutiveFailures: number;
  isCircuitOpen: boolean;
  nextRetryTime?: number;
}

export class EventHealthMonitor {
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 5; // consecutive failures
  private static readonly CIRCUIT_RESET_TIMEOUT = 30000; // 30 seconds
  private static readonly RESPONSE_TIME_THRESHOLD = 1000; // 1 second
  private static readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute

  private readonly handlerStats = new Map<string, HandlerStats>();
  private logger?: Logger;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    try {
      this.logger = Logger.getInstance().child({ component: 'EventHealthMonitor' });
    } catch {
      // Logger not initialized yet, which is fine
    }
    this.startHealthCheck();
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      this.checkHandlerHealth();
    }, EventHealthMonitor.HEALTH_CHECK_INTERVAL);

    // Ensure cleanup on process exit
    process.on('beforeExit', () => {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
    });
  }

  private checkHandlerHealth(): void {
    const now = Date.now();
    for (const [handlerId, stats] of this.handlerStats.entries()) {
      // Check for stale handlers
      if (stats.lastExecuted && now - stats.lastExecuted > 24 * 60 * 60 * 1000) {
        this.handlerStats.delete(handlerId);
        continue;
      }

      // Check for slow handlers
      if (stats.avgResponseTime > EventHealthMonitor.RESPONSE_TIME_THRESHOLD) {
        this.logger?.warn('Slow event handler detected', {
          handlerId,
          avgResponseTime: stats.avgResponseTime,
          threshold: EventHealthMonitor.RESPONSE_TIME_THRESHOLD,
        });
      }

      // Check circuit breaker status
      if (stats.isCircuitOpen && stats.nextRetryTime && now >= stats.nextRetryTime) {
        stats.isCircuitOpen = false;
        stats.consecutiveFailures = 0;
        this.logger?.info('Circuit breaker reset', { handlerId });
      }
    }
  }

  wrapHandler<T extends AtlasEvent>(
    _eventType: EventTypes | '*', // Prefix with underscore to indicate intentionally unused
    handler: EventHandler<T>,
    handlerId: string
  ): EventHandler<T> {
    // Initialize stats if not exists
    if (!this.handlerStats.has(handlerId)) {
      this.handlerStats.set(handlerId, {
        successCount: 0,
        errorCount: 0,
        avgResponseTime: 0,
        consecutiveFailures: 0,
        isCircuitOpen: false,
      });
    }

    return async (event: T) => {
      const stats = this.handlerStats.get(handlerId)!;

      // Check circuit breaker
      if (stats.isCircuitOpen) {
        if (!stats.nextRetryTime || Date.now() < stats.nextRetryTime) {
          throw new Error(`Circuit breaker open for handler: ${handlerId}`);
        }
        // Reset circuit breaker for retry
        stats.isCircuitOpen = false;
        stats.consecutiveFailures = 0;
      }

      const startTime = Date.now();
      try {
        await handler(event);

        // Update success stats
        stats.successCount++;
        stats.consecutiveFailures = 0;
        stats.lastExecuted = Date.now();

        // Update response time with exponential moving average
        const executionTime = Date.now() - startTime;
        stats.avgResponseTime = stats.avgResponseTime * 0.8 + executionTime * 0.2;

        this.handlerStats.set(handlerId, stats);
      } catch (error) {
        // Update error stats
        stats.errorCount++;
        stats.consecutiveFailures++;
        stats.lastExecuted = Date.now();

        // Check if circuit breaker should open
        if (stats.consecutiveFailures >= EventHealthMonitor.CIRCUIT_BREAKER_THRESHOLD) {
          stats.isCircuitOpen = true;
          stats.nextRetryTime = Date.now() + EventHealthMonitor.CIRCUIT_RESET_TIMEOUT;

          this.logger?.error('Circuit breaker opened', {
            handlerId,
            consecutiveFailures: stats.consecutiveFailures,
            nextRetryTime: new Date(stats.nextRetryTime).toISOString(),
          });
        }

        this.handlerStats.set(handlerId, stats);
        throw error;
      }
    };
  }

  getHandlerStats(handlerId: string): HandlerStats | undefined {
    return this.handlerStats.get(handlerId);
  }

  getAllHandlerStats(): Map<string, HandlerStats> {
    return new Map(this.handlerStats);
  }

  resetCircuitBreaker(handlerId: string): void {
    const stats = this.handlerStats.get(handlerId);
    if (stats) {
      stats.isCircuitOpen = false;
      stats.consecutiveFailures = 0;
      stats.nextRetryTime = undefined;
      this.handlerStats.set(handlerId, stats);

      this.logger?.info('Circuit breaker manually reset', { handlerId });
    }
  }

  cleanup(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.handlerStats.clear();
  }
}
