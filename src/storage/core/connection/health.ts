/**
 * Database connection health monitoring
 */
import { Database } from 'sqlite';
import { Logger } from '../../../logging/index.js';

export interface ConnectionHealth {
    isHealthy: boolean;
    lastChecked: number;
    errorCount: number;
    avgResponseTime: number;
    lastError?: string;
}

export interface HealthMetrics {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    errorRate: number;
    avgResponseTime: number;
    healthyConnections: number;
    unhealthyConnections: number;
}

export class HealthMonitor {
    private readonly logger: Logger;
    private readonly healthChecks: Map<string, ConnectionHealth>;
    private readonly checkInterval: number;
    private readonly errorThreshold: number;
    private readonly responseTimeThreshold: number;
    private monitorInterval: NodeJS.Timeout | null;

    constructor(options: {
        checkInterval?: number;
        errorThreshold?: number;
        responseTimeThreshold?: number;
    } = {}) {
        this.logger = Logger.getInstance().child({ component: 'HealthMonitor' });
        this.healthChecks = new Map();
        this.checkInterval = options.checkInterval || 30000; // 30 seconds
        this.errorThreshold = options.errorThreshold || 5;
        this.responseTimeThreshold = options.responseTimeThreshold || 1000; // 1 second
        this.monitorInterval = null;
    }

    /**
     * Start health monitoring
     */
    start(): void {
        if (!this.monitorInterval) {
            this.monitorInterval = setInterval(
                () => this.runHealthChecks(),
                this.checkInterval
            );
            this.logger.info('Health monitoring started', {
                checkInterval: this.checkInterval,
                errorThreshold: this.errorThreshold,
                responseTimeThreshold: this.responseTimeThreshold
            });
        }
    }

    /**
     * Stop health monitoring
     */
    stop(): void {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
            this.logger.info('Health monitoring stopped');
        }
    }

    /**
     * Register a connection for health monitoring
     */
    registerConnection(id: string): void {
        this.healthChecks.set(id, {
            isHealthy: true,
            lastChecked: Date.now(),
            errorCount: 0,
            avgResponseTime: 0
        });
        this.logger.debug('Connection registered for health monitoring', { id });
    }

    /**
     * Unregister a connection from health monitoring
     */
    unregisterConnection(id: string): void {
        this.healthChecks.delete(id);
        this.logger.debug('Connection unregistered from health monitoring', { id });
    }

    /**
     * Check health of a specific connection
     */
    async checkConnectionHealth(id: string, db: Database): Promise<ConnectionHealth> {
        const startTime = Date.now();
        let health = this.healthChecks.get(id) || {
            isHealthy: true,
            lastChecked: startTime,
            errorCount: 0,
            avgResponseTime: 0
        };

        try {
            // Run basic query to check connection
            await db.get('SELECT 1');

            // Update response time
            const responseTime = Date.now() - startTime;
            health.avgResponseTime = (health.avgResponseTime + responseTime) / 2;

            // Check if response time is acceptable
            const isResponseTimeOk = health.avgResponseTime <= this.responseTimeThreshold;

            // Update health status
            health = {
                ...health,
                isHealthy: isResponseTimeOk && health.errorCount < this.errorThreshold,
                lastChecked: Date.now(),
                errorCount: Math.max(0, health.errorCount - 1) // Slowly reduce error count on success
            };

            if (!isResponseTimeOk) {
                this.logger.warn('Connection response time exceeds threshold', {
                    id,
                    avgResponseTime: health.avgResponseTime,
                    threshold: this.responseTimeThreshold
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            health = {
                ...health,
                isHealthy: false,
                lastChecked: Date.now(),
                errorCount: health.errorCount + 1,
                lastError: errorMessage
            };

            this.logger.error('Connection health check failed', {
                id,
                error: errorMessage,
                errorCount: health.errorCount
            });
        }

        this.healthChecks.set(id, health);
        return health;
    }

    /**
     * Run health checks on all registered connections
     */
    private async runHealthChecks(): Promise<void> {
        this.logger.debug('Running health checks', {
            connections: this.healthChecks.size
        });

        const metrics = this.getMetrics();
        this.logger.info('Health check metrics', { metrics });
    }

    /**
     * Get health metrics
     */
    getMetrics(): HealthMetrics {
        let totalResponseTime = 0;
        let totalErrors = 0;
        let healthyCount = 0;
        let unhealthyCount = 0;

        for (const health of this.healthChecks.values()) {
            totalResponseTime += health.avgResponseTime;
            totalErrors += health.errorCount;
            if (health.isHealthy) {
                healthyCount++;
            } else {
                unhealthyCount++;
            }
        }

        const totalConnections = this.healthChecks.size;
        return {
            totalConnections,
            activeConnections: 0, // Updated by connection pool
            idleConnections: 0,   // Updated by connection pool
            errorRate: totalConnections > 0 ? totalErrors / totalConnections : 0,
            avgResponseTime: totalConnections > 0 ? totalResponseTime / totalConnections : 0,
            healthyConnections: healthyCount,
            unhealthyConnections: unhealthyCount
        };
    }

    /**
     * Get health status for a specific connection
     */
    getConnectionHealth(id: string): ConnectionHealth | undefined {
        return this.healthChecks.get(id);
    }

    /**
     * Record an error for a connection
     */
    recordError(id: string, error: Error | string): void {
        const health = this.healthChecks.get(id);
        if (health) {
            health.errorCount++;
            health.lastError = error instanceof Error ? error.message : error;
            health.isHealthy = health.errorCount < this.errorThreshold;
            this.healthChecks.set(id, health);

            this.logger.warn('Connection error recorded', {
                id,
                errorCount: health.errorCount,
                isHealthy: health.isHealthy,
                error: health.lastError
            });
        }
    }

    /**
     * Reset error count for a connection
     */
    resetErrors(id: string): void {
        const health = this.healthChecks.get(id);
        if (health) {
            health.errorCount = 0;
            health.isHealthy = true;
            health.lastError = undefined;
            this.healthChecks.set(id, health);
            this.logger.debug('Connection errors reset', { id });
        }
    }
}
