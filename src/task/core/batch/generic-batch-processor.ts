import { BatchProgressCallback, BatchResult } from '../../../types/batch.js';
import { BaseBatchProcessor } from './base-batch-processor.js';

/**
 * Generic batch processor for handling non-dependent items with concurrent processing.
 * Uses types defined in src/types/batch.ts for consistent type definitions.
 */
export class GenericBatchProcessor<T> extends BaseBatchProcessor<T> {
    /**
     * Process a single batch of items
     * @see BatchProcessor in src/types/batch.ts
     */
    async processBatch(
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

        for (const [index, item] of batch.entries()) {
            try {
                await this.processWithRetry(item, operation);
                result.processedCount++;

                if (progressCallback?.onOperationComplete) {
                    progressCallback.onOperationComplete(index + 1, batch.length);
                }
            } catch (error) {
                const errorContext = this.createErrorContext(error, {
                    item,
                    batchSize: batch.length,
                    currentIndex: index,
                    processedCount: result.processedCount
                });

                result.failedCount++;
                result.errors.push(errorContext);
                result.success = false;

                if (progressCallback?.onOperationComplete) {
                    progressCallback.onOperationComplete(index + 1, batch.length);
                }

                // Check if we should stop processing
                if (this.shouldStopProcessing(result)) {
                    this.logger.warn('Stopping batch processing due to errors', {
                        processedCount: result.processedCount,
                        failedCount: result.failedCount,
                        errorTypes: result.errors.map(e => this.categorizeError(e.error))
                    });
                    break;
                }
            }
        }

        return result;
    }

    /**
     * Process multiple batches of items with concurrent processing
     * @see BatchProcessor in src/types/batch.ts
     */
    async processInBatches(
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

        try {
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

                // Check if we should stop processing
                if (this.shouldStopProcessing(result)) {
                    this.logger.warn('Stopping batch processing due to errors', {
                        processedCount: result.processedCount,
                        failedCount: result.failedCount,
                        remainingBatches: totalBatches - currentBatch
                    });
                    break;
                }
            }

            this.logger.info('Batch processing completed', {
                totalItems: items.length,
                processedCount: result.processedCount,
                failedCount: result.failedCount,
                batchCount: totalBatches
            });

            return result;
        } catch (error) {
            this.logger.error('Batch processing failed', { error });
            throw error;
        }
    }
}
