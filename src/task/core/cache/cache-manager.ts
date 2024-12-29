import { Logger } from '../../../logging/index.js';
import { EventManager } from '../../../events/event-manager.js';
import { EventTypes } from '../../../types/events.js';
import { CacheMetrics } from './cache-metrics.js';
import { CacheOptions, CacheEntry } from '../../../types/cache.js';

export class CacheManager {
  private readonly cache: Map<string, CacheEntry<any>>;
  private readonly logger: Logger;
  private readonly metrics: CacheMetrics;
  private readonly eventManager: EventManager;
  private cleanupInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;
  private readonly options: Required<CacheOptions>;
  private static instance: CacheManager | null = null;

  private constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.logger = Logger.getInstance().child({ component: 'CacheManager' });
    this.metrics = new CacheMetrics();
    this.eventManager = EventManager.getInstance();

    // Set default options
    this.options = {
      maxSize: options.maxSize || 500, // Reduced default size for VSCode
      ttl: options.ttl || 60 * 1000, // 1 minute default TTL
      cleanupInterval: options.cleanupInterval || 15 * 1000, // 15 seconds cleanup
      baseTTL: options.baseTTL || 30 * 1000, // 30 seconds base TTL
      maxTTL: options.maxTTL || 2 * 60 * 1000, // 2 minutes max TTL
    };

    this.startCleanupInterval();
    this.startMetricsInterval();
  }

  static getInstance(options?: CacheOptions): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(options);
    }
    return CacheManager.instance;
  }

  static resetInstance(): void {
    if (CacheManager.instance) {
      CacheManager.instance.stop();
      CacheManager.instance = null;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.metrics.recordMiss();
      return undefined;
    }

    // Check if entry has expired
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.metrics.recordMiss();
      this.updateMetrics();
      return undefined;
    }

    // Update last accessed time and extend TTL if needed
    const now = Date.now();
    entry.lastAccessed = now;

    // Extend TTL if more than half has elapsed
    const elapsed = now - (entry.expires - this.options.ttl);
    if (elapsed > this.options.ttl / 2) {
      const newTTL = Math.min(this.options.ttl * 1.5, this.options.maxTTL);
      entry.expires = now + newTTL;
    }

    this.metrics.recordHit();
    return entry.value;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Check cache size and cleanup if needed
    if (this.cache.size >= this.options.maxSize) {
      await this.cleanup(); // Try cleanup first
      if (this.cache.size >= this.options.maxSize) {
        await this.evictLeastRecentlyUsed();
      }
    }

    const expires = Date.now() + (ttl || this.options.ttl);

    this.cache.set(key, {
      value,
      expires,
      lastAccessed: Date.now(),
      size: this.estimateSize(value),
    });

    this.updateMetrics();
  }

  async invalidate(pattern?: string): Promise<void> {
    const startTime = Date.now();
    let removedCount = 0;

    if (pattern) {
      const regex = new RegExp(pattern);
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
          removedCount++;
        }
      }
    } else {
      removedCount = this.cache.size;
      this.cache.clear();
    }

    this.metrics.recordInvalidation();
    this.updateMetrics();

    this.eventManager.emit({
      type: EventTypes.CACHE_INVALIDATED,
      timestamp: Date.now(),
      batchId: `cache_invalidate_${Date.now()}`,
      metadata: {
        pattern,
        entriesRemoved: removedCount,
        entriesRemaining: this.cache.size,
        duration: Date.now() - startTime,
      },
    });
  }

  async reduce(percentage: number = 0.5): Promise<void> {
    const startSize = this.cache.size;
    const targetSize = Math.floor(startSize * (1 - percentage));
    await this.evictEntries(startSize - targetSize);

    const endSize = this.cache.size;
    this.updateMetrics();

    this.logger.info('Cache reduced', {
      startSize,
      endSize,
      reduction: startSize - endSize,
      targetReduction: startSize - targetSize,
    });
  }

  async delete(key: string): Promise<void> {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.updateMetrics();
    }
  }

  async clear(): Promise<void> {
    const startSize = this.cache.size;
    this.cache.clear();
    this.metrics.recordClear();
    this.updateMetrics();

    this.eventManager.emit({
      type: EventTypes.CACHE_CLEARED,
      timestamp: Date.now(),
      batchId: `cache_clear_${Date.now()}`,
      metadata: {
        entriesCleared: startSize,
        reason: 'manual_clear',
      },
    });
  }

  getMetrics(): Record<string, unknown> {
    return {
      ...this.metrics.getMetrics(),
      currentSize: this.cache.size,
      maxSize: this.options.maxSize,
      usage: Math.round((this.cache.size / this.options.maxSize) * 100),
    };
  }

  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(error => {
        this.logger.error('Cache cleanup failed', { error });
      });
    }, this.options.cleanupInterval);
  }

  private startMetricsInterval(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    this.metricsInterval = setInterval(() => {
      this.checkCacheSize();
    }, 30000); // Every 30 seconds
  }

  private checkCacheSize(): void {
    const currentSize = this.cache.size;
    const maxSize = this.options.maxSize;

    if (currentSize > maxSize * 0.7) {
      // Over 70% capacity for VSCode
      this.logger.warn('Cache near capacity', {
        currentSize,
        maxSize,
        usage: `${Math.round((currentSize / maxSize) * 100)}%`,
      });

      // More aggressive reduction for VSCode environment
      this.reduce(0.4).catch(error => {
        this.logger.error('Failed to reduce cache size', { error });
      });
    }
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    let removed = 0;
    let totalSize = 0;

    // Two-phase cleanup: First mark, then sweep
    const toRemove: string[] = [];

    // Mark phase
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        toRemove.push(key);
      } else {
        totalSize += entry.size || 0;
      }
    }

    // Sweep phase
    for (const key of toRemove) {
      this.cache.delete(key);
      removed++;
    }

    if (removed > 0) {
      this.updateMetrics();
      this.logger.debug('Cache cleanup completed', {
        entriesRemoved: removed,
        remainingEntries: this.cache.size,
        totalSize: `${Math.round(totalSize / 1024)}KB`,
      });
    }
  }

  private async evictLeastRecentlyUsed(): Promise<void> {
    let oldest: { key: string; lastAccessed: number } | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.lastAccessed < oldest.lastAccessed) {
        oldest = { key, lastAccessed: entry.lastAccessed };
      }
    }

    if (oldest) {
      this.cache.delete(oldest.key);
      this.updateMetrics();
      this.logger.debug('Evicted LRU entry', { key: oldest.key });
    }
  }

  private async evictEntries(count: number): Promise<void> {
    // Sort entries by last accessed time and size
    const entries = Array.from(this.cache.entries()).sort(([, a], [, b]) => {
      // Prioritize removing larger, older entries
      const ageDiff = a.lastAccessed - b.lastAccessed;
      const sizeDiff = (b.size || 0) - (a.size || 0);
      return ageDiff + sizeDiff;
    });

    // Remove entries
    let removed = 0;
    for (let i = 0; i < Math.min(count, entries.length); i++) {
      this.cache.delete(entries[i][0]);
      removed++;
    }

    if (removed > 0) {
      this.updateMetrics();
      this.logger.debug('Evicted entries', { count: removed });
    }
  }

  private estimateSize(value: any): number {
    try {
      // More accurate size estimation for VSCode environment
      let size = 0;

      if (typeof value === 'string') {
        size = value.length * 2; // UTF-16 characters
      } else if (typeof value === 'number') {
        size = 8; // 64-bit number
      } else if (typeof value === 'boolean') {
        size = 4;
      } else if (value === null || value === undefined) {
        size = 0;
      } else if (Array.isArray(value)) {
        size = value.reduce((acc, item) => acc + this.estimateSize(item), 0);
      } else if (typeof value === 'object') {
        size = Object.entries(value).reduce(
          (acc, [key, val]) => acc + key.length * 2 + this.estimateSize(val),
          0
        );
      }

      // Add overhead for object structure
      return size + 32; // Base object overhead
    } catch {
      return 2048; // Conservative 2KB estimate if calculation fails
    }
  }

  private updateMetrics(): void {
    this.metrics.updateSize(this.cache.size);
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
    this.cache.clear();
    this.metrics.recordClear();
    this.updateMetrics();

    this.logger.info('Cache manager stopped', {
      finalMetrics: this.getMetrics(),
    });
  }
}
