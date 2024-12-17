/**
 * Metrics collector for monitoring and analytics
 */

interface MetricWindow {
    timestamp: number;
    value: number;
}

interface MetricSummary {
    count: number;
    min: number;
    max: number;
    avg: number;
    p95: number;
    p99: number;
}

export class MetricsCollector {
    private requestCount: number = 0;
    private errorCount: number = 0;
    private responseTimes: MetricWindow[] = [];
    private readonly windowSize = 3600000; // 1 hour window for metrics

    constructor() {
        // Clean up old metrics periodically
        setInterval(() => this.cleanup(), 60000); // Every minute
    }

    /**
     * Records response time for a request
     */
    recordResponseTime(ms: number): void {
        this.requestCount++;
        this.responseTimes.push({
            timestamp: Date.now(),
            value: ms
        });
    }

    /**
     * Increments error count
     */
    incrementErrorCount(): void {
        this.errorCount++;
    }

    /**
     * Gets total request count
     */
    getRequestCount(): number {
        return this.requestCount;
    }

    /**
     * Gets total error count
     */
    getErrorCount(): number {
        return this.errorCount;
    }

    /**
     * Gets average response time over the window
     */
    getAverageResponseTime(): number {
        const current = this.getCurrentWindow();
        if (current.length === 0) return 0;

        const sum = current.reduce((acc, metric) => acc + metric.value, 0);
        return sum / current.length;
    }

    /**
     * Gets detailed response time metrics
     */
    getResponseTimeMetrics(): MetricSummary {
        const current = this.getCurrentWindow();
        if (current.length === 0) {
            return {
                count: 0,
                min: 0,
                max: 0,
                avg: 0,
                p95: 0,
                p99: 0
            };
        }

        const values = current.map(m => m.value).sort((a, b) => a - b);
        const sum = values.reduce((acc, val) => acc + val, 0);

        return {
            count: values.length,
            min: values[0],
            max: values[values.length - 1],
            avg: sum / values.length,
            p95: this.getPercentile(values, 0.95),
            p99: this.getPercentile(values, 0.99)
        };
    }

    /**
     * Gets error rate over the window
     */
    getErrorRate(): number {
        return this.requestCount > 0 ? this.errorCount / this.requestCount : 0;
    }

    /**
     * Gets all metrics
     */
    getAllMetrics(): {
        requests: { total: number; errors: number; errorRate: number };
        responseTimes: MetricSummary;
    } {
        return {
            requests: {
                total: this.requestCount,
                errors: this.errorCount,
                errorRate: this.getErrorRate()
            },
            responseTimes: this.getResponseTimeMetrics()
        };
    }

    /**
     * Resets all metrics
     */
    reset(): void {
        this.requestCount = 0;
        this.errorCount = 0;
        this.responseTimes = [];
    }

    /**
     * Gets metrics within the current window
     */
    private getCurrentWindow(): MetricWindow[] {
        const cutoff = Date.now() - this.windowSize;
        return this.responseTimes.filter(m => m.timestamp >= cutoff);
    }

    /**
     * Cleans up metrics outside the window
     */
    private cleanup(): void {
        const cutoff = Date.now() - this.windowSize;
        this.responseTimes = this.responseTimes.filter(m => m.timestamp >= cutoff);
    }

    /**
     * Calculates percentile value
     */
    private getPercentile(sortedValues: number[], percentile: number): number {
        if (sortedValues.length === 0) return 0;
        
        const index = Math.ceil(sortedValues.length * percentile) - 1;
        return sortedValues[index];
    }

    /**
     * Gets metrics for a specific time range
     */
    getMetricsInRange(start: number, end: number): MetricWindow[] {
        return this.responseTimes.filter(m => 
            m.timestamp >= start && m.timestamp <= end
        );
    }

    /**
     * Gets metrics summary for a specific time range
     */
    getMetricsSummary(start: number, end: number): MetricSummary {
        const metrics = this.getMetricsInRange(start, end);
        if (metrics.length === 0) {
            return {
                count: 0,
                min: 0,
                max: 0,
                avg: 0,
                p95: 0,
                p99: 0
            };
        }

        const values = metrics.map(m => m.value).sort((a, b) => a - b);
        const sum = values.reduce((acc, val) => acc + val, 0);

        return {
            count: values.length,
            min: values[0],
            max: values[values.length - 1],
            avg: sum / values.length,
            p95: this.getPercentile(values, 0.95),
            p99: this.getPercentile(values, 0.99)
        };
    }

    /**
     * Gets current metrics window size
     */
    getWindowSize(): number {
        return this.windowSize;
    }
}
