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
     * Maximum number of retry attempts for transaction conflicts
     */
    private readonly MAX_RETRIES = 3;

    /**
     * Delay between retry attempts (in milliseconds)
     */
    private readonly RETRY_DELAY = 100;

    /**
     * Commits a transaction with retry logic for handling conflicts
     */
    async commitTransaction(transactionId: string): Promise<TransactionResult> {
        let retryCount = 0;
        
        while (retryCount < this.MAX_RETRIES) {
            try {
                return await this.attemptCommit(transactionId, retryCount);
            } catch (error) {
                if (this.isTransactionConflict(error) && retryCount < this.MAX_RETRIES - 1) {
                    retryCount++;
                    this.logger.warn('Transaction conflict detected, retrying...', {
                        transactionId,
                        retryCount,
                        error
                    });
                    await this.delay(this.RETRY_DELAY * retryCount);
                    continue;
                }
                throw this.enhanceError(error, transactionId);
            }
        }

        throw createError(
            ErrorCodes.OPERATION_FAILED,
            {
                message: 'Transaction failed after maximum retry attempts',
                transactionId,
                maxRetries: this.MAX_RETRIES
            }
        );
    }

    /**
     * Attempts to commit a transaction
     */
    private async attemptCommit(transactionId: string, retryCount: number): Promise<TransactionResult> {
        const transaction = this.transactions.get(transactionId);
        if (!transaction) {
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                { 
                    message: 'Transaction not found or already completed',
                    transactionId 
                }
            );
        }

        try {
            this.clearTransactionTimeout(transactionId);
            
            // Group operations by type for better batching
            const groupedOps = this.groupOperations(transaction.operations);
            
            // Process operations in optimal order
            await this.processOperations(groupedOps, transactionId);
            
            this.transactions.delete(transactionId);

            const affectedTasks = transaction.operations.map(op => op.task.id);
            
            this.logger.info('Transaction committed successfully', {
                transactionId,
                operationCount: transaction.operations.length,
                retryCount,
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
                retryCount,
                error
            });

            if (this.config.enableRollback) {
                await this.rollbackTransaction(transactionId);
            }

            throw error;
        }
    }

    /**
     * Groups operations by type for efficient processing
     */
    private groupOperations(operations: TaskOperation[]): Map<string, TaskOperation[]> {
        const groups = new Map<string, TaskOperation[]>();
        for (const op of operations) {
            const existing = groups.get(op.type) || [];
            existing.push(op);
            groups.set(op.type, existing);
        }
        return groups;
    }

    /**
     * Processes grouped operations in optimal order
     */
    private async processOperations(
        groups: Map<string, TaskOperation[]>,
        transactionId: string
    ): Promise<void> {
        // Process creates first, then updates, then deletes
        const order = ['create', 'update', 'delete'];
        for (const type of order) {
            const ops = groups.get(type);
            if (ops && ops.length > 0) {
                await this.processBatch(ops, transactionId);
            }
        }
    }

    /**
     * Processes a batch of operations
     */
    private async processBatch(
        operations: TaskOperation[],
        transactionId: string
    ): Promise<void> {
        // Implementation would depend on the specific storage layer
        // This is where you'd implement batch processing logic
        this.logger.debug('Processing operation batch', {
            transactionId,
            operationType: operations[0].type,
            batchSize: operations.length
        });
    }

    /**
     * Checks if an error is a transaction conflict
     */
    private isTransactionConflict(error: unknown): boolean {
        return error instanceof Error && 
               error.message.includes('SQLITE_ERROR: cannot start a transaction within a transaction');
    }

    /**
     * Enhances error with more context
     */
    private enhanceError(error: unknown, transactionId: string): Error {
        if (this.isTransactionConflict(error)) {
            return createError(
                ErrorCodes.OPERATION_FAILED,
                {
                    message: 'Transaction conflict detected. This usually happens when trying to perform multiple operations simultaneously. Try:\n' +
                            '1. Using bulk operations instead of multiple individual operations\n' +
                            '2. Ensuring operations are properly sequenced\n' +
                            '3. Reducing the number of concurrent operations',
                    transactionId,
                    originalError: error
                }
            );
        }
        return error instanceof Error ? error : new Error(String(error));
    }

    /**
     * Delays execution for specified milliseconds
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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
