import { Task } from './task.js';

export interface CacheEntry<T> {
  value: T;
  expires: number;
  lastAccessed: number;
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
