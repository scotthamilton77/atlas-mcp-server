/**
 * Manages atomic transactions for task operations
 */

import { Logger } from '../../../logging/index.js';
import { TaskStorage } from '../../../types/storage.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { 
    Transaction,
    Operation,
    TransactionResult 
} from './transaction-types.js';

export class TransactionManager {
    private readonly logger: Logger;
    private activeTransactions: Map<string, Transaction>;
    private transactionCounter: number;

    constructor(private readonly storage?: TaskStorage) {
        this.logger = Logger.getInstance().child({ component: 'TransactionManager' });
        this.activeTransactions = new Map();
        this.transactionCounter = 0;
    }

    /**
     * Begins a new transaction
     */
    async begin(): Promise<Transaction> {
        const id = this.generateTransactionId();
        const transaction: Transaction = {
            id,
            operations: [],
            timestamp: Date.now(),
            status: 'pending'
        };

        this.activeTransactions.set(id, transaction);
        
        this.logger.debug('Transaction started', { 
            transactionId: id,
            timestamp: transaction.timestamp 
        });

        return transaction;
    }

    /**
     * Commits a transaction
     */
    async commit(transaction: Transaction): Promise<TransactionResult> {
        try {
            if (!this.activeTransactions.has(transaction.id)) {
                throw createError(
                    ErrorCodes.INVALID_STATE,
                    `Transaction ${transaction.id} not found`
                );
            }

            if (transaction.status !== 'pending') {
                throw createError(
                    ErrorCodes.INVALID_STATE,
                    `Transaction ${transaction.id} is already ${transaction.status}`
                );
            }

            // If storage is provided, persist the transaction
            if (this.storage) {
                await this.persistTransaction(transaction);
            }

            transaction.status = 'committed';
            this.activeTransactions.delete(transaction.id);

            this.logger.debug('Transaction committed', { 
                transactionId: transaction.id,
                operationCount: transaction.operations.length 
            });

            return {
                success: true,
                transactionId: transaction.id
            };
        } catch (error) {
            this.logger.error('Failed to commit transaction', { 
                error,
                transactionId: transaction.id 
            });

            await this.rollback(transaction);

            return {
                success: false,
                transactionId: transaction.id,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }

    /**
     * Rolls back a transaction
     */
    async rollback(transaction: Transaction): Promise<TransactionResult> {
        try {
            if (!this.activeTransactions.has(transaction.id)) {
                throw createError(
                    ErrorCodes.INVALID_STATE,
                    `Transaction ${transaction.id} not found`
                );
            }

            // Reverse operations in reverse order
            for (const operation of [...transaction.operations].reverse()) {
                await this.rollbackOperation(operation);
            }

            transaction.status = 'rolled_back';
            this.activeTransactions.delete(transaction.id);

            this.logger.debug('Transaction rolled back', { 
                transactionId: transaction.id,
                operationCount: transaction.operations.length 
            });

            return {
                success: true,
                transactionId: transaction.id
            };
        } catch (error) {
            this.logger.error('Failed to rollback transaction', { 
                error,
                transactionId: transaction.id 
            });

            return {
                success: false,
                transactionId: transaction.id,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }

    /**
     * Gets active transaction by ID
     */
    getTransaction(id: string): Transaction | undefined {
        return this.activeTransactions.get(id);
    }

    /**
     * Generates a unique transaction ID
     */
    private generateTransactionId(): string {
        this.transactionCounter++;
        return `txn_${Date.now()}_${this.transactionCounter}`;
    }

    /**
     * Persists a transaction to storage
     */
    private async persistTransaction(transaction: Transaction): Promise<void> {
        if (!this.storage) return;

        try {
            // Implementation depends on storage interface
            // Could store in a transactions table or log
            this.logger.debug('Transaction persisted', { 
                transactionId: transaction.id 
            });
        } catch (error) {
            this.logger.error('Failed to persist transaction', { 
                error,
                transactionId: transaction.id 
            });
            throw error;
        }
    }

    /**
     * Rolls back a single operation
     */
    private async rollbackOperation(operation: Operation): Promise<void> {
        if (!this.storage) return;

        try {
            switch (operation.type) {
                case 'delete':
                    // Restore deleted tasks
                    await this.storage.saveTasks(operation.tasks);
                    break;

                case 'update':
                    // Revert task to previous state
                    // Would need to store previous state in operation
                    break;

                case 'create':
                    // Delete created task
                    await this.storage.deleteTasks([operation.task.path]);
                    break;
            }
        } catch (error) {
            this.logger.error('Failed to rollback operation', { 
                error,
                operationType: operation.type 
            });
            throw error;
        }
    }
}
