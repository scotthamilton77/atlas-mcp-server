/**
 * Health monitor for system health checks
 */

export interface HealthStatus {
    healthy: boolean;
    status: {
        server: {
            healthy: boolean;
            activeRequests: number;
            memory: {
                used: number;
                total: number;
                percentage: number;
            };
            cpu: {
                usage: number;
            };
        };
        rateLimiter: {
            healthy: boolean;
            current: number;
            limit: number;
            windowMs: number;
        };
        metrics: {
            requestCount: number;
            errorCount: number;
            avgResponseTime: number;
            errorRate: number;
        };
    };
    timestamp: string;
    [key: string]: unknown; // Add index signature for Record<string, unknown>
}

interface HealthCheckParams {
    activeRequests: number;
    metrics: {
        requestCount: number;
        errorCount: number;
        avgResponseTime: number;
    };
    rateLimiter: {
        current: number;
        limit: number;
        windowMs: number;
    };
}

export class HealthMonitor {
    private readonly memoryThreshold = 0.9; // 90%
    private readonly errorRateThreshold = 0.1; // 10%
    private readonly responseTimeThreshold = 5000; // 5 seconds

    /**
     * Performs health check
     */
    check(params: HealthCheckParams): HealthStatus {
        const memoryUsage = process.memoryUsage();
        const memoryUsed = memoryUsage.heapUsed;
        const memoryTotal = memoryUsage.heapTotal;
        const memoryPercentage = memoryUsed / memoryTotal;

        // Calculate error rate
        const errorRate = params.metrics.requestCount > 0
            ? params.metrics.errorCount / params.metrics.requestCount
            : 0;

        // Check individual components
        const memoryHealthy = memoryPercentage < this.memoryThreshold;
        const errorRateHealthy = errorRate < this.errorRateThreshold;
        const responseTimeHealthy = params.metrics.avgResponseTime < this.responseTimeThreshold;
        const rateLimiterHealthy = params.rateLimiter.current < params.rateLimiter.limit;

        // Overall health status
        const serverHealthy = memoryHealthy && errorRateHealthy && responseTimeHealthy;
        const overallHealthy = serverHealthy && rateLimiterHealthy;

        return {
            healthy: overallHealthy,
            status: {
                server: {
                    healthy: serverHealthy,
                    activeRequests: params.activeRequests,
                    memory: {
                        used: memoryUsed,
                        total: memoryTotal,
                        percentage: memoryPercentage
                    },
                    cpu: {
                        usage: process.cpuUsage().user / 1000000 // Convert to seconds
                    }
                },
                rateLimiter: {
                    healthy: rateLimiterHealthy,
                    ...params.rateLimiter
                },
                metrics: {
                    ...params.metrics,
                    errorRate
                }
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Gets current memory usage
     */
    getMemoryUsage(): { used: number; total: number; percentage: number } {
        const memoryUsage = process.memoryUsage();
        return {
            used: memoryUsage.heapUsed,
            total: memoryUsage.heapTotal,
            percentage: memoryUsage.heapUsed / memoryUsage.heapTotal
        };
    }

    /**
     * Gets current CPU usage
     */
    getCpuUsage(): { user: number; system: number } {
        const usage = process.cpuUsage();
        return {
            user: usage.user / 1000000, // Convert to seconds
            system: usage.system / 1000000
        };
    }

    /**
     * Checks if memory usage is healthy
     */
    isMemoryHealthy(): boolean {
        const { percentage } = this.getMemoryUsage();
        return percentage < this.memoryThreshold;
    }

    /**
     * Checks if error rate is healthy
     */
    isErrorRateHealthy(requestCount: number, errorCount: number): boolean {
        if (requestCount === 0) return true;
        return (errorCount / requestCount) < this.errorRateThreshold;
    }

    /**
     * Checks if response time is healthy
     */
    isResponseTimeHealthy(avgResponseTime: number): boolean {
        return avgResponseTime < this.responseTimeThreshold;
    }
}
