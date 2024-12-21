/**
 * Transaction manager for task operations
 */
import { ErrorCodes, createError } from '../../../errors/index.js';
import { Logger } from '../../../logging/index.js';

export interface TaskOperation {
    type: 'create' | 'update' | 'delete';
    path: string;
    data?: Record<string, unknown>;
}

export interface Transaction {
    id: string;
    operations: TaskOperation[];
    timestamp: number;
    status: 'pending' | 'committed' | 'rolled_back';
}

export class TransactionManager {
    private readonly logger: Logger;
    private readonly transactions: Map<string, Transaction>;
    private readonly maxTransactionAge = 60000; // 1 minute

    constructor() {
        this.logger = Logger.getInstance().child({ component: 'TransactionManager' });
        this.transactions = new Map();

        // Clean up stale transactions periodically
        setInterval(() => this.cleanupStaleTransactions(), this.maxTransactionAge);
    }

    /**
     * Creates a new transaction
     */
    createTransaction(operations: TaskOperation[]): Transaction {
        const id = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const transaction: Transaction = {
            id,
            operations,
            timestamp: Date.now(),
            status: 'pending'
        };

        this.transactions.set(id, transaction);
        this.logger.debug('Created transaction', { id, operations });

        return transaction;
    }

    /**
     * Gets a transaction by ID
     */
    getTransaction(id: string): Transaction | undefined {
        return this.transactions.get(id);
    }

    /**
     * Commits a transaction
     */
    commitTransaction(id: string): void {
        const transaction = this.transactions.get(id);
        if (!transaction) {
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                'Transaction not found'
            );
        }

        if (transaction.status !== 'pending') {
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                'Transaction already finalized'
            );
        }

        transaction.status = 'committed';
        this.logger.debug('Committed transaction', { id });
    }

    /**
     * Rolls back a transaction
     */
    rollbackTransaction(id: string): void {
        const transaction = this.transactions.get(id);
        if (!transaction) {
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                'Transaction not found'
            );
        }

        if (transaction.status !== 'pending') {
            throw createError(
                ErrorCodes.OPERATION_FAILED,
                'Transaction already finalized'
            );
        }

        transaction.status = 'rolled_back';
        this.logger.debug('Rolled back transaction', { id });
    }

    /**
     * Cleans up stale transactions
     */
    private cleanupStaleTransactions(): void {
        const now = Date.now();
        for (const [id, transaction] of this.transactions.entries()) {
            if (transaction.status === 'pending' && now - transaction.timestamp > this.maxTransactionAge) {
                this.rollbackTransaction(id);
                this.transactions.delete(id);
                this.logger.warn('Cleaned up stale transaction', { id });
            }
        }
    }
}
