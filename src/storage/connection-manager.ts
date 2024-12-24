/**
 * Database connection manager
 */
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';

export class ConnectionManager {
    private readonly logger: Logger;
    private readonly maxRetries: number;
    private readonly retryDelay: number;
    private readonly busyTimeout: number;

    constructor(options: {
        maxRetries?: number;
        retryDelay?: number;
        busyTimeout?: number;
    } = {}) {
        this.logger = Logger.getInstance().child({ component: 'ConnectionManager' });
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.busyTimeout = options.busyTimeout || 5000;
    }

    /**
     * Executes a database operation with retries
     */
    async executeWithRetry<T>(
        operation: () => Promise<T>,
        context: string
    ): Promise<T> {
        let lastError: Error | undefined;
        let retryCount = 0;

        while (retryCount < this.maxRetries) {
            try {
                const result = await operation();
                // Operation succeeded
                if (retryCount > 0) {
                    this.logger.info(`Operation succeeded after ${retryCount} retries`, {
                        context
                    });
                }
                return result;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                retryCount++;

                // Log detailed error info
                const errorDetails = lastError instanceof Error ? {
                    name: lastError.name,
                    message: lastError.message,
                    code: (lastError as any).code,
                    errno: (lastError as any).errno
                } : lastError;

                this.logger.warn(`Operation failed${retryCount < this.maxRetries ? ', retrying' : ''}`, {
                    attempt: retryCount,
                    maxRetries: this.maxRetries,
                    error: errorDetails,
                    context
                });

                // Check if error is WAL-related
                const isWalError = lastError instanceof Error && 
                    (lastError.message.includes('WAL') || 
                     lastError.message.includes('journal_mode') ||
                     lastError.message.includes('Safety level'));

                if (retryCount < this.maxRetries) {
                    // Longer delay for WAL-related errors
                    const baseDelay = isWalError ? 1000 : this.retryDelay;
                    const delay = Math.min(
                        baseDelay * Math.pow(2, retryCount - 1) * (0.5 + Math.random()),
                        isWalError ? 10000 : 5000 // Higher cap for WAL errors
                    );
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All retries failed
        throw createError(
            ErrorCodes.STORAGE_ERROR,
            'Operation failed',
            `Failed after ${this.maxRetries} retries: ${lastError?.message}`,
            lastError?.message
        );
    }

    /**
     * Handles database busy state
     */
    async handleBusy(
        operation: () => Promise<void>,
        context: string
    ): Promise<void> {
        const startTime = Date.now();

        while (true) {
            try {
                await operation();
                return;
            } catch (error) {
                const elapsed = Date.now() - startTime;
                if (elapsed >= this.busyTimeout) {
                    throw createError(
                        ErrorCodes.STORAGE_ERROR,
                        'Operation timed out',
                        `Timed out after ${elapsed}ms: ${error instanceof Error ? error.message : String(error)}`
                    );
                }

                this.logger.warn('Database busy, waiting...', {
                    elapsed,
                    timeout: this.busyTimeout,
                    context
                });

                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }
}
