import { Logger } from '../../../logging/index.js';
import {
    Transaction,
    TransactionState,
    TransactionError,
    TransactionErrorType,
    TransactionParticipant
} from '../types/common.js';
import { SingleTaskOperation } from '../types/operations.js';

/**
 * Rollback configuration
 */
export interface RollbackConfig {
    enabled: boolean;
    retryAttempts: number;
    retryDelay: number;
    parallelRollback: boolean;
    validateAfterRollback: boolean;
}

/**
 * Default rollback configuration
 */
export const DEFAULT_ROLLBACK_CONFIG: RollbackConfig = {
    enabled: true,
    retryAttempts: 3,
    retryDelay: 1000, // 1 second
    parallelRollback: true,
    validateAfterRollback: true
};

/**
 * Rollback result interface
 */
export interface RollbackResult {
    success: boolean;
    restoredState: boolean;
    error?: TransactionError;
    validationErrors?: string[];
}

/**
 * Manages transaction rollbacks and recovery
 */
export class TransactionRollbackManager {
    private rollbacks: Map<string, {
        attempts: number;
        lastAttempt: number;
    }>;
    private readonly logger: Logger;
    private readonly config: RollbackConfig;

    constructor(config: Partial<RollbackConfig> = {}) {
        this.rollbacks = new Map();
        this.config = { ...DEFAULT_ROLLBACK_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'TransactionRollbackManager' });
    }

    /**
     * Rollback a transaction
     */
    async rollbackTransaction(
        transaction: Transaction,
        participants: Map<string, TransactionParticipant>
    ): Promise<RollbackResult> {
        if (!this.config.enabled) {
            return { success: false, restoredState: false };
        }

        const transactionId = transaction.id;
        const rollbackInfo = this.getRollbackInfo(transactionId);

        try {
            // Check if we can rollback
            if (!this.canRollback(transaction)) {
                throw this.createError(
                    TransactionErrorType.INVALID_STATE,
                    'Transaction cannot be rolled back',
                    transactionId
                );
            }

            // Update transaction state
            transaction.state = TransactionState.ROLLING_BACK;

            // Rollback on all participants
            if (this.config.parallelRollback) {
                await this.parallelRollback(participants);
            } else {
                await this.sequentialRollback(participants);
            }

            // Validate state after rollback if enabled
            if (this.config.validateAfterRollback) {
                const validationErrors = await this.validateRollback(transaction, participants);
                if (validationErrors.length > 0) {
                    return {
                        success: false,
                        restoredState: true,
                        validationErrors
                    };
                }
            }

            // Cleanup rollback info
            this.rollbacks.delete(transactionId);

            return { success: true, restoredState: true };
        } catch (error) {
            // Handle rollback failure
            if (rollbackInfo.attempts < this.config.retryAttempts) {
                // Schedule retry
                return await this.retryRollback(
                    transaction,
                    participants,
                    error as Error
                );
            }

            // Max retries reached
            const rollbackError = this.createError(
                TransactionErrorType.ROLLBACK_FAILED,
                'Rollback failed after max retries',
                transactionId,
                error as Error
            );

            return {
                success: false,
                restoredState: false,
                error: rollbackError
            };
        }
    }

    /**
     * Check if transaction can be rolled back
     */
    private canRollback(transaction: Transaction): boolean {
        return transaction.state !== TransactionState.COMMITTED &&
               transaction.state !== TransactionState.ROLLED_BACK;
    }

    /**
     * Parallel rollback on all participants
     */
    private async parallelRollback(
        participants: Map<string, TransactionParticipant>
    ): Promise<void> {
        await Promise.all(
            Array.from(participants.values()).map(participant =>
                participant.rollback()
            )
        );
    }

    /**
     * Sequential rollback on all participants
     */
    private async sequentialRollback(
        participants: Map<string, TransactionParticipant>
    ): Promise<void> {
        for (const participant of participants.values()) {
            await participant.rollback();
        }
    }

    /**
     * Validate state after rollback
     */
    private async validateRollback(
        transaction: Transaction,
        participants: Map<string, TransactionParticipant>
    ): Promise<string[]> {
        const errors: string[] = [];

        // Add validation logic here
        // For example:
        // - Check participant states
        // - Verify data consistency
        // - Check index integrity

        return errors;
    }

    /**
     * Retry rollback after failure
     */
    private async retryRollback(
        transaction: Transaction,
        participants: Map<string, TransactionParticipant>,
        error: Error
    ): Promise<RollbackResult> {
        const transactionId = transaction.id;
        const rollbackInfo = this.getRollbackInfo(transactionId);

        // Update retry info
        rollbackInfo.attempts++;
        rollbackInfo.lastAttempt = Date.now();
        this.rollbacks.set(transactionId, rollbackInfo);

        this.logger.warn('Rollback retry scheduled', {
            transactionId,
            attempt: rollbackInfo.attempts,
            maxAttempts: this.config.retryAttempts,
            error
        });

        // Schedule retry
        return new Promise((resolve) => {
            setTimeout(async () => {
                const result = await this.rollbackTransaction(
                    transaction,
                    participants
                );
                resolve(result);
            }, this.config.retryDelay);
        });
    }

    /**
     * Get rollback info for transaction
     */
    private getRollbackInfo(transactionId: string): {
        attempts: number;
        lastAttempt: number;
    } {
        let info = this.rollbacks.get(transactionId);
        if (!info) {
            info = {
                attempts: 0,
                lastAttempt: Date.now()
            };
            this.rollbacks.set(transactionId, info);
        }
        return info;
    }

    /**
     * Create rollback error
     */
    private createError(
        type: TransactionErrorType,
        message: string,
        transactionId: string,
        cause?: Error
    ): TransactionError {
        return {
            name: 'TransactionError',
            message,
            type,
            transactionId,
            code: 'TRANSACTION_ERROR',
            metadata: {
                error: message,
                cause: cause?.message,
                stack: cause?.stack ?? new Error().stack
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
     * Get rollback statistics
     */
    getStats(): {
        activeRollbacks: number;
        retryingRollbacks: number;
        averageAttempts: number;
    } {
        const rollbacks = Array.from(this.rollbacks.values());
        const totalAttempts = rollbacks.reduce((sum, info) => sum + info.attempts, 0);
        const retrying = rollbacks.filter(info => info.attempts > 0).length;

        return {
            activeRollbacks: this.rollbacks.size,
            retryingRollbacks: retrying,
            averageAttempts: rollbacks.length > 0 
                ? totalAttempts / rollbacks.length 
                : 0
        };
    }
}
