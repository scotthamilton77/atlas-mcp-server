/**
 * Storage monitoring module exports
 */
export { MetricsCollector, type MetricsCollectorOptions } from './metrics.js';
export { HealthMonitor, type HealthMonitorOptions } from './health.js';

// Re-export types
export type { MonitoringMetrics } from '../../types/storage.js';

// Constants
export const DEFAULT_CHECK_INTERVAL = 30000; // 30 seconds
export const DEFAULT_ERROR_THRESHOLD = 5;
export const DEFAULT_RESPONSE_TIME_THRESHOLD = 1000; // 1 second
export const DEFAULT_METRICS_INTERVAL = 60000; // 1 minute

// Monitoring event types
export const MonitoringEventTypes = {
  HEALTH_CHECK: 'health_check',
  METRICS_COLLECTED: 'metrics_collected',
  ERROR_THRESHOLD_EXCEEDED: 'error_threshold_exceeded',
  HIGH_MEMORY_USAGE: 'high_memory_usage',
  SLOW_QUERY_DETECTED: 'slow_query_detected',
} as const;

// Health status types
export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
} as const;

// Monitoring interfaces
export interface HealthStatus {
  status: (typeof HealthStatus)[keyof typeof HealthStatus];
  errorCount: number;
  lastCheck: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    heapUsedPercent: number;
    rss: number;
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  healthCheck?: {
    enabled?: boolean;
    interval?: number;
    errorThreshold?: number;
    responseTimeThreshold?: number;
  };
  metrics?: {
    enabled?: boolean;
    interval?: number;
    errorThreshold?: number;
    responseTimeThreshold?: number;
  };
}

// Utility functions
export function formatMemorySize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${Math.round(size * 100) / 100}${units[unitIndex]}`;
}

export function calculateMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  heapUsedPercent: number;
  rss: number;
} {
  const memoryUsage = process.memoryUsage();
  return {
    heapUsed: memoryUsage.heapUsed,
    heapTotal: memoryUsage.heapTotal,
    heapUsedPercent: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
    rss: memoryUsage.rss,
  };
}

export function isHealthy(status: HealthStatus): boolean {
  return status.status === HealthStatus.HEALTHY;
}

export function isDegraded(status: HealthStatus): boolean {
  return status.status === HealthStatus.DEGRADED;
}

export function isUnhealthy(status: HealthStatus): boolean {
  return status.status === HealthStatus.UNHEALTHY;
}
