import { BatchData, BatchResult, ValidationResult } from './common/batch-utils.js';
import { BaseBatchProcessor, BatchDependencies, BatchOptions } from './base-batch-processor.js';

export interface GenericBatchConfig extends BatchOptions {
  validateItems?: boolean;
  stopOnError?: boolean;
  itemTimeout?: number;
}

export class GenericBatchProcessor<T> extends BaseBatchProcessor<T> {
  private readonly config: Required<GenericBatchConfig>;
  private readonly defaultConfig: Required<GenericBatchConfig> = {
    ...this.defaultOptions,
    validateItems: true,
    stopOnError: false,
    itemTimeout: 5000
  };

  constructor(
    dependencies: BatchDependencies,
    config: GenericBatchConfig = {}
  ) {
    super(dependencies, config);
    this.config = { ...this.defaultConfig, ...config };
  }

  protected async validate(batch: BatchData[]): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!Array.isArray(batch)) {
      errors.push('Batch must be an array');
      return { valid: false, errors };
    }

    if (batch.length === 0) {
      errors.push('Batch cannot be empty');
      return { valid: false, errors };
    }

    if (this.config.validateItems) {
      for (const [index, item] of batch.entries()) {
        if (!item.id) {
          errors.push(`Item at index ${index} is missing required 'id' field`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  protected async process(batch: BatchData[]): Promise<BatchResult<T>> {
    const results: T[] = [];
    const errors: Error[] = [];
    const startTime = Date.now();

    for (const item of batch) {
      try {
        const result = await this.processWithTimeout(
          item,
          this.config.itemTimeout
        );
        results.push(result);

        this.logger.debug('Processed batch item', {
          itemId: item.id,
          duration: Date.now() - startTime
        });
      } catch (error) {
        this.logger.error('Failed to process batch item', {
          error,
          itemId: item.id
        });
        errors.push(error as Error);

        if (this.config.stopOnError) {
          this.logger.warn('Stopping batch processing due to error', {
            itemId: item.id,
            remainingItems: batch.length - results.length - 1
          });
          break;
        }
      }
    }

    const endTime = Date.now();
    const result: BatchResult<T> = {
      results,
      errors,
      metadata: {
        processingTime: endTime - startTime,
        successCount: results.length,
        errorCount: errors.length
      }
    };

    this.logMetrics(result);
    return result;
  }

  private async processWithTimeout(
    item: BatchData,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Processing timed out for item ${item.id}`));
      }, timeout);

      this.processItem(item)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private async processItem(item: BatchData): Promise<T> {
    // This is where you would implement the actual processing logic
    // For now, we'll just return the item as is
    return item as unknown as T;
  }

  /**
   * Helper method to categorize errors for better error handling
   */
}
