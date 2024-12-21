import { Logger } from '../../../logging/index.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import {
    BatchConfig,
    BatchResult,
    BatchProgressCallback,
    BatchError
} from '../../../types/batch.js';

const DEFAULT_CONFIG: BatchConfig = {
    batchSize: 50,
    concurrentBatches: 3,
    retryCount: 3,
    retryDelay: 1000
};

/**
 * Base class for batch processors providing core functionality.
 * Uses types defined in src/types/batch.ts for consistent type definitions.
 */
export abstract class BaseBatchProcessor<T = unknown> {
    protected readonly logger: Logger;
    protected config: BatchConfig;

    constructor(config: Partial<BatchConfig> = {}) {
        this.logger = Logger.getInstance().child({ component: this.constructor.name });
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Process a single batch of items
     * @see BatchProcessor in src/types/batch.ts
     */
    abstract processBatch(
        batch: T[],
        operation: (item: T) => Promise<void>,
        progressCallback?: BatchProgressCallback
    ): Promise<BatchResult>;

    /**
     * Process multiple batches of items
     * @see BatchProcessor in src/types/batch.ts
     */
    abstract processInBatches(
        items: T[],
        batchSize: number,
        operation: (item: T) => Promise<void>,
        progressCallback?: BatchProgressCallback
    ): Promise<BatchResult>;

    /**
     * Pre-validate batch items
     */
    protected async preValidateBatch(_batch: T[]): Promise<void> {
        // Base validation - can be overridden by subclasses
    }

    /**
     * Create batches from an array of items
     */
    protected createBatches(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Process an item with retry logic
     */
    protected async processWithRetry(
        item: T,
        operation: (item: T) => Promise<void>
    ): Promise<void> {
        let lastError: Error | undefined;
        let lastAttemptContext: Record<string, unknown> = {};

        for (let attempt = 1; attempt <= this.config.retryCount; attempt++) {
            try {
                await operation(item);
                if (attempt > 1) {
                    this.logger.info('Operation succeeded after retry', {
                        successfulAttempt: attempt,
                        totalAttempts: this.config.retryCount
                    });
                }
                return;
            } catch (error) {
                if (this.isCriticalError(error)) {
                    throw error;
                }

                lastError = error instanceof Error ? error : new Error(String(error));
                lastAttemptContext = {
                    attempt,
                    maxAttempts: this.config.retryCount,
                    error: lastError,
                    errorType: this.categorizeError(error),
                    item: typeof item === 'object' ? JSON.stringify(item) : item,
                    timestamp: new Date().toISOString()
                };

                this.logger.warn('Operation failed, retrying', lastAttemptContext);

                if (attempt < this.config.retryCount) {
                    await this.delay(this.config.retryDelay * Math.pow(2, attempt - 1));
                }
            }
        }

        throw createError(
            ErrorCodes.OPERATION_FAILED,
            {
                message: 'Operation failed after all retry attempts',
                retryCount: this.config.retryCount,
                error: lastError,
                context: lastAttemptContext
            },
            `Operation failed after ${this.config.retryCount} attempts`,
            'Check logs for detailed error history'
        );
    }

    /**
     * Create error context for batch errors
     */
    protected createErrorContext(
        error: unknown,
        context: {
            item: T;
            batchSize: number;
            currentIndex: number;
            processedCount: number;
        }
    ): BatchError {
        return {
            item: context.item,
            error: error instanceof Error ? error : new Error(String(error)),
            context: {
                ...context,
                errorType: this.categorizeError(error),
                timestamp: new Date().toISOString(),
                failureReason: error instanceof Error ? error.message : String(error)
            }
        };
    }

    /**
     * Categorize an error for better error handling
     */
    protected categorizeError(error: unknown): string {
        if (error instanceof Error) {
            if (error.message.includes('TASK_CYCLE')) return 'DEPENDENCY_CYCLE';
            if (error.message.includes('TASK_DEPENDENCY')) return 'DEPENDENCY_VALIDATION';
            if (error.message.includes('TASK_NOT_FOUND')) return 'MISSING_DEPENDENCY';
            if (error.message.includes('VALIDATION')) return 'VALIDATION';
        }
        return 'UNKNOWN';
    }

    /**
     * Check if an error is critical and should stop processing
     */
    protected isCriticalError(error: unknown): boolean {
        const errorType = this.categorizeError(error);
        return ['DEPENDENCY_CYCLE', 'DEPENDENCY_VALIDATION'].includes(errorType);
    }

    /**
     * Check if batch processing should stop based on errors
     */
    protected shouldStopProcessing(result: BatchResult): boolean {
        const criticalErrorCount = result.errors.filter(
            e => this.isCriticalError(e.error)
        ).length;
        
        return criticalErrorCount > 0 || 
               (result.failedCount / (result.processedCount + result.failedCount)) > 0.5;
    }

    /**
     * Delay execution
     */
    protected delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Update batch processor configuration
     */
    updateConfig(config: Partial<BatchConfig>): void {
        this.config = { ...this.config, ...config };
        this.logger.debug('Batch processor configuration updated', { config: this.config });
    }

    /**
     * Get batch processor statistics
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
                retryRate: 0 // Would need to track this during processing
            }
        };
    }
}
