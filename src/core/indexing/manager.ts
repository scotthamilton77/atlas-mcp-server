import { Task } from '../../shared/types/task.js';
import { Logger } from '../../logging/index.js';
import { IndexFactory, IndexType } from './factory.js';
import {
    IndexOperation,
    IndexOperationType,
    IndexResult,
    IndexError,
    IndexErrorType,
    IndexQuery,
    IndexQueryResult
} from './types/entries.js';
import { BaseIndex } from './types/common.js';

/**
 * Index manager configuration
 */
export interface IndexManagerConfig {
    atomicOperations: boolean;
    validateBeforeIndex: boolean;
    maxBatchSize: number;
    retryAttempts: number;
}

/**
 * Default index manager configuration
 */
export const DEFAULT_INDEX_MANAGER_CONFIG: IndexManagerConfig = {
    atomicOperations: true,
    validateBeforeIndex: true,
    maxBatchSize: 1000,
    retryAttempts: 3
};

/**
 * Index manager for coordinating operations across indexes
 */
export class IndexManager {
    private readonly factory: IndexFactory;
    private readonly logger: Logger;
    private readonly config: IndexManagerConfig;

    constructor(factory: IndexFactory, config: Partial<IndexManagerConfig> = {}) {
        this.factory = factory;
        this.config = { ...DEFAULT_INDEX_MANAGER_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'IndexManager' });
    }

    /**
     * Add or update a task in all indexes
     */
    async upsert(task: Task): Promise<IndexResult> {
        try {
            // Get indexes
            const indexes = this.getIndexes();

            // Execute operation atomically
            if (this.config.atomicOperations) {
                const results = await Promise.all(
                    indexes.map(index => index.upsert(task))
                );

                // Check for failures
                const failed = results.find(result => !result.success);
                if (failed) {
                    // Rollback successful operations
                    await this.rollback(task.id, results);
                    return failed;
                }

                return results[0]; // Return primary index result
            }

            // Execute operation non-atomically
            return await indexes[0].upsert(task);
        } catch (error) {
            this.logger.error('Failed to upsert task', { error, task });
            throw this.wrapError(error);
        }
    }

    /**
     * Delete a task from all indexes
     */
    async delete(id: string): Promise<IndexResult> {
        try {
            // Get indexes
            const indexes = this.getIndexes();

            // Execute operation atomically
            if (this.config.atomicOperations) {
                const results = await Promise.all(
                    indexes.map(index => index.delete(id))
                );

                // Check for failures
                const failed = results.find(result => !result.success);
                if (failed) {
                    // Rollback successful operations
                    await this.rollback(id, results);
                    return failed;
                }

                return results[0]; // Return primary index result
            }

            // Execute operation non-atomically
            return await indexes[0].delete(id);
        } catch (error) {
            this.logger.error('Failed to delete task', { error, id });
            throw this.wrapError(error);
        }
    }

    /**
     * Execute batch operations across all indexes
     */
    async batch(operations: IndexOperation[]): Promise<IndexResult[]> {
        try {
            // Validate batch size
            if (operations.length > this.config.maxBatchSize) {
                throw this.createError(
                    IndexErrorType.LIMIT_EXCEEDED,
                    `Batch size exceeds maximum of ${this.config.maxBatchSize}`
                );
            }

            // Get indexes
            const indexes = this.getIndexes();

            // Execute operations atomically
            if (this.config.atomicOperations) {
                const results = await Promise.all(
                    indexes.map(index => index.batch(operations))
                );

                // Check for failures
                const failed = results.find(result => 
                    result.some(r => !r.success)
                );
                if (failed) {
                    // Rollback successful operations
                    await this.rollbackBatch(operations, results);
                    return failed;
                }

                return results[0]; // Return primary index results
            }

            // Execute operations non-atomically
            return await indexes[0].batch(operations);
        } catch (error) {
            this.logger.error('Failed to execute batch operations', { error, operations });
            throw this.wrapError(error);
        }
    }

    /**
     * Query tasks across indexes
     */
    async query(query: IndexQuery): Promise<IndexQueryResult> {
        try {
            // Determine appropriate index for query
            const index = this.selectIndexForQuery(query);

            // Execute query
            return await index.query(query);
        } catch (error) {
            this.logger.error('Failed to execute query', { error, query });
            throw this.wrapError(error);
        }
    }

    /**
     * Clear all indexes
     */
    async clear(): Promise<void> {
        await this.factory.clearAll();
    }

    /**
     * Get index statistics
     */
    getStats(): Record<string, unknown> {
        return {
            indexes: this.factory.getStats(),
            factory: this.factory.getFactoryStats(),
            config: this.config
        };
    }

    /**
     * Get all indexes
     */
    private getIndexes(): BaseIndex[] {
        return [
            this.factory.getPrimaryIndex(),
            this.factory.getStatusIndex(),
            this.factory.getHierarchyIndex()
        ];
    }

    /**
     * Rollback successful operations
     */
    private async rollback(
        id: string,
        results: IndexResult[]
    ): Promise<void> {
        const indexes = this.getIndexes();
        const rollbackPromises: Promise<void>[] = [];

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.success) {
                rollbackPromises.push(
                    indexes[i].delete(id).then(() => {})
                );
            }
        }

        await Promise.all(rollbackPromises);
    }

    /**
     * Rollback successful batch operations
     */
    private async rollbackBatch(
        operations: IndexOperation[],
        results: IndexResult[][]
    ): Promise<void> {
        const indexes = this.getIndexes();
        const rollbackPromises: Promise<void>[] = [];

        for (let i = 0; i < results.length; i++) {
            const indexResults = results[i];
            const successfulOps = operations.filter(
                (_, index) => indexResults[index]?.success
            );

            if (successfulOps.length > 0) {
                const rollbackOps = successfulOps.map(op => ({
                    type: IndexOperationType.DELETE,
                    key: op.type === IndexOperationType.UPSERT
                        ? (op.value as Task).id
                        : op.key
                }));

                rollbackPromises.push(
                    indexes[i].batch(rollbackOps).then(() => {})
                );
            }
        }

        await Promise.all(rollbackPromises);
    }

    /**
     * Select appropriate index for query
     */
    private selectIndexForQuery(query: IndexQuery): BaseIndex {
        const { filter } = query;
        const indexes = this.getIndexes();

        if (!filter) {
            return indexes[0];
        }

        if ('status' in filter) {
            return indexes[1];
        }

        if ('type' in filter) {
            return indexes[2];
        }

        return indexes[0];
    }

    /**
     * Create index error
     */
    private createError(type: IndexErrorType, message: string): IndexError {
        return {
            type,
            message,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Wrap error in index error
     */
    private wrapError(error: unknown): IndexError {
        if (this.isIndexError(error)) {
            return error;
        }

        return this.createError(
            IndexErrorType.INTERNAL_ERROR,
            error instanceof Error ? error.message : String(error)
        );
    }

    /**
     * Check if error is index error
     */
    private isIndexError(error: unknown): error is IndexError {
        return (
            typeof error === 'object' &&
            error !== null &&
            'type' in error &&
            'message' in error &&
            'timestamp' in error
        );
    }
}

/**
 * Create index manager instance
 */
export function createIndexManager(
    factory: IndexFactory,
    config?: Partial<IndexManagerConfig>
): IndexManager {
    return new IndexManager(factory, config);
}
