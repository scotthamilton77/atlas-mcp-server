/**
 * Rate limiter for request throttling
 */
import { Logger } from '../logging/index.js';

export class RateLimiter {
  private requests: number[] = [];
  private readonly windowMs = 60000; // 1 minute window
  private logger: Logger;
  private lastWarningTime: number = 0;
  private readonly warningThreshold = 0.8; // Warn at 80% capacity
  private readonly warningIntervalMs = 5000; // Minimum time between warnings

  constructor(private readonly maxRequests: number) {
    this.logger = Logger.getInstance().child({
      component: 'RateLimiter',
      context: {
        maxRequests,
        windowMs: this.windowMs,
        warningThreshold: this.warningThreshold,
      },
    });

    this.logger.info('Rate limiter initialized', {
      config: {
        maxRequests,
        windowMs: this.windowMs,
        warningThreshold: this.warningThreshold,
      },
      context: {
        operation: 'initialize',
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Checks if request is within rate limit
   * @throws Error if rate limit exceeded
   */
  async checkLimit(): Promise<void> {
    const now = Date.now();
    const oldCount = this.requests.length;
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    // Log if significant request cleanup occurred
    if (oldCount - this.requests.length > 100) {
      this.logger.debug('Cleaned expired requests', {
        removed: oldCount - this.requests.length,
        remaining: this.requests.length,
        context: {
          operation: 'cleanup',
          timestamp: now,
        },
      });
    }

    // Check for rate limit
    if (this.requests.length >= this.maxRequests) {
      this.logger.warn('Rate limit exceeded', {
        current: this.requests.length,
        limit: this.maxRequests,
        oldestRequest: Math.min(...this.requests),
        newestRequest: Math.max(...this.requests),
        context: {
          operation: 'checkLimit',
          timestamp: now,
          exceeded: true,
        },
      });
      throw new Error('Rate limit exceeded');
    }

    // Add new request
    this.requests.push(now);

    // Check warning threshold
    const utilizationRate = this.requests.length / this.maxRequests;
    if (
      utilizationRate >= this.warningThreshold &&
      now - this.lastWarningTime >= this.warningIntervalMs
    ) {
      this.lastWarningTime = now;
      this.logger.warn('High request rate detected', {
        current: this.requests.length,
        limit: this.maxRequests,
        utilizationRate: utilizationRate.toFixed(2),
        timeToLimit: this.maxRequests - this.requests.length,
        context: {
          operation: 'checkLimit',
          timestamp: now,
          warning: true,
        },
      });
    }

    // Log periodic status at debug level
    if (this.requests.length % 100 === 0) {
      this.logger.debug('Request rate status', {
        current: this.requests.length,
        limit: this.maxRequests,
        utilizationRate: utilizationRate.toFixed(2),
        context: {
          operation: 'checkLimit',
          timestamp: now,
        },
      });
    }
  }

  /**
   * Gets current rate limiter status
   */
  getStatus(): { current: number; limit: number; windowMs: number } {
    const now = Date.now();
    const oldCount = this.requests.length;
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    const status = {
      current: this.requests.length,
      limit: this.maxRequests,
      windowMs: this.windowMs,
    };

    // Log status with additional metrics
    this.logger.debug('Rate limiter status retrieved', {
      status,
      metrics: {
        utilizationRate: (this.requests.length / this.maxRequests).toFixed(2),
        requestsCleared: oldCount - this.requests.length,
        oldestRequest: this.requests.length > 0 ? Math.min(...this.requests) : undefined,
        newestRequest: this.requests.length > 0 ? Math.max(...this.requests) : undefined,
      },
      context: {
        operation: 'getStatus',
        timestamp: now,
      },
    });

    return status;
  }

  /**
   * Resets rate limiter
   */
  reset(): void {
    const oldCount = this.requests.length;
    this.requests = [];

    this.logger.info('Rate limiter reset', {
      clearedRequests: oldCount,
      context: {
        operation: 'reset',
        timestamp: Date.now(),
      },
    });
  }
}
