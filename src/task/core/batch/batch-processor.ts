import { Logger } from '../../../logging/index.js';
import { 
    BatchProcessor,
    BatchConfig,
    BatchResult,
    BatchProgressCallback
} from './batch-types.js';
import { ErrorCodes, createError } from '../../../errors/index.js';

const DEFAULT_CONFIG: BatchConfig = {
    batchSize: 50,
    concurrentBatches: 3,
    retryCount: 3,
    retryDelay: 1000 // 1 second
};

export class TaskBatchProcessor implements BatchProcessor {
    private logger: Logger;
    private config: BatchConfig;

    constructor(config: Partial<BatchConfig> = {}) {
        this.logger = Logger.getInstance().child({ component: 'TaskBatchProcessor' });
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Processes a single batch of items
     */
    async processBatch<T>(
        batch: T[],
        operation: (item: T) => Promise<void>,
        progressCallback?: BatchProgressCallback
    ): Promise<BatchResult> {
        const result: BatchResult = {
            success: true,
            processedCount: 0,
            failedCount: 0,
            errors: []
        };

        await Promise.all(
            batch.map(async (item, index) => {
                try {
                    await this.processWithRetry(item, operation);
                    result.processedCount++;

                    if (progressCallback?.onOperationComplete) {
                        progressCallback.onOperationComplete(index + 1, batch.length);
                    }
                } catch (error) {
                    result.failedCount++;
                    result.errors.push({ item, error: error as Error });
                    result.success = false;
                }
            })
        );

        return result;
    }

    /**
     * Processes items in batches with concurrency control
     */
    async processInBatches<T>(
        items: T[],
        batchSize: number,
        operation: (item: T) => Promise<void>,
        progressCallback?: BatchProgressCallback
    ): Promise<BatchResult> {
        const batches = this.createBatches(items, batchSize);
        const totalBatches = batches.length;
        let currentBatch = 0;

        const result: BatchResult = {
            success: true,
            processedCount: 0,
            failedCount: 0,
            errors: []
        };

        // Process batches with concurrency control
        while (currentBatch < totalBatches) {
            const batchPromises: Promise<BatchResult>[] = [];

            // Create concurrent batch operations up to the limit
            for (
                let i = 0;
                i < this.config.concurrentBatches && currentBatch < totalBatches;
                i++, currentBatch++
            ) {
                if (progressCallback?.onBatchStart) {
                    progressCallback.onBatchStart(currentBatch + 1, totalBatches);
                }

                const batchPromise = this.processBatch(
                    batches[currentBatch],
                    operation,
                    progressCallback
                ).then(batchResult => {
                    if (progressCallback?.onBatchComplete) {
                        progressCallback.onBatchComplete(currentBatch + 1, batchResult);
                    }
                    return batchResult;
                });

                batchPromises.push(batchPromise);
            }

            // Wait for current batch of promises to complete
            const batchResults = await Promise.all(batchPromises);

            // Aggregate results
            for (const batchResult of batchResults) {
                result.processedCount += batchResult.processedCount;
                result.failedCount += batchResult.failedCount;
                result.errors.push(...batchResult.errors);
                if (!batchResult.success) {
                    result.success = false;
                }
            }
        }

        this.logger.info('Batch processing completed', {
            totalItems: items.length,
            processedCount: result.processedCount,
            failedCount: result.failedCount,
            batchCount: totalBatches
        });

        return result;
    }

    /**
     * Creates batches from an array of items
     */
    private createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Processes an item with retry logic
     */
    private async processWithRetry<T>(
        item: T,
        operation: (item: T) => Promise<void>
    ): Promise<void> {
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= this.config.retryCount; attempt++) {
            try {
                await operation(item);
                return;
            } catch (error) {
                lastError = error as Error;
                this.logger.warn('Operation failed, retrying', {
                    attempt,
                    maxAttempts: this.config.retryCount,
                    error: lastError
                });

                if (attempt < this.config.retryCount) {
                    await this.delay(this.config.retryDelay * attempt); // Exponential backoff
                }
            }
        }

        throw createError(
            ErrorCodes.OPERATION_FAILED,
            {
                message: 'Operation failed after retries',
                retryCount: this.config.retryCount,
                error: lastError
            }
        );
    }

    /**
     * Delays execution
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Updates batch processor configuration
     */
    updateConfig(config: Partial<BatchConfig>): void {
        this.config = { ...this.config, ...config };
        this.logger.debug('Batch processor configuration updated', { config: this.config });
    }

    /**
     * Gets batch processor statistics
     */
    getStats(): {
        config: BatchConfig;
        performance: {
            averageBatchSize: number;
            concurrencyLevel: number;
            retryRate: number;
        };
    } {
        return {
            config: { ...this.config },
            performance: {
                averageBatchSize: this.config.batchSize,
                concurrencyLevel: this.config.concurrentBatches,
                retryRate: 0 // This would need to be tracked during processing
            }
        };
    }
}
