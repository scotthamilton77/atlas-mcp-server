/**
 * Enhanced transaction management with deadlock detection and timeout handling
 */
import { Database } from 'sqlite';
import { Logger } from '../../../logging/index.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { EventManager } from '../../../events/event-manager.js';
import { EventTypes } from '../../../types/events.js';
import crypto from 'crypto';

export interface TransactionOptions {
    timeout?: number;
    isolation?: 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE';
    retryCount?: number;
}

interface ActiveTransaction {
    id: string;
    startTime: number;
    isolation: string;
    timeout: NodeJS.Timeout;
    depth: number;
    connectionId: string;
}

export class TransactionManager {
    private static instance: TransactionManager;
    private readonly logger: Logger;
    private readonly eventManager: EventManager;
    private readonly activeTransactions = new Map<string, ActiveTransaction>();
    private readonly connectionTransactions = new Map<string, Set<string>>();
    private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
    private readonly MAX_RETRIES = 3;

    private constructor() {
        this.logger = Logger.getInstance().child({ component: 'TransactionManager' });
        this.eventManager = EventManager.getInstance();
    }

    static getInstance(): TransactionManager {
        if (!TransactionManager.instance) {
            TransactionManager.instance = new TransactionManager();
        }
        return TransactionManager.instance;
    }

    /**
     * Begin a new transaction with proper isolation and timeout
     */
    async beginTransaction(
        db: Database,
        connectionId: string,
        options: TransactionOptions = {}
    ): Promise<string> {
        const {
            timeout = this.DEFAULT_TIMEOUT,
            isolation = 'IMMEDIATE',
            retryCount = 0
        } = options;

        // Check for existing transaction
        const existingTxs = this.connectionTransactions.get(connectionId);
        if (existingTxs && existingTxs.size > 0) {
            // Return existing transaction ID for nested transaction
            const existingTxId = Array.from(existingTxs)[0];
            const existingTx = this.activeTransactions.get(existingTxId);
            if (existingTx) {
                existingTx.depth++;
                return existingTxId;
            }
        }

        // Generate unique transaction ID
        const txId = crypto.randomUUID();

        try {
            // Start new transaction with specified isolation
            await db.exec(`BEGIN ${isolation}`);

            // Set up transaction timeout
            const timeoutHandle = setTimeout(() => {
                this.handleTransactionTimeout(db, txId, connectionId);
            }, timeout);

            // Record active transaction
            const transaction: ActiveTransaction = {
                id: txId,
                startTime: Date.now(),
                isolation,
                timeout: timeoutHandle,
                depth: 1,
                connectionId
            };

            this.activeTransactions.set(txId, transaction);

            // Track transaction for this connection
            let connectionTxs = this.connectionTransactions.get(connectionId);
            if (!connectionTxs) {
                connectionTxs = new Set();
                this.connectionTransactions.set(connectionId, connectionTxs);
            }
            connectionTxs.add(txId);

            // Emit transaction start event
            this.eventManager.emitSystemEvent({
                type: EventTypes.TRANSACTION_STARTED,
                timestamp: Date.now(),
                metadata: {
                    transactionId: txId,
                    connectionId,
                    isolation
                }
            });

            return txId;
        } catch (error) {
            // Handle deadlock or busy errors with retry
            if (this.isRetryableError(error) && retryCount < this.MAX_RETRIES) {
                this.logger.warn('Transaction start failed, retrying', {
                    error,
                    retryCount,
                    connectionId
                });

                // Exponential backoff
                const delay = Math.min(100 * Math.pow(2, retryCount), 1000);
                await new Promise(resolve => setTimeout(resolve, delay));

                return this.beginTransaction(db, connectionId, {
                    ...options,
                    retryCount: retryCount + 1
                });
            }

            throw this.createTransactionError('Failed to begin transaction', error);
        }
    }

    /**
     * Commit a transaction
     */
    async commitTransaction(
        db: Database,
        txId: string,
        connectionId: string
    ): Promise<void> {
        const transaction = this.activeTransactions.get(txId);
        if (!transaction) {
            throw createError(
                ErrorCodes.TRANSACTION_ERROR,
                'Transaction not found',
                `Transaction ${txId} not found`
            );
        }

        // Handle nested transactions
        if (transaction.depth > 1) {
            transaction.depth--;
            return;
        }

        try {
            await db.exec('COMMIT');

            // Clean up transaction
            this.cleanupTransaction(txId, connectionId);

            // Emit transaction commit event
            this.eventManager.emitSystemEvent({
                type: EventTypes.TRANSACTION_COMMITTED,
                timestamp: Date.now(),
                metadata: {
                    transactionId: txId,
                    connectionId,
                    duration: Date.now() - transaction.startTime
                }
            });
        } catch (error) {
            throw this.createTransactionError('Failed to commit transaction', error);
        }
    }

    /**
     * Rollback a transaction
     */
    async rollbackTransaction(
        db: Database,
        txId: string,
        connectionId: string
    ): Promise<void> {
        const transaction = this.activeTransactions.get(txId);
        if (!transaction) {
            throw createError(
                ErrorCodes.TRANSACTION_ERROR,
                'Transaction not found',
                `Transaction ${txId} not found`
            );
        }

        // Handle nested transactions
        if (transaction.depth > 1) {
            transaction.depth--;
            return;
        }

        try {
            await db.exec('ROLLBACK');

            // Clean up transaction
            this.cleanupTransaction(txId, connectionId);

            // Emit transaction rollback event
            this.eventManager.emitSystemEvent({
                type: EventTypes.TRANSACTION_ROLLED_BACK,
                timestamp: Date.now(),
                metadata: {
                    transactionId: txId,
                    connectionId,
                    duration: Date.now() - transaction.startTime
                }
            });
        } catch (error) {
            throw this.createTransactionError('Failed to rollback transaction', error);
        }
    }

    /**
     * Handle transaction timeout
     */
    private async handleTransactionTimeout(
        db: Database,
        txId: string,
        connectionId: string
    ): Promise<void> {
        const transaction = this.activeTransactions.get(txId);
        if (!transaction) return;

        this.logger.warn('Transaction timeout', {
            transactionId: txId,
            connectionId,
            duration: Date.now() - transaction.startTime
        });

        try {
            await this.rollbackTransaction(db, txId, connectionId);
        } catch (error) {
            this.logger.error('Failed to rollback timed out transaction', {
                error,
                transactionId: txId,
                connectionId
            });
        }

        // Emit timeout event
        this.eventManager.emitSystemEvent({
            type: EventTypes.TRANSACTION_TIMEOUT,
            timestamp: Date.now(),
            metadata: {
                transactionId: txId,
                connectionId,
                duration: Date.now() - transaction.startTime
            }
        });
    }

    /**
     * Clean up transaction resources
     */
    private cleanupTransaction(txId: string, connectionId: string): void {
        const transaction = this.activeTransactions.get(txId);
        if (transaction) {
            clearTimeout(transaction.timeout);
            this.activeTransactions.delete(txId);

            const connectionTxs = this.connectionTransactions.get(connectionId);
            if (connectionTxs) {
                connectionTxs.delete(txId);
                if (connectionTxs.size === 0) {
                    this.connectionTransactions.delete(connectionId);
                }
            }
        }
    }

    /**
     * Check if a connection has active transactions
     */
    hasActiveTransactions(connectionId: string): boolean {
        const transactions = this.connectionTransactions.get(connectionId);
        return transactions ? transactions.size > 0 : false;
    }

    /**
     * Get active transaction count for a connection
     */
    getActiveTransactionCount(connectionId: string): number {
        const transactions = this.connectionTransactions.get(connectionId);
        return transactions ? transactions.size : 0;
    }

    /**
     * Check if error is retryable
     */
    private isRetryableError(error: unknown): boolean {
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            return msg.includes('busy') || 
                   msg.includes('locked') ||
                   msg.includes('deadlock');
        }
        return false;
    }

    /**
     * Create standardized transaction error
     */
    private createTransactionError(message: string, error: unknown): Error {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return createError(
            ErrorCodes.TRANSACTION_ERROR,
            message,
            errorMessage
        );
    }

    /**
     * Clean up all transactions for a connection
     */
    async cleanupConnectionTransactions(
        db: Database,
        connectionId: string
    ): Promise<void> {
        const transactions = this.connectionTransactions.get(connectionId);
        if (!transactions) return;

        for (const txId of transactions) {
            try {
                await this.rollbackTransaction(db, txId, connectionId);
            } catch (error) {
                this.logger.error('Failed to cleanup connection transaction', {
                    error,
                    transactionId: txId,
                    connectionId
                });
            }
        }
    }
}
