import { Task } from './task.js';

export interface CacheEntry<T> {
  value: T;
  expires: number;
  lastAccessed: number;
  size?: number; // Size in bytes (optional for backward compatibility)
}

export interface CacheOptions {
  maxSize?: number;
  ttl?: number;
  cleanupInterval?: number;
  baseTTL?: number;
  maxTTL?: number;
}

export interface CacheMetricsData extends Record<string, unknown> {
  hits: number;
  misses: number;
  hitRatio: number;
  size: number;
  lastCleanup: number;
  invalidations: number;
  clears: number;
  memoryUsage: number;
  memoryPressure: number;
  cachePressure: number;
  totalPressure: number;
  cleanups: {
    total: number;
    byTrigger: {
      routine: number;
      memoryPressure: number;
      cacheUsage: number;
    };
    lastResult?: {
      entriesRemoved: number;
      memorySaved: number;
      trigger: 'high_memory_pressure' | 'routine' | 'cache_usage';
    };
  };
  reductions: {
    total: number;
    totalEntriesRemoved: number;
    totalMemorySaved: number;
    lastReduction?: {
      startSize: number;
      endSize: number;
      reductionRatio: number;
      trigger: 'memory_pressure' | 'cache_usage';
    };
  };
}

export interface CachePressureMetrics {
  memoryPressure: number;
  cachePressure: number;
  totalPressure: number;
  heapUsage: number;
  cacheUsage: number;
}

export interface CacheCoordinatorOptions {
  maxMemory?: number;
  checkInterval?: number;
  pressureThreshold?: number;
  debugMode?: boolean;
}

export interface TaskCacheEntry extends CacheEntry<Task> {
  dependencies?: string[];
  dependents?: string[];
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRatio: number;
  memoryUsage: number;
  lastCleanup: number;
}
