import { Logger } from '../../../logging/index.js';
import { BatchData, BatchResult, ValidationResult } from './common/batch-utils.js';

export interface BatchDependencies {
  validator: any;
  logger: Logger;
  storage: any;
}

export interface BatchOptions {
  maxBatchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  validateBeforeProcess?: boolean;
  concurrentBatches?: number;
}

export abstract class BaseBatchProcessor<T = unknown> {
  protected readonly logger: Logger;
  protected readonly defaultOptions: Required<BatchOptions> = {
    maxBatchSize: 100,
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000,
    validateBeforeProcess: true,
    concurrentBatches: 1,
  };

  private activeTimeouts: Set<NodeJS.Timeout> = new Set();
  private activeBatches: Map<
    string,
    {
      startTime: number;
      results: WeakRef<any[]>;
    }
  > = new Map();
  private isShuttingDown = false;
  private cleanupInterval?: NodeJS.Timeout;
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes
  private readonly BATCH_RESULT_TTL = 600000; // 10 minutes
  private readonly MEMORY_CHECK_INTERVAL = 60000; // 1 minute
  private readonly HEAP_THRESHOLD = 0.9; // 90% heap usage threshold
  private memoryCheckInterval?: NodeJS.Timeout;

  constructor(
    protected readonly dependencies: BatchDependencies,
    protected readonly options: BatchOptions = {}
  ) {
    this.logger = Logger.getInstance().child({
      component: this.constructor.name,
    });
    this.options = { ...this.defaultOptions, ...options };

    // Start monitoring and cleanup
    this.startMemoryMonitoring();
    this.startPeriodicCleanup();

    // Log initial memory state
    this.logMemoryUsage('Initialization');
  }

  /**
   * Main execution method that orchestrates the batch processing flow
   */
  async execute(batch: BatchData[]): Promise<BatchResult<T>> {
    if (this.isShuttingDown) {
      throw new Error('Batch processor is shutting down');
    }

    const batchId = `batch-${Date.now()}-${Math.random()}`;
    this.activeBatches.set(batchId, {
      startTime: Date.now(),
      results: new WeakRef([]),
    });

    try {
      // Validate batch if enabled
      if (this.options.validateBeforeProcess) {
        const validation = await this.validate(batch);
        if (!validation.valid) {
          throw new Error(`Batch validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // Set up timeout if specified
      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        if (this.options.timeout) {
          timeoutId = setTimeout(() => {
            reject(new Error(`Batch processing timed out after ${this.options.timeout}ms`));
          }, this.options.timeout);
          this.activeTimeouts.add(timeoutId);
        }
      });

      // Process the batch with timeout
      const processResult = await Promise.race([this.process(batch), timeoutPromise]);

      // Clear timeout if it was set
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.activeTimeouts.delete(timeoutId);
      }

      // Store results with WeakRef for memory management
      const batchInfo = this.activeBatches.get(batchId);
      if (batchInfo) {
        batchInfo.results = new WeakRef(processResult.results);
      }

      // Log metrics
      this.logMetrics(processResult);

      return processResult;
    } catch (error) {
      this.logger.error('Batch processing failed', { error });
      throw error;
    } finally {
      this.activeBatches.delete(batchId);
    }
  }

  /**
   * Process items in batches with configurable concurrency
   */
  public async processInBatches(
    items: BatchData[],
    batchSize: number,
    processor: (item: BatchData) => Promise<T>
  ): Promise<BatchResult<T>> {
    const batches = this.createBatches(items, batchSize);
    const results: T[] = [];
    const errors: Error[] = [];
    const startTime = Date.now();

    try {
      const concurrentBatches = this.options.concurrentBatches || 1;
      for (let i = 0; i < batches.length; i += concurrentBatches) {
        const batchPromises = batches
          .slice(i, i + concurrentBatches)
          .map(batch => this.processBatch(batch, processor));

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
          results.push(...result.results);
          errors.push(...result.errors);
        }
      }

      const endTime = Date.now();
      return {
        results,
        errors,
        metadata: {
          processingTime: endTime - startTime,
          successCount: results.length,
          errorCount: errors.length,
        },
      };
    } catch (error) {
      this.logger.error('Batch processing failed', { error });
      throw error;
    }
  }

  /**
   * Abstract method for batch validation
   * Must be implemented by concrete classes
   */
  protected abstract validate(batch: BatchData[]): Promise<ValidationResult>;

  /**
   * Abstract method for batch processing
   * Must be implemented by concrete classes
   */
  protected abstract process(batch: BatchData[]): Promise<BatchResult<T>>;

  /**
   * Helper method to split items into batches
   */
  protected createBatches(items: BatchData[], batchSize: number): BatchData[][] {
    const batches: BatchData[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Helper method to process a single batch
   */
  protected async processBatch(
    batch: BatchData[],
    processor: (item: BatchData) => Promise<T>
  ): Promise<BatchResult<T>> {
    if (this.isShuttingDown) {
      throw new Error('Batch processor is shutting down');
    }

    const batchId = `sub-batch-${Date.now()}-${Math.random()}`;
    const results: T[] = [];
    const errors: Error[] = [];
    const startTime = Date.now();

    // Track this sub-batch
    this.activeBatches.set(batchId, {
      startTime,
      results: new WeakRef([]),
    });

    try {
      for (const item of batch) {
        try {
          const result = await this.withRetry(() => processor(item), `Processing item ${item.id}`);
          results.push(result);
        } catch (error) {
          errors.push(error as Error);
          this.logger.error('Failed to process batch item', {
            error,
            itemId: item.id,
          });
        }
      }

      const endTime = Date.now();
      const batchResult = {
        results,
        errors,
        metadata: {
          processingTime: endTime - startTime,
          successCount: results.length,
          errorCount: errors.length,
          batchId,
        },
      };

      // Update batch results reference
      const batchInfo = this.activeBatches.get(batchId);
      if (batchInfo) {
        batchInfo.results = new WeakRef(results);
      }

      return batchResult;
    } finally {
      // Clean up batch tracking after processing
      this.activeBatches.delete(batchId);
    }
  }

  /**
   * Helper method to handle retries
   */
  protected async withRetry<R>(operation: () => Promise<R>, context: string): Promise<R> {
    const maxRetries = this.options.maxRetries || this.defaultOptions.maxRetries;
    const delay = this.options.retryDelay || this.defaultOptions.retryDelay;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`${context} failed, attempt ${attempt}/${maxRetries}`, {
          error,
          attempt,
          maxRetries,
        });

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Helper method to log batch processing metrics
   */
  protected logMetrics(result: BatchResult<T>): void {
    this.logger.info('Batch processing completed', {
      processingTime: result.metadata?.processingTime,
      successCount: result.metadata?.successCount,
      errorCount: result.metadata?.errorCount,
      totalItems: result.results.length + result.errors.length,
    });
  }

  /**
   * Cleanup resources and prepare for shutdown
   */
  private startMemoryMonitoring(): void {
    // Monitor memory usage periodically
    this.memoryCheckInterval = setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const heapUsed = memoryUsage.heapUsed / memoryUsage.heapTotal;

      this.logger.debug('Memory usage', {
        heapUsed: `${(heapUsed * 100).toFixed(1)}%`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
        arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`,
      });

      if (heapUsed > this.HEAP_THRESHOLD) {
        this.logger.warn('High memory usage detected', {
          heapUsed: `${(heapUsed * 100).toFixed(1)}%`,
          activeTimeouts: this.activeTimeouts.size,
          activeBatches: this.activeBatches.size,
        });

        // Force cleanup when memory pressure is high
        this.cleanupExpiredBatches(true);

        // Force GC if available
        if (global.gc) {
          this.logger.info('Forcing garbage collection');
          global.gc();
        }
      }
    }, this.MEMORY_CHECK_INTERVAL);

    // Ensure cleanup on process exit
    process.once('beforeExit', () => {
      if (this.memoryCheckInterval) {
        clearInterval(this.memoryCheckInterval);
        this.memoryCheckInterval = undefined;
      }
    });
  }

  private startPeriodicCleanup(): void {
    // More frequent cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredBatches();
    }, this.CLEANUP_INTERVAL);

    // Ensure cleanup interval is cleared on process exit
    process.once('beforeExit', () => {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = undefined;
      }
    });
  }

  private cleanupExpiredBatches(force: boolean = false): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [batchId, batchInfo] of this.activeBatches.entries()) {
      // Clean up batches that have expired or force cleanup
      if (force || now - batchInfo.startTime > this.BATCH_RESULT_TTL) {
        this.activeBatches.delete(batchId);
        cleanedCount++;
        continue;
      }

      // Clean up batches whose results have been garbage collected
      const results = batchInfo.results.deref();
      if (!results) {
        this.activeBatches.delete(batchId);
        cleanedCount++;
      }
    }

    // Always log cleanup metrics
    this.logger.debug('Batch cleanup completed', {
      cleanedCount,
      remainingBatches: this.activeBatches.size,
      forced: force,
      memoryUsage: this.getMemoryMetrics(),
    });
  }

  private getMemoryMetrics(): Record<string, string> {
    const memoryUsage = process.memoryUsage();
    return {
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`,
      heapUsedPercentage: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(1)}%`,
    };
  }

  private logMemoryUsage(context: string): void {
    this.logger.info(`Memory usage - ${context}`, this.getMemoryMetrics());
  }

  async cleanup(): Promise<void> {
    this.isShuttingDown = true;
    this.logMemoryUsage('Cleanup start');

    // Stop all monitoring and cleanup intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = undefined;
    }

    // Clear all timeouts
    for (const timeout of this.activeTimeouts) {
      clearTimeout(timeout);
    }
    this.activeTimeouts.clear();

    // Wait for active batches to complete with timeout
    if (this.activeBatches.size > 0) {
      this.logger.info('Waiting for active batches to complete', {
        count: this.activeBatches.size,
      });

      const timeout = 5000;
      const startTime = Date.now();

      while (this.activeBatches.size > 0 && Date.now() - startTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (this.activeBatches.size > 0) {
        this.logger.warn('Some batches did not complete before timeout', {
          remainingBatches: this.activeBatches.size,
        });
      }
    }

    // Force final cleanup
    this.cleanupExpiredBatches(true);
    this.activeBatches.clear();

    // Force garbage collection
    if (global.gc) {
      this.logger.info('Forcing final garbage collection');
      global.gc();
    }

    this.logMemoryUsage('Cleanup end');
    this.logger.info('Batch processor cleanup completed', {
      finalMetrics: {
        activeTimeouts: this.activeTimeouts.size,
        activeBatches: this.activeBatches.size,
        ...this.getMemoryMetrics(),
      },
    });
  }
}
