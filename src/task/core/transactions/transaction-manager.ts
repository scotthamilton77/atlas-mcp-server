import { Task } from '../../../types/task.js';
import { Logger } from '../../../logging/index.js';
import { 
    Transaction, 
    TransactionManager, 
    TransactionConfig, 
    TaskOperation, 
    TransactionResult 
} from './transaction-types.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { generateShortId } from '../../../utils/id-generator.js';

const DEFAULT_CONFIG: TransactionConfig = {
    timeout: 30000, // 30 seconds
    maxOperationsPerTransaction: 1000,
    enableRollback: true
};

export class TaskTransactionManager implements TransactionManager {
    private transactions: Map<string, Transaction>;
    private logger: Logger;
    private config: TransactionConfig;
    private activeTimeouts: Map<string, NodeJS.Timeout>;

    constructor(config: Partial<TransactionConfig> = {}) {
        this.transactions = new Map();
        this.activeTimeouts = new Map();
        this.logger = Logger.getInstance().child({ component: 'TaskTransactionManager' });
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Starts a new transaction
     */
    startTransaction(): string {
        const transactionId = generateShortId();
        const transaction: Transaction = {
            id: transactionId,
            operations: [],
            timestamp: new Date().toISOString()
        };

        this.transactions.set(transactionId, transaction);

        // Set transaction timeout
        const timeout = setTimeout(() => {
            this.handleTransactionTimeout(transactionId);
        }, this.config.timeout);

        this.activeTimeouts.set(transactionId, timeout);

        this.logger.debug('Transaction started', { transactionId });
        return transactionId;
    }

    /**
     * Adds an operation to a transaction
     */
    addOperation(transactionId: string, operation: TaskOperation): void {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                { message: 'Transaction not found', transactionId }
            );
        }

        if (transaction.operations.length >= this.config.maxOperationsPerTransaction) {
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                { 
                    message: 'Transaction operation limit exceeded',
                    transactionId,
                    limit: this.config.maxOperationsPerTransaction
                }
            );
        }

        transaction.operations.push(operation);
        this.logger.debug('Operation added to transaction', {
            transactionId,
            operationType: operation.type,
            taskId: operation.task.id
        });
    }

    /**
     * Commits a transaction
     */
    async commitTransaction(transactionId: string): Promise<TransactionResult> {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                { message: 'Transaction not found', transactionId }
            );
        }

        try {
            this.clearTransactionTimeout(transactionId);
            this.transactions.delete(transactionId);

            const affectedTasks = transaction.operations.map(op => op.task.id);
            
            this.logger.info('Transaction committed', {
                transactionId,
                operationCount: transaction.operations.length,
                affectedTasks
            });

            return {
                success: true,
                transactionId,
                affectedTasks
            };
        } catch (error) {
            this.logger.error('Failed to commit transaction', {
                transactionId,
                error
            });

            if (this.config.enableRollback) {
                await this.rollbackTransaction(transactionId);
            }

            throw createError(
                ErrorCodes.OPERATION_FAILED,
                { 
                    message: 'Transaction commit failed',
                    transactionId,
                    error
                }
            );
        }
    }

    /**
     * Rolls back a transaction
     */
    async rollbackTransaction(transactionId: string): Promise<TransactionResult> {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            return {
                success: true,
                transactionId,
                affectedTasks: []
            };
        }

        try {
            this.clearTransactionTimeout(transactionId);

            // Get affected tasks before deleting transaction
            const affectedTasks = transaction.operations.map(op => op.task.id);
            
            // Keep transaction until rollback is complete in TaskStore
            // this.transactions.delete(transactionId);

            this.logger.info('Transaction rolled back', {
                transactionId,
                operationCount: transaction.operations.length,
                affectedTasks
            });

            return {
                success: true,
                transactionId,
                affectedTasks
            };
        } catch (error) {
            this.logger.error('Failed to rollback transaction', {
                transactionId,
                error
            });

            throw createError(
                ErrorCodes.OPERATION_FAILED,
                { 
                    message: 'Transaction rollback failed',
                    transactionId,
                    error
                }
            );
        }
    }

    /**
     * Gets a transaction by ID
     */
    getTransaction(transactionId: string): Transaction | null {
        return this.transactions.get(transactionId) || null;
    }

    /**
     * Checks if a transaction is active
     */
    isActive(transactionId: string): boolean {
        return this.transactions.has(transactionId);
    }

    /**
     * Clears all transactions
     */
    clear(): void {
        // Clear all timeouts
        for (const [transactionId, timeout] of this.activeTimeouts.entries()) {
            clearTimeout(timeout);
            this.activeTimeouts.delete(transactionId);
        }

        this.transactions.clear();
        this.logger.debug('All transactions cleared');
    }

    /**
     * Handles transaction timeout
     */
    private handleTransactionTimeout(transactionId: string): void {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            return;
        }

        this.logger.warn('Transaction timed out', {
            transactionId,
            operationCount: transaction.operations.length
        });

        if (this.config.enableRollback) {
            this.rollbackTransaction(transactionId).catch(error => {
                this.logger.error('Failed to rollback timed out transaction', {
                    transactionId,
                    error
                });
            });
        }

        this.transactions.delete(transactionId);
        this.activeTimeouts.delete(transactionId);
    }

    /**
     * Clears transaction timeout
     */
    private clearTransactionTimeout(transactionId: string): void {
        const timeout = this.activeTimeouts.get(transactionId);
        if (timeout) {
            clearTimeout(timeout);
            this.activeTimeouts.delete(transactionId);
        }
    }

    /**
     * Deletes a transaction after rollback is complete
     */
    deleteTransaction(transactionId: string): void {
        this.transactions.delete(transactionId);
        this.logger.debug('Transaction deleted after rollback', { transactionId });
    }

    /**
     * Gets transaction statistics
     */
    getStats(): {
        activeTransactions: number;
        totalOperations: number;
        averageOperationsPerTransaction: number;
    } {
        const transactions = Array.from(this.transactions.values());
        const totalOperations = transactions.reduce(
            (sum, t) => sum + t.operations.length,
            0
        );

        return {
            activeTransactions: this.transactions.size,
            totalOperations,
            averageOperationsPerTransaction: 
                this.transactions.size > 0 
                    ? totalOperations / this.transactions.size 
                    : 0
        };
    }
}
