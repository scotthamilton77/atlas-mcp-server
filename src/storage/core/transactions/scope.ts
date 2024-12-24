import { Database } from 'sqlite';
import { Logger } from '../../../logging/index.js';
import { ErrorCodes, createError } from '../../../errors/index.js';

export enum IsolationLevel {
    READ_UNCOMMITTED = 'READ UNCOMMITTED',
    READ_COMMITTED = 'READ COMMITTED',
    REPEATABLE_READ = 'REPEATABLE READ',
    SERIALIZABLE = 'SERIALIZABLE'
}

/**
 * Manages database transaction lifecycle and isolation levels
 * Supports nested transactions through savepoints
 */
export class TransactionScope {
    private static logger: Logger;

    private static getLogger(): Logger {
        if (!TransactionScope.logger) {
            TransactionScope.logger = Logger.getInstance().child({ component: 'TransactionScope' });
        }
        return TransactionScope.logger;
    }
    private depth: number = 0;
    private savepoints: string[] = [];
    private active: boolean = false;

    constructor(private readonly db: Database) {}

    /**
     * Begins a new transaction or creates a savepoint for nested transactions
     */
    async begin(isolationLevel: IsolationLevel = IsolationLevel.SERIALIZABLE): Promise<void> {
        try {
            if (this.depth === 0) {
                // Start new transaction
                await this.db.exec('BEGIN TRANSACTION');
                await this.setIsolationLevel(isolationLevel);
                this.active = true;
            } else {
                // Create savepoint for nested transaction
                const savepoint = `sp_${this.depth}`;
                await this.db.exec(`SAVEPOINT ${savepoint}`);
                this.savepoints.push(savepoint);
            }
            this.depth++;
            
            TransactionScope.getLogger().debug('Transaction started', {
                depth: this.depth,
                isolationLevel
            });
        } catch (error) {
            TransactionScope.getLogger().error('Failed to begin transaction', { error });
            throw createError(
                ErrorCodes.TRANSACTION_ERROR,
                
                'Failed to begin transaction',
                'begin',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Commits the current transaction or savepoint
     */
    async commit(): Promise<void> {
        if (!this.active) {
            throw createError(
                ErrorCodes.TRANSACTION_ERROR,
                'No active transaction'
            );
        }

        try {
            this.depth--;

            if (this.depth === 0) {
                // Commit main transaction
                await this.db.exec('COMMIT');
                this.active = false;
                this.savepoints = [];
            } else {
                // Release savepoint
                const savepoint = this.savepoints.pop();
                await this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
            }

            TransactionScope.getLogger().debug('Transaction committed', {
                remainingDepth: this.depth
            });
        } catch (error) {
            TransactionScope.getLogger().error('Failed to commit transaction', { error });
            throw createError(
                ErrorCodes.TRANSACTION_ERROR,
                'Failed to commit transaction',
                'commit',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Rolls back the current transaction or savepoint
     */
    async rollback(): Promise<void> {
        if (!this.active) {
            return; // No-op if no active transaction
        }

        try {
            if (this.depth === 1) {
                // Rollback main transaction
                await this.db.exec('ROLLBACK');
                this.active = false;
                this.savepoints = [];
            } else {
                // Rollback to savepoint
                const savepoint = this.savepoints.pop();
                await this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            }
            this.depth = Math.max(0, this.depth - 1);

            TransactionScope.getLogger().debug('Transaction rolled back', {
                remainingDepth: this.depth
            });
        } catch (error) {
            TransactionScope.getLogger().error('Failed to rollback transaction', { error });
            throw createError(
                ErrorCodes.TRANSACTION_ERROR,
                'Failed to rollback transaction',
                'rollback',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Executes work within a transaction scope
     * Automatically handles commit/rollback
     */
    async executeInTransaction<T>(
        work: () => Promise<T>,
        isolationLevel: IsolationLevel = IsolationLevel.SERIALIZABLE
    ): Promise<T> {
        await this.begin(isolationLevel);
        try {
            const result = await work();
            await this.commit();
            return result;
        } catch (error) {
            await this.rollback();
            throw error;
        }
    }

    /**
     * Sets the isolation level for the current transaction
     */
    private async setIsolationLevel(level: IsolationLevel): Promise<void> {
        try {
            switch (level) {
                case IsolationLevel.READ_UNCOMMITTED:
                    await this.db.exec('PRAGMA read_uncommitted = 1');
                    break;
                case IsolationLevel.READ_COMMITTED:
                    await this.db.exec('PRAGMA read_uncommitted = 0');
                    break;
                case IsolationLevel.REPEATABLE_READ:
                case IsolationLevel.SERIALIZABLE:
                    // SQLite's default is SERIALIZABLE
                    break;
            }
        } catch (error) {
            TransactionScope.getLogger().error('Failed to set isolation level', {
                error,
                level
            });
            throw error;
        }
    }

    /**
     * Checks if there is an active transaction
     */
    isActive(): boolean {
        return this.active;
    }

    /**
     * Gets the current transaction depth
     */
    getDepth(): number {
        return this.depth;
    }

    /**
     * Ensures no active transaction
     * Used before operations that can't run in a transaction (like VACUUM)
     */
    async ensureNoTransaction(): Promise<void> {
        if (this.active) {
            await this.rollback();
        }
    }
}
