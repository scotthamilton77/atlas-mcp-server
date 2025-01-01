import { Task } from '../../types/task.js';

interface CacheEntry {
  task: Task;
  timestamp: number;
}

export class TaskCacheManager {
  private readonly cache = new Map<string, CacheEntry>();

  /**
   * Get a task from cache
   */
  get(path: string): Task | null {
    const entry = this.cache.get(path);
    if (!entry) {
      return null;
    }

    // Check if cache entry is still valid (5 minutes)
    if (Date.now() - entry.timestamp > 5 * 60 * 1000) {
      this.cache.delete(path);
      return null;
    }

    return entry.task;
  }

  /**
   * Set a task in cache
   */
  set(task: Task): void {
    this.cache.set(task.path, {
      task: {
        ...task,
        // Ensure arrays are initialized
        dependencies: task.dependencies || [],
        planningNotes: task.planningNotes || [],
        progressNotes: task.progressNotes || [],
        completionNotes: task.completionNotes || [],
        troubleshootingNotes: task.troubleshootingNotes || [],
        // Initialize metadata
        metadata: task.metadata || {},
        statusMetadata: task.statusMetadata || {},
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Delete a task from cache
   */
  delete(path: string): void {
    this.cache.delete(path);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache metrics
   */
  getMetrics(): {
    hitRate: number;
    memoryUsage: number;
    entryCount: number;
  } {
    const hits = Array.from(this.cache.values()).filter(
      entry => Date.now() - entry.timestamp <= 5 * 60 * 1000
    ).length;

    return {
      hitRate: hits / this.cache.size || 0,
      memoryUsage: process.memoryUsage().heapUsed,
      entryCount: this.cache.size,
    };
  }
}
