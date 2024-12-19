import { Task } from '../../shared/types/task.js';
import { Logger } from '../../logging/index.js';
import { IndexFactory } from './factory.js';
import {
    IndexOperation,
    IndexOperationType,
    IndexResult,
    IndexError,
    IndexErrorType,
    IndexQuery,
    IndexQueryResult
} from './types/entries.js';

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
    atomicOperations: boolean;
    validateBeforeOperation: boolean;
    maxBatchSize: number;
    retryAttempts: number;
    timeoutMs: number;
}

/**
 * Default coordinator configuration
 */
export const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfig = {
    atomicOperations: true,
    validateBeforeOperation: true,
    maxBatchSize: 1000,
    retryAttempts: 3,
    timeoutMs: 5000
};

/**
 * Operation context
 */
interface OperationContext {
    startTime: number;
    retryCount: number;
    metadata: Record<string, unknown>;
}

/**
 * Index coordinator for managing operations across indexes
 */
export class IndexCoordinator {
    private readonly factory: IndexFactory;
    private readonly logger: Logger;
    private readonly config: CoordinatorConfig;
    private readonly operationContexts: Map<string, OperationContext>;

    constructor(factory: IndexFactory, config: Partial<CoordinatorConfig> = {}) {
        this.factory = factory;
        this.config = { ...DEFAULT_COORDINATOR_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'IndexCoordinator' });
        this.operationContexts = new Map();
    }

    /**
     * Add or update a task across all indexes
     */
    async upsert(task: Task): Promise<IndexResult> {
        const operationId = this.generateOperationId();
        this.initializeContext(operationId);

        try {
            // Get indexes
            const primary = this.factory.getPrimaryIndex();
            const status = this.factory.getStatusIndex();
            const hierarchy = this.factory.getHierarchyIndex();

            // Execute operation atomically
            if (this.config.atomicOperations) {
                const results = await Promise.all([
                    this.executeWithRetry(() => primary.upsert(task)),
                    this.executeWithRetry(() => status.upsert(task)),
                    this.executeWithRetry(() => hierarchy.upsert(task))
                ]);

                // Check for failures
                const failed = results.find(result => !result.success);
                if (failed) {
                    await this.rollback(task.id, results);
                    return failed;
                }

                return results[0]; // Return primary index result
            }

            // Execute operation non-atomically
            return await this.executeWithRetry(() => primary.upsert(task));
        } catch (error) {
            this.logger.error('Failed to upsert task', { error, task, operationId });
            throw this.wrapError(error);
        } finally {
            this.cleanupContext(operationId);
        }
    }

    /**
     * Delete a task from all indexes
     */
    async delete(id: string): Promise<IndexResult> {
        const operationId = this.generateOperationId();
        this.initializeContext(operationId);

        try {
            // Get indexes
            const primary = this.factory.getPrimaryIndex();
            const status = this.factory.getStatusIndex();
            const hierarchy = this.factory.getHierarchyIndex();

            // Execute operation atomically
            if (this.config.atomicOperations) {
                const results = await Promise.all([
                    this.executeWithRetry(() => primary.delete(id)),
                    this.executeWithRetry(() => status.delete(id)),
                    this.executeWithRetry(() => hierarchy.delete(id))
                ]);

                // Check for failures
                const failed = results.find(result => !result.success);
                if (failed) {
                    await this.rollback(id, results);
                    return failed;
                }

                return results[0]; // Return primary index result
            }

            // Execute operation non-atomically
            return await this.executeWithRetry(() => primary.delete(id));
        } catch (error) {
            this.logger.error('Failed to delete task', { error, id, operationId });
            throw this.wrapError(error);
        } finally {
            this.cleanupContext(operationId);
        }
    }

    /**
     * Execute batch operations across all indexes
     */
    async batch(operations: IndexOperation[]): Promise<IndexResult[]> {
        const operationId = this.generateOperationId();
        this.initializeContext(operationId);

        try {
            // Validate batch size
            if (operations.length > this.config.maxBatchSize) {
                throw this.createError(
                    IndexErrorType.LIMIT_EXCEEDED,
                    `Batch size exceeds maximum of ${this.config.maxBatchSize}`
                );
            }

            // Get indexes
            const primary = this.factory.getPrimaryIndex();
            const status = this.factory.getStatusIndex();
            const hierarchy = this.factory.getHierarchyIndex();

            // Execute operations atomically
            if (this.config.atomicOperations) {
                const results = await Promise.all([
                    this.executeWithRetry(() => primary.batch(operations)),
                    this.executeWithRetry(() => status.batch(operations)),
                    this.executeWithRetry(() => hierarchy.batch(operations))
                ]);

                // Check for failures
                const failed = results.find(result => 
                    result.some(r => !r.success)
                );
                if (failed) {
                    await this.rollbackBatch(operations, results);
                    return failed;
                }

                return results[0]; // Return primary index results
            }

            // Execute operations non-atomically
            return await this.executeWithRetry(() => primary.batch(operations));
        } catch (error) {
            this.logger.error('Failed to execute batch operations', { error, operations, operationId });
            throw this.wrapError(error);
        } finally {
            this.cleanupContext(operationId);
        }
    }

    /**
     * Query tasks across indexes
     */
    async query(query: IndexQuery): Promise<IndexQueryResult> {
        const operationId = this.generateOperationId();
        this.initializeContext(operationId);

        try {
            // Select appropriate index for query
            const index = this.selectIndexForQuery(query);

            // Execute query with retry
            return await this.executeWithRetry(() => index.query(query));
        } catch (error) {
            this.logger.error('Failed to execute query', { error, query, operationId });
            throw this.wrapError(error);
        } finally {
            this.cleanupContext(operationId);
        }
    }

    /**
     * Clear all indexes
     */
    async clear(): Promise<void> {
        const operationId = this.generateOperationId();
        this.initializeContext(operationId);

        try {
            await this.factory.clearAll();
        } catch (error) {
            this.logger.error('Failed to clear indexes', { error, operationId });
            throw this.wrapError(error);
        } finally {
            this.cleanupContext(operationId);
        }
    }

    /**
     * Get coordinator statistics
     */
    getStats(): Record<string, unknown> {
        return {
            indexes: this.factory.getStats(),
            factory: this.factory.getFactoryStats(),
            config: this.config,
            activeOperations: this.operationContexts.size,
            memoryUsage: process.memoryUsage().heapUsed
        };
    }

    /**
     * Execute operation with retry
     */
    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        attempt = 1
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= this.config.retryAttempts) {
                throw error;
            }

            const delay = Math.min(100 * Math.pow(2, attempt), 1000);
            await new Promise(resolve => setTimeout(resolve, delay));

            return this.executeWithRetry(operation, attempt + 1);
        }
    }

    /**
     * Rollback successful operations
     */
    private async rollback(
        id: string,
        results: IndexResult[]
    ): Promise<void> {
        const indexes = [
            this.factory.getPrimaryIndex(),
            this.factory.getStatusIndex(),
            this.factory.getHierarchyIndex()
        ];

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
        const indexes = [
            this.factory.getPrimaryIndex(),
            this.factory.getStatusIndex(),
            this.factory.getHierarchyIndex()
        ];

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
    private selectIndexForQuery(query: IndexQuery) {
        const { filter } = query;

        if (!filter) {
            return this.factory.getPrimaryIndex();
        }

        if ('status' in filter) {
            return this.factory.getStatusIndex();
        }

        if ('type' in filter) {
            return this.factory.getHierarchyIndex();
        }

        return this.factory.getPrimaryIndex();
    }

    /**
     * Generate operation ID
     */
    private generateOperationId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Initialize operation context
     */
    private initializeContext(operationId: string): void {
        this.operationContexts.set(operationId, {
            startTime: Date.now(),
            retryCount: 0,
            metadata: {}
        });
    }

    /**
     * Cleanup operation context
     */
    private cleanupContext(operationId: string): void {
        this.operationContexts.delete(operationId);
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
 * Create index coordinator instance
 */
export function createIndexCoordinator(
    factory: IndexFactory,
    config?: Partial<CoordinatorConfig>
): IndexCoordinator {
    return new IndexCoordinator(factory, config);
}
