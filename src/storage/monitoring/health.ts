/**
 * Storage health monitoring
 */
import { Logger } from '../../logging/index.js';
import { EventManager } from '../../events/event-manager.js';
import { EventTypes } from '../../types/events.js';

export interface HealthMonitorOptions {
    checkInterval?: number;
    errorThreshold?: number;
    responseTimeThreshold?: number;
}

export class HealthMonitor {
    private readonly logger: Logger;
    private readonly eventManager: EventManager;
    private readonly options: Required<HealthMonitorOptions>;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private readonly DEFAULT_CHECK_INTERVAL = 30000; // 30 seconds
    private readonly DEFAULT_ERROR_THRESHOLD = 5;
    private readonly DEFAULT_RESPONSE_TIME_THRESHOLD = 1000; // 1 second

    private errorCount = 0;
    private lastCheckTime = 0;
    private isHealthy = true;

    constructor(options: HealthMonitorOptions = {}) {
        this.logger = Logger.getInstance().child({ component: 'HealthMonitor' });
        this.eventManager = EventManager.getInstance();
        this.options = {
            checkInterval: options.checkInterval || this.DEFAULT_CHECK_INTERVAL,
            errorThreshold: options.errorThreshold || this.DEFAULT_ERROR_THRESHOLD,
            responseTimeThreshold: options.responseTimeThreshold || this.DEFAULT_RESPONSE_TIME_THRESHOLD
        };
    }

    /**
     * Start health monitoring
     */
    start(): void {
        if (this.healthCheckInterval) {
            return;
        }

        this.healthCheckInterval = setInterval(() => {
            this.checkHealth();
        }, this.options.checkInterval);

        // Ensure the interval doesn't prevent the process from exiting
        this.healthCheckInterval.unref();

        this.logger.info('Health monitoring started', {
            interval: this.options.checkInterval
        });
    }

    /**
     * Stop health monitoring
     */
    stop(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        this.logger.info('Health monitoring stopped');
    }

    /**
     * Record error occurrence
     */
    recordError(error: Error): void {
        this.errorCount++;
        this.isHealthy = this.errorCount < this.options.errorThreshold;

        if (!this.isHealthy) {
            this.logger.error('Health check failed', {
                error,
                errorCount: this.errorCount,
                threshold: this.options.errorThreshold
            });

            // Emit health event
            this.eventManager.emitSystemEvent({
                type: EventTypes.SYSTEM_ERROR,
                timestamp: Date.now(),
                metadata: {
                    component: 'HealthMonitor',
                    error: {
                        name: error.name,
                        message: error.message,
                        ...(error.stack && { stack: error.stack }),
                        ...Object.fromEntries(
                            Object.entries(error).filter(([key]) => 
                                typeof (error as any)[key] === 'string'
                            )
                        )
                    },
                    memoryUsage: process.memoryUsage()
                }
            });
        }
    }

    /**
     * Record successful operation
     */
    recordSuccess(): void {
        // Reset error count on successful operations
        if (this.errorCount > 0) {
            this.errorCount = 0;
            this.isHealthy = true;
        }
    }

    /**
     * Get current health status
     */
    getHealth(): { isHealthy: boolean; errorCount: number; lastCheck: number } {
        return {
            isHealthy: this.isHealthy,
            errorCount: this.errorCount,
            lastCheck: this.lastCheckTime
        };
    }

    /**
     * Reset health status
     */
    reset(): void {
        this.errorCount = 0;
        this.isHealthy = true;
        this.lastCheckTime = Date.now();
    }

    /**
     * Perform health check
     */
    private checkHealth(): void {
        this.lastCheckTime = Date.now();

        // Check memory usage
        const memoryUsage = process.memoryUsage();
        const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

        if (heapUsedPercent > 90) {
            this.logger.warn('High memory usage detected', {
                heapUsed: memoryUsage.heapUsed,
                heapTotal: memoryUsage.heapTotal,
                usedPercent: heapUsedPercent
            });
        }

        // Emit health status event
        this.eventManager.emitSystemEvent({
            type: EventTypes.SYSTEM_STARTUP,
            timestamp: this.lastCheckTime,
            metadata: {
                component: 'HealthMonitor',
                memoryUsage,
                success: this.isHealthy,
                error: this.isHealthy ? undefined : {
                    name: 'HealthCheckError',
                    message: `Error threshold exceeded: ${this.errorCount}`
                }
            }
        });

        // Log health status
        this.logger.info('Health check completed', {
            isHealthy: this.isHealthy,
            errorCount: this.errorCount,
            memoryUsage: {
                heapUsedPercent,
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
            }
        });
    }
}
