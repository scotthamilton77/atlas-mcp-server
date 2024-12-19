import { Logger } from '../../../logging/index.js';
import {
    Transaction,
    TransactionState,
    TransactionError,
    TransactionErrorType
} from '../types/common.js';

/**
 * Transaction timeout configuration
 */
export interface TimeoutConfig {
    enabled: boolean;
    duration: number;
    retryAttempts: number;
    retryDelay: number;
}

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
    enabled: true,
    duration: 30000, // 30 seconds
    retryAttempts: 3,
    retryDelay: 1000 // 1 second
};

/**
 * Manages transaction timeouts and cleanup
 */
export class TransactionTimeoutManager {
    private timeouts: Map<string, NodeJS.Timeout>;
    private retryAttempts: Map<string, number>;
    private readonly logger: Logger;
    private readonly config: TimeoutConfig;

    constructor(config: Partial<TimeoutConfig> = {}) {
        this.timeouts = new Map();
        this.retryAttempts = new Map();
        this.config = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'TransactionTimeoutManager' });
    }

    /**
     * Start timeout for a transaction
     */
    startTimeout(
        transactionId: string,
        onTimeout: (transactionId: string) => Promise<void>
    ): void {
        if (!this.config.enabled) return;

        // Clear any existing timeout
        this.clearTimeout(transactionId);

        // Set new timeout
        const timeout = setTimeout(async () => {
            await this.handleTimeout(transactionId, onTimeout);
        }, this.config.duration);

        this.timeouts.set(transactionId, timeout);
        this.retryAttempts.set(transactionId, 0);

        this.logger.debug('Transaction timeout started', {
            transactionId,
            duration: this.config.duration
        });
    }

    /**
     * Clear timeout for a transaction
     */
    clearTimeout(transactionId: string): void {
        const timeout = this.timeouts.get(transactionId);
        if (timeout) {
            clearTimeout(timeout);
            this.timeouts.delete(transactionId);
            this.retryAttempts.delete(transactionId);

            this.logger.debug('Transaction timeout cleared', { transactionId });
        }
    }

    /**
     * Handle transaction timeout
     */
    private async handleTimeout(
        transactionId: string,
        onTimeout: (transactionId: string) => Promise<void>
    ): Promise<void> {
        const attempts = this.retryAttempts.get(transactionId) ?? 0;

        try {
            await onTimeout(transactionId);
            this.clearTimeout(transactionId);
        } catch (error) {
            if (attempts < this.config.retryAttempts) {
                // Retry after delay
                this.retryAttempts.set(transactionId, attempts + 1);
                setTimeout(async () => {
                    await this.handleTimeout(transactionId, onTimeout);
                }, this.config.retryDelay);

                this.logger.warn('Transaction timeout retry', {
                    transactionId,
                    attempt: attempts + 1,
                    maxAttempts: this.config.retryAttempts,
                    error
                });
            } else {
                // Max retries reached
                this.clearTimeout(transactionId);
                this.logger.error('Transaction timeout failed', {
                    transactionId,
                    attempts,
                    error
                });
            }
        }
    }

    /**
     * Check if a transaction has timed out
     */
    hasTimedOut(transaction: Transaction): boolean {
        if (!this.config.enabled) return false;

        const startTime = new Date(transaction.startTime).getTime();
        const currentTime = new Date().getTime();
        return currentTime - startTime > this.config.duration;
    }

    /**
     * Create timeout error
     */
    createTimeoutError(transactionId: string): TransactionError {
        return {
            name: 'TransactionError',
            message: 'Transaction timed out',
            type: TransactionErrorType.TIMEOUT,
            transactionId,
            code: 'TRANSACTION_ERROR',
            metadata: {
                error: 'Transaction timed out',
                stack: new Error().stack
            },
            getDetails() {
                return {
                    code: this.code,
                    message: this.message,
                    type: this.type,
                    transactionId: this.transactionId,
                    ...this.metadata
                };
            }
        };
    }

    /**
     * Get timeout statistics
     */
    getStats(): {
        activeTimeouts: number;
        retryingTimeouts: number;
    } {
        return {
            activeTimeouts: this.timeouts.size,
            retryingTimeouts: Array.from(this.retryAttempts.values())
                .filter(attempts => attempts > 0).length
        };
    }
}
