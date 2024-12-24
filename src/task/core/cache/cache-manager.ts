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
  private readonly options: Required<CacheOptions>;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.logger = Logger.getInstance().child({ component: 'CacheManager' });
    this.metrics = new CacheMetrics();
    this.eventManager = EventManager.getInstance();

    // Set default options
    this.options = {
      maxSize: options.maxSize || 1000,
      ttl: options.ttl || 5 * 60 * 1000, // 5 minutes
      cleanupInterval: options.cleanupInterval || 60 * 1000, // 1 minute
      baseTTL: options.baseTTL || 60 * 1000, // 1 minute
      maxTTL: options.maxTTL || 5 * 60 * 1000 // 5 minutes
    };

    this.startCleanupInterval();
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

    // Update last accessed time
    entry.lastAccessed = Date.now();
    this.metrics.recordHit();
    return entry.value;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Check cache size limit
    if (this.cache.size >= this.options.maxSize) {
      await this.evictLeastRecentlyUsed();
    }

    const expires = Date.now() + (ttl || this.options.ttl);
    
    this.cache.set(key, {
      value,
      expires,
      lastAccessed: Date.now()
    });

    this.updateMetrics();
  }

  async invalidate(pattern?: string): Promise<void> {
    if (pattern) {
      const regex = new RegExp(pattern);
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
        }
      }
    } else {
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
        entriesRemaining: this.cache.size
      }
    });
  }

  async reduce(percentage: number = 0.5): Promise<void> {
    const targetSize = Math.floor(this.cache.size * (1 - percentage));
    await this.evictEntries(this.cache.size - targetSize);
    this.updateMetrics();
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.updateMetrics();
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.metrics.recordClear();
    this.updateMetrics();

    this.eventManager.emit({
      type: EventTypes.CACHE_CLEARED,
      timestamp: Date.now(),
      batchId: `cache_clear_${Date.now()}`,
      metadata: {
        reason: 'manual_clear'
      }
    });
  }

  getMetrics(): Record<string, unknown> {
    return this.metrics.getMetrics();
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.updateMetrics();
      this.logger.debug('Cache cleanup completed', {
        entriesRemoved: removed,
        remainingEntries: this.cache.size
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
    }
  }

  private async evictEntries(count: number): Promise<void> {
    // Sort entries by last accessed time
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    // Remove oldest entries
    for (let i = 0; i < Math.min(count, entries.length); i++) {
      this.cache.delete(entries[i][0]);
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
  }
}
