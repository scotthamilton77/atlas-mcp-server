import { Task } from '../../types/task.js';
import { createError, ErrorCodes } from '../../errors/index.js';

/**
 * Cache entry with metadata
 */
interface CacheEntry {
  task: Task;
  timestamp: number;
}

/**
 * Cache metrics
 */
interface CacheMetrics {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
}

/**
 * Task cache manager
 */
export class TaskCacheManager {
  private readonly cache: Map<string, CacheEntry>;
  private readonly metrics: CacheMetrics;

  constructor(private readonly maxSize: number = 1000) {
    this.cache = new Map();
    this.metrics = {
      hits: 0,
      misses: 0,
      size: 0,
      maxSize,
    };
  }

  /**
   * Get task from cache
   */
  get(path: string): Task | null {
    const entry = this.cache.get(path);
    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    this.metrics.hits++;
    return entry.task;
  }

  /**
   * Set task in cache
   */
  set(task: Task): void {
    if (!task.path) {
      throw createError(ErrorCodes.VALIDATION_ERROR, 'Task path is required', 'set');
    }

    // Evict if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(task.path, {
      task: {
        ...task,
        dependencies: task.dependencies || [],
        notes: task.notes || [],
        planningNotes: task.planningNotes || [],
        progressNotes: task.progressNotes || [],
        completionNotes: task.completionNotes || [],
        troubleshootingNotes: task.troubleshootingNotes || [],
      },
      timestamp: Date.now(),
    });

    this.metrics.size = this.cache.size;
  }

  /**
   * Delete task from cache
   */
  delete(path: string): void {
    this.cache.delete(path);
    this.metrics.size = this.cache.size;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.metrics.size = 0;
  }

  /**
   * Get cache metrics
   */
  getMetrics(): {
    hitRate: number;
    memoryUsage: number;
    entryCount: number;
  } {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total === 0 ? 0 : this.metrics.hits / total;

    return {
      hitRate,
      memoryUsage: this.estimateMemoryUsage(),
      entryCount: this.cache.size,
    };
  }

  /**
   * Evict oldest entries
   */
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest 10% of entries
    const toRemove = Math.max(1, Math.floor(entries.length * 0.1));
    entries.slice(0, toRemove).forEach(([path]) => this.cache.delete(path));

    this.metrics.size = this.cache.size;
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    let total = 0;

    for (const [path, entry] of this.cache.entries()) {
      // Rough estimation of memory usage in bytes
      total += path.length * 2; // String characters (2 bytes each)
      total += 8; // Timestamp (8 bytes)
      total += JSON.stringify(entry.task).length * 2; // Task object serialized
    }

    return total;
  }
}
