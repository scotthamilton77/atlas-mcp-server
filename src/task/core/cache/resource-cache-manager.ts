import { Resource } from '@modelcontextprotocol/sdk/types.js';

interface CacheEntry {
  resource: Resource;
  timestamp: number;
}

export class ResourceCacheManager {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get a resource from cache
   */
  get(key: string): Resource | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if cache entry is still valid
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.resource;
  }

  /**
   * Set a resource in cache
   */
  set(key: string, resource: Resource): void {
    this.cache.set(key, {
      resource,
      timestamp: Date.now(),
    });
  }

  /**
   * Delete a resource from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
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
      entry => Date.now() - entry.timestamp <= this.TTL
    ).length;

    return {
      hitRate: hits / this.cache.size || 0,
      memoryUsage: process.memoryUsage().heapUsed,
      entryCount: this.cache.size,
    };
  }
}
