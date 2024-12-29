import { Logger } from '../../../logging/index.js';
import { CacheMetricsData } from '../../../types/cache.js';

export class CacheMetrics {
  private readonly logger: Logger;
  private hits = 0;
  private misses = 0;
  private size = 0;
  private lastCleanup: number = Date.now();
  private invalidations = 0;
  private clears = 0;
  private memoryUsage = 0;

  constructor() {
    this.logger = Logger.getInstance().child({ component: 'CacheMetrics' });
  }

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }

  updateSize(newSize: number): void {
    this.size = newSize;
    this.logger.debug('Cache size updated', { size: newSize });
  }

  recordInvalidation(): void {
    this.invalidations++;
    this.lastCleanup = Date.now();
    this.logger.debug('Cache invalidation recorded', {
      invalidations: this.invalidations,
    });
  }

  recordClear(): void {
    this.clears++;
    this.lastCleanup = Date.now();
    this.logger.debug('Cache clear recorded', {
      clears: this.clears,
    });
  }

  updateMemoryUsage(bytes: number): void {
    this.memoryUsage = bytes;
    this.logger.debug('Memory usage updated', {
      memoryUsage: `${Math.round(bytes / 1024 / 1024)}MB`,
    });
  }

  getCacheSize(): number {
    return this.size;
  }

  getHitRatio(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  getMetrics(): CacheMetricsData {
    const metrics = {
      hits: this.hits,
      misses: this.misses,
      hitRatio: this.getHitRatio(),
      size: this.size,
      lastCleanup: this.lastCleanup,
      invalidations: this.invalidations,
      clears: this.clears,
      memoryUsage: this.memoryUsage,
    };

    this.logger.debug('Cache metrics retrieved', metrics);
    return metrics;
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.size = 0;
    this.lastCleanup = Date.now();
    this.invalidations = 0;
    this.clears = 0;
    this.memoryUsage = 0;
    this.logger.debug('Cache metrics reset');
  }
}
