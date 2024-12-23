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
    concurrentBatches: 1
  };

  constructor(
    protected readonly dependencies: BatchDependencies,
    protected readonly options: BatchOptions = {}
  ) {
    this.logger = Logger.getInstance().child({ 
      component: this.constructor.name 
    });
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Main execution method that orchestrates the batch processing flow
   */
  async execute(batch: BatchData[]): Promise<BatchResult<T>> {
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
        }
      });

      // Process the batch with timeout
      const result = await Promise.race([
        this.process(batch),
        timeoutPromise
      ]);

      // Clear timeout if it was set
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      return result as BatchResult<T>;
    } catch (error) {
      this.logger.error('Batch processing failed', { error });
      throw error;
    }
  }

  /**
   * Process items in batches with configurable concurrency
   */
  async processInBatches(
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
          errorCount: errors.length
        }
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
    const results: T[] = [];
    const errors: Error[] = [];
    const startTime = Date.now();

    for (const item of batch) {
      try {
        const result = await this.withRetry(
          () => processor(item),
          `Processing item ${item.id}`
        );
        results.push(result);
      } catch (error) {
        errors.push(error as Error);
        this.logger.error('Failed to process batch item', {
          error,
          itemId: item.id
        });
      }
    }

    const endTime = Date.now();
    return {
      results,
      errors,
      metadata: {
        processingTime: endTime - startTime,
        successCount: results.length,
        errorCount: errors.length
      }
    };
  }

  /**
   * Helper method to handle retries
   */
  protected async withRetry<R>(
    operation: () => Promise<R>,
    context: string
  ): Promise<R> {
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
          maxRetries 
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
  protected logMetrics(result: BatchResult<any>): void {
    this.logger.info('Batch processing completed', {
      processingTime: result.metadata?.processingTime,
      successCount: result.metadata?.successCount,
      errorCount: result.metadata?.errorCount,
      totalItems: result.results.length + result.errors.length
    });
  }
}
