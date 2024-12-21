/**
 * Health monitoring for system components
 */
import { Logger } from '../logging/index.js';
import { StorageMetrics } from '../types/storage.js';
import { Metrics } from './metrics-collector.js';

export interface HealthStatus {
    healthy: boolean;
    components: {
        storage: boolean;
        rateLimiter: boolean;
        metrics: boolean;
    };
    details?: Record<string, unknown>;
    timestamp: number;
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

    constructor() {
        this.logger = Logger.getInstance().child({ component: 'HealthMonitor' });
    }

    async check(status: ComponentStatus): Promise<HealthStatus> {
        const health: HealthStatus = {
            healthy: true,
            components: {
                storage: true,
                rateLimiter: true,
                metrics: true
            },
            details: {},
            timestamp: Date.now()
        };

        try {
            // Check storage health
            if (status.storage.tasks.total === 0 && status.storage.storage.totalSize === 0) {
                health.components.storage = false;
                health.healthy = false;
                health.details!.storage = 'Storage appears empty';
            }

            // Check rate limiter
            if (status.rateLimiter.current >= status.rateLimiter.limit) {
                health.components.rateLimiter = false;
                health.healthy = false;
                health.details!.rateLimiter = 'Rate limit reached';
            }

            // Check metrics
            const errorRate = status.metrics.requests.failed / status.metrics.requests.total;
            if (errorRate > 0.1) { // More than 10% error rate
                health.components.metrics = false;
                health.healthy = false;
                health.details!.metrics = `High error rate: ${(errorRate * 100).toFixed(2)}%`;
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
                    metrics: false
                },
                details: {
                    error: error instanceof Error ? error.message : String(error)
                },
                timestamp: Date.now()
            };
        }
    }
}
