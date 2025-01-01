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
  private memoryPressure = 0;
  private cachePressure = 0;
  private totalPressure = 0;
  private cleanupStats = {
    total: 0,
    byTrigger: {
      routine: 0,
      memoryPressure: 0,
      cacheUsage: 0,
    },
    lastResult: undefined as
      | {
          entriesRemoved: number;
          memorySaved: number;
          trigger: 'high_memory_pressure' | 'routine' | 'cache_usage';
        }
      | undefined,
  };
  private reductionStats = {
    total: 0,
    totalEntriesRemoved: 0,
    totalMemorySaved: 0,
    lastReduction: undefined as
      | {
          startSize: number;
          endSize: number;
          reductionRatio: number;
          trigger: 'memory_pressure' | 'cache_usage';
        }
      | undefined,
  };

  constructor() {
    this.logger = Logger.getInstance().child({ component: 'CacheMetrics' });
  }

  updatePressureMetrics(heapUsage: number, cacheUsage: number): void {
    // Calculate memory pressure (0-1 scale)
    this.memoryPressure = Math.max(0, (heapUsage - 0.7) / 0.3);

    // Calculate cache pressure (0-1 scale)
    this.cachePressure = Math.max(0, (cacheUsage - 0.6) / 0.4);

    // Calculate total pressure (weighted average)
    this.totalPressure = this.memoryPressure * 0.6 + this.cachePressure * 0.4;

    this.logger.debug('Pressure metrics updated', {
      memoryPressure: this.memoryPressure,
      cachePressure: this.cachePressure,
      totalPressure: this.totalPressure,
      heapUsage,
      cacheUsage,
    });
  }

  recordCleanup(
    entriesRemoved: number,
    memorySaved: number,
    trigger: 'high_memory_pressure' | 'routine' | 'cache_usage'
  ): void {
    this.cleanupStats.total++;
    if (trigger === 'high_memory_pressure') {
      this.cleanupStats.byTrigger.memoryPressure++;
    } else if (trigger === 'routine') {
      this.cleanupStats.byTrigger.routine++;
    } else {
      this.cleanupStats.byTrigger.cacheUsage++;
    }
    this.cleanupStats.lastResult = {
      entriesRemoved,
      memorySaved,
      trigger,
    };
    this.lastCleanup = Date.now();

    this.logger.debug('Cleanup recorded', {
      entriesRemoved,
      memorySaved: `${Math.round(memorySaved / 1024)}KB`,
      trigger,
      totalCleanups: this.cleanupStats.total,
    });
  }

  recordReduction(
    startSize: number,
    endSize: number,
    reductionRatio: number,
    trigger: 'memory_pressure' | 'cache_usage',
    entriesRemoved: number,
    memorySaved: number
  ): void {
    this.reductionStats.total++;
    this.reductionStats.totalEntriesRemoved += entriesRemoved;
    this.reductionStats.totalMemorySaved += memorySaved;
    this.reductionStats.lastReduction = {
      startSize,
      endSize,
      reductionRatio,
      trigger,
    };

    this.logger.debug('Reduction recorded', {
      startSize,
      endSize,
      reductionRatio,
      trigger,
      totalReductions: this.reductionStats.total,
    });
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
      memoryPressure: this.memoryPressure,
      cachePressure: this.cachePressure,
      totalPressure: this.totalPressure,
      cleanups: {
        total: this.cleanupStats.total,
        byTrigger: this.cleanupStats.byTrigger,
        lastResult: this.cleanupStats.lastResult,
      },
      reductions: {
        total: this.reductionStats.total,
        totalEntriesRemoved: this.reductionStats.totalEntriesRemoved,
        totalMemorySaved: this.reductionStats.totalMemorySaved,
        lastReduction: this.reductionStats.lastReduction,
      },
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
    this.memoryPressure = 0;
    this.cachePressure = 0;
    this.totalPressure = 0;
    this.cleanupStats = {
      total: 0,
      byTrigger: {
        routine: 0,
        memoryPressure: 0,
        cacheUsage: 0,
      },
      lastResult: undefined,
    };
    this.reductionStats = {
      total: 0,
      totalEntriesRemoved: 0,
      totalMemorySaved: 0,
      lastReduction: undefined,
    };
    this.logger.debug('Cache metrics reset');
  }
}
