import { Task } from '../../../../types/task.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface BatchData<T = unknown> {
  id: string;
  data: T;
  [key: string]: unknown;
}

export interface TaskBatchData extends BatchData<Task> {
  data: Task;
}

export interface BatchResult<T> {
  results: T[];
  errors: Error[];
  metadata?: {
    processingTime: number;
    successCount: number;
    errorCount: number;
  };
}

export class BatchUtils {
  static validateBatch(batch: BatchData[]): ValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(batch)) {
      errors.push('Batch must be an array');
      return { valid: false, errors };
    }

    if (batch.length === 0) {
      errors.push('Batch cannot be empty');
      return { valid: false, errors };
    }

    // Validate each item in the batch
    batch.forEach((item, index) => {
      if (!item.id) {
        errors.push(`Item at index ${index} is missing required 'id' field`);
      }
      if (!item.data) {
        errors.push(`Item at index ${index} is missing required 'data' field`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static async processBatch<T>(
    batch: BatchData[],
    processor: (item: BatchData) => Promise<T>
  ): Promise<BatchResult<T>> {
    const results: T[] = [];
    const errors: Error[] = [];
    const startTime = Date.now();

    for (const item of batch) {
      try {
        const result = await processor(item);
        results.push(result);
      } catch (error) {
        errors.push(error as Error);
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
  }

  static async retryFailedItems<T>(
    failedItems: BatchData[],
    processor: (item: BatchData) => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<BatchResult<T>> {
    let currentRetry = 0;
    let itemsToRetry = [...failedItems];
    const results: T[] = [];
    const errors: Error[] = [];

    while (currentRetry < maxRetries && itemsToRetry.length > 0) {
      // Wait before retry
      if (currentRetry > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      const retryResult = await this.processBatch(itemsToRetry, processor);

      // Add successful results
      results.push(...retryResult.results);

      // Update items to retry
      itemsToRetry = itemsToRetry.filter((_, index) => retryResult.errors[index] !== undefined);

      if (currentRetry === maxRetries - 1) {
        // On last attempt, add remaining errors
        errors.push(...retryResult.errors);
      }

      currentRetry++;
    }

    return {
      results,
      errors,
      metadata: {
        processingTime: 0, // Not tracking total time for retries
        successCount: results.length,
        errorCount: errors.length,
      },
    };
  }

  static splitBatchBySize<T extends BatchData>(batch: T[], maxBatchSize: number): T[][] {
    if (maxBatchSize <= 0) {
      throw new Error('maxBatchSize must be greater than 0');
    }

    const batches: T[][] = [];
    for (let i = 0; i < batch.length; i += maxBatchSize) {
      batches.push(batch.slice(i, i + maxBatchSize));
    }

    return batches;
  }
}
