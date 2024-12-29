import { Logger } from '../../../logging/index.js';
import { EventManager } from '../../../events/event-manager.js';
import { EventTypes } from '../../../types/events.js';
import { CacheManager } from './cache-manager.js';
import { CacheMetrics } from './cache-metrics.js';
import { CacheCoordinatorOptions } from '../../../types/cache.js';

export class CacheCoordinator {
  private readonly logger: Logger;
  private readonly metrics: CacheMetrics;
  private readonly eventManager: EventManager;
  private monitorInterval?: NodeJS.Timeout;
  private readonly options: Required<CacheCoordinatorOptions>;

  constructor(
    private readonly cacheManager: CacheManager,
    options: CacheCoordinatorOptions = {}
  ) {
    this.logger = Logger.getInstance().child({ component: 'CacheCoordinator' });
    this.metrics = new CacheMetrics();
    this.eventManager = EventManager.getInstance();

    // Set default options
    this.options = {
      maxMemory: options.maxMemory || 512 * 1024 * 1024, // 512MB
      checkInterval: options.checkInterval || 60000, // 1 minute
      pressureThreshold: options.pressureThreshold || 0.8, // 80%
      debugMode: options.debugMode || process.env.NODE_ENV === 'development',
    };

    this.setupEventListeners();
    this.startMemoryMonitoring();
  }

  private setupEventListeners(): void {
    // Listen for task updates to invalidate cache
    this.eventManager.on(EventTypes.TASK_UPDATED, () => {
      this.invalidateTaskCache();
    });

    // Listen for memory pressure to reduce cache size
    this.eventManager.on(EventTypes.MEMORY_PRESSURE, () => {
      this.reduceCacheSize();
    });

    // Listen for cache-related events to update metrics
    this.eventManager.on(EventTypes.CACHE_INVALIDATED, () => {
      this.metrics.recordInvalidation();
    });

    this.eventManager.on(EventTypes.CACHE_CLEARED, () => {
      this.metrics.recordClear();
    });
  }

  private startMemoryMonitoring(): void {
    this.monitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.options.checkInterval);
  }

  private async checkMemoryUsage(): Promise<void> {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed;
    const usage = heapUsed / this.options.maxMemory;

    this.metrics.updateMemoryUsage(heapUsed);

    if (usage >= this.options.pressureThreshold) {
      this.logger.warn('Memory pressure detected', {
        heapUsed: `${Math.round(heapUsed / 1024 / 1024)}MB`,
        maxMemory: `${Math.round(this.options.maxMemory / 1024 / 1024)}MB`,
        usage: `${Math.round(usage * 100)}%`,
        threshold: `${Math.round(this.options.pressureThreshold * 100)}%`,
      });

      // Emit memory pressure event
      this.eventManager.emit({
        type: EventTypes.MEMORY_PRESSURE,
        timestamp: Date.now(),
        metadata: {
          memoryUsage: {
            heapUsed,
            heapTotal: memUsage.heapTotal,
            rss: memUsage.rss,
          },
          threshold: this.options.pressureThreshold,
        },
      });

      await this.reduceCacheSize();
    }

    if (this.options.debugMode) {
      this.logger.debug('Memory usage stats', {
        heapUsed: `${Math.round(heapUsed / 1024 / 1024)}MB`,
        usage: `${Math.round(usage * 100)}%`,
        cacheSize: this.metrics.getCacheSize(),
        hitRatio: this.metrics.getHitRatio(),
      });
    }
  }

  private async invalidateTaskCache(): Promise<void> {
    try {
      const before = this.metrics.getCacheSize();
      await this.cacheManager.invalidate();
      const after = this.metrics.getCacheSize();

      this.eventManager.emit({
        type: EventTypes.CACHE_INVALIDATED,
        timestamp: Date.now(),
        metadata: {
          reason: 'task_update',
          sizeBefore: before,
          sizeAfter: after,
          reduction: before - after,
        },
      });

      if (this.options.debugMode) {
        this.logger.debug('Cache invalidated', {
          sizeBefore: before,
          sizeAfter: after,
          reduction: before - after,
        });
      }
    } catch (error) {
      this.logger.error('Failed to invalidate cache', { error });
      throw error;
    }
  }

  private async reduceCacheSize(): Promise<void> {
    try {
      const before = this.metrics.getCacheSize();
      await this.cacheManager.reduce();
      const after = this.metrics.getCacheSize();

      this.eventManager.emit({
        type: EventTypes.CACHE_CLEARED,
        timestamp: Date.now(),
        metadata: {
          reason: 'memory_pressure',
          sizeBefore: before,
          sizeAfter: after,
          reduction: before - after,
        },
      });

      this.logger.info('Cache size reduced', {
        before,
        after,
        reduction: before - after,
      });
    } catch (error) {
      this.logger.error('Failed to reduce cache size', { error });
      throw error;
    }
  }

  async clearCache(): Promise<void> {
    try {
      const before = this.metrics.getCacheSize();
      await this.cacheManager.clear();

      this.eventManager.emit({
        type: EventTypes.CACHE_CLEARED,
        timestamp: Date.now(),
        metadata: {
          reason: 'manual_clear',
          sizeBefore: before,
          sizeAfter: 0,
          reduction: before,
        },
      });

      this.logger.info('Cache cleared');
    } catch (error) {
      this.logger.error('Failed to clear cache', { error });
      throw error;
    }
  }

  getMetrics(): Record<string, unknown> {
    return {
      ...this.metrics.getMetrics(),
      maxMemory: this.options.maxMemory,
      pressureThreshold: this.options.pressureThreshold,
      checkInterval: this.options.checkInterval,
    };
  }

  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
  }
}
