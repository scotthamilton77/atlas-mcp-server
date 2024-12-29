/**
 * Health monitoring for system components
 */
import { Logger } from '../logging/index.js';
import { StorageMetrics } from '../types/storage.js';
import { Metrics } from './metrics-collector.js';
import { TaskStatus } from '../types/task.js';

export interface HealthConfig {
  checkInterval?: number; // How often to run health checks (ms)
  failureThreshold?: number; // How many consecutive failures before shutdown
  shutdownGracePeriod?: number; // How long to wait before force shutdown (ms)
  clientPingTimeout?: number; // How long to wait for client ping (ms)
}

export interface HealthStatus {
  healthy: boolean;
  components: {
    storage: boolean;
    rateLimiter: boolean;
    metrics: boolean;
    clientConnected: boolean;
  };
  details?: Record<string, unknown>;
  timestamp: number;
  consecutiveFailures?: number;
  [key: string]: unknown;
}

export interface ComponentStatus {
  storage: StorageMetrics;
  rateLimiter: {
    current: number;
    limit: number;
    windowMs: number;
  };
  metrics: Metrics;
}

export class HealthMonitor {
  private logger: Logger;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastClientPing: number = Date.now();
  private consecutiveFailures: number = 0;
  private readonly config: Required<HealthConfig>;
  private shutdownCallback?: () => Promise<void>;

  constructor(config: HealthConfig = {}) {
    this.logger = Logger.getInstance().child({ component: 'HealthMonitor' });
    this.config = {
      checkInterval: config.checkInterval || 300000, // 5 minutes
      failureThreshold: config.failureThreshold || 5, // 5 strikes
      shutdownGracePeriod: config.shutdownGracePeriod || 10000, // 10 seconds
      clientPingTimeout: config.clientPingTimeout || 300000, // 5 minutes
    };
  }

  /**
   * Start periodic health monitoring
   */
  start(shutdownCallback: () => Promise<void>): void {
    this.shutdownCallback = shutdownCallback;
    this.checkInterval = setInterval(() => this.runHealthCheck(), this.config.checkInterval);
    this.logger.info('Health monitoring started', {
      interval: this.config.checkInterval,
      failureThreshold: this.config.failureThreshold,
    });
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.logger.info('Health monitoring stopped');
  }

  /**
   * Record a client ping
   */
  recordClientPing(): void {
    this.lastClientPing = Date.now();
    this.consecutiveFailures = 0; // Reset failures on successful ping
  }

  /**
   * Run a health check and handle failures
   */
  private async runHealthCheck(): Promise<void> {
    try {
      const status = await this.getCurrentStatus();
      const health = await this.check(status);

      if (!health.healthy) {
        this.consecutiveFailures++;
        this.logger.warn('Health check failed', {
          consecutiveFailures: this.consecutiveFailures,
          threshold: this.config.failureThreshold,
          details: health.details,
        });

        if (this.consecutiveFailures >= this.config.failureThreshold) {
          await this.initiateShutdown();
        }
      } else {
        this.consecutiveFailures = 0;
      }
    } catch (error) {
      this.logger.error('Health check error', { error });
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        await this.initiateShutdown();
      }
    }
  }

  /**
   * Get current status of all components
   */
  private async getCurrentStatus(): Promise<ComponentStatus> {
    return {
      storage: {
        tasks: {
          total: 0,
          byStatus: {
            [TaskStatus.PENDING]: 0,
            [TaskStatus.IN_PROGRESS]: 0,
            [TaskStatus.COMPLETED]: 0,
            [TaskStatus.FAILED]: 0,
            [TaskStatus.BLOCKED]: 0,
          },
          noteCount: 0,
          dependencyCount: 0,
        },
        storage: {
          totalSize: 0,
          pageSize: 4096,
          pageCount: 0,
          walSize: 0,
          cache: {
            hitRate: 0,
            memoryUsage: 0,
            entryCount: 0,
          },
        },
      },
      rateLimiter: { current: 0, limit: 100, windowMs: 60000 },
      metrics: {
        requests: {
          total: 0,
          success: 0,
          failed: 0,
          avgDuration: 0,
        },
        tools: {},
      },
    };
  }

  /**
   * Initiate graceful shutdown
   */
  private async initiateShutdown(): Promise<void> {
    this.logger.error('Initiating shutdown due to health check failures', {
      consecutiveFailures: this.consecutiveFailures,
    });

    if (this.shutdownCallback) {
      try {
        const shutdownTimeout = setTimeout(() => {
          this.logger.error('Force shutdown due to timeout');
          process.exit(1);
        }, this.config.shutdownGracePeriod);

        await this.shutdownCallback();
        clearTimeout(shutdownTimeout);
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }

  /**
   * Check system health
   */
  async check(status: ComponentStatus): Promise<HealthStatus> {
    const now = Date.now();
    const health: HealthStatus = {
      healthy: true,
      components: {
        storage: true,
        rateLimiter: true,
        metrics: true,
        clientConnected: true,
      },
      details: {},
      timestamp: now,
      consecutiveFailures: this.consecutiveFailures,
    };

    // Check client connectivity
    const timeSinceLastPing = now - this.lastClientPing;
    if (timeSinceLastPing > this.config.clientPingTimeout) {
      health.components.clientConnected = false;
      health.healthy = false;
      health.details!.client = `No ping received for ${Math.round(timeSinceLastPing / 1000)}s`;
    }

    try {
      try {
        // Check storage health with safe access
        const hasStorageMetrics = status.storage?.tasks && status.storage?.storage;
        if (!hasStorageMetrics) {
          health.components.storage = false;
          health.healthy = false;
          health.details!.storage = 'Storage metrics unavailable';
        }

        // Check rate limiter with safe defaults
        const rateLimiter = status.rateLimiter || { current: 0, limit: 100 };
        if (rateLimiter.current >= rateLimiter.limit) {
          health.components.rateLimiter = false;
          health.healthy = false;
          health.details!.rateLimiter = 'Rate limit reached';
        }

        // Check metrics with safe calculation
        const metrics = status.metrics?.requests || { failed: 0, total: 0 };
        const errorRate = metrics.total > 0 ? metrics.failed / metrics.total : 0;
        if (errorRate > 0.1) {
          // More than 10% error rate
          health.components.metrics = false;
          health.healthy = false;
          health.details!.metrics = `High error rate: ${(errorRate * 100).toFixed(2)}%`;
        }
      } catch (error) {
        // Log specific component check errors but continue
        this.logger.error('Component check error', { error });
        health.healthy = false;
        health.details!.error = error instanceof Error ? error.message : String(error);
      }

      this.logger.debug('Health check completed', { health });
      return health;
    } catch (error) {
      this.logger.error('Health check failed', { error });
      return {
        healthy: false,
        components: {
          storage: false,
          rateLimiter: false,
          metrics: false,
          clientConnected: false,
        },
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
        timestamp: Date.now(),
      };
    }
  }
}
