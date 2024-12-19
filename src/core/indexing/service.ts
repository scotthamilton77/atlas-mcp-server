import { Task } from '../../shared/types/task.js';
import { Logger } from '../../logging/index.js';
import { IndexFactory } from './factory.js';
import { IndexCoordinator } from './coordinator.js';
import {
    IndexOperation,
    IndexOperationType,
    IndexResult,
    IndexError,
    IndexErrorType,
    IndexQuery,
    IndexQueryResult,
    IndexEvent,
    IndexEventType
} from './types/entries.js';

/**
 * Service configuration
 */
export interface ServiceConfig {
    validateTasks: boolean;
    trackEvents: boolean;
    maxEventListeners: number;
    eventTTLMs: number;
}

/**
 * Default service configuration
 */
export const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
    validateTasks: true,
    trackEvents: true,
    maxEventListeners: 100,
    eventTTLMs: 3600000 // 1 hour
};

/**
 * Event listener type
 */
type EventListener = (event: IndexEvent) => void | Promise<void>;

/**
 * Index service for high-level task operations
 */
export class IndexService {
    private readonly coordinator: IndexCoordinator;
    private readonly logger: Logger;
    private readonly config: ServiceConfig;
    private readonly eventListeners: Set<EventListener>;
    private readonly eventHistory: IndexEvent[];

    constructor(
        factory: IndexFactory,
        config: Partial<ServiceConfig> = {}
    ) {
        this.coordinator = new IndexCoordinator(factory);
        this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'IndexService' });
        this.eventListeners = new Set();
        this.eventHistory = [];
    }

    /**
     * Create a new task
     */
    async createTask(task: Task): Promise<IndexResult> {
        try {
            // Validate task
            if (this.config.validateTasks) {
                this.validateTask(task);
            }

            // Execute operation
            const result = await this.coordinator.upsert(task);

            // Emit event
            if (result.success) {
                await this.emitEvent({
                    type: IndexEventType.ENTRY_ADDED,
                    timestamp: new Date().toISOString(),
                    entry: result.entry
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Failed to create task', { error, task });
            throw this.wrapError(error);
        }
    }

    /**
     * Update an existing task
     */
    async updateTask(task: Task): Promise<IndexResult> {
        try {
            // Validate task
            if (this.config.validateTasks) {
                this.validateTask(task);
            }

            // Execute operation
            const result = await this.coordinator.upsert(task);

            // Emit event
            if (result.success) {
                await this.emitEvent({
                    type: IndexEventType.ENTRY_UPDATED,
                    timestamp: new Date().toISOString(),
                    entry: result.entry
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Failed to update task', { error, task });
            throw this.wrapError(error);
        }
    }

    /**
     * Delete a task
     */
    async deleteTask(id: string): Promise<IndexResult> {
        try {
            // Execute operation
            const result = await this.coordinator.delete(id);

            // Emit event
            if (result.success) {
                await this.emitEvent({
                    type: IndexEventType.ENTRY_DELETED,
                    timestamp: new Date().toISOString(),
                    entry: result.entry
                });
            }

            return result;
        } catch (error) {
            this.logger.error('Failed to delete task', { error, id });
            throw this.wrapError(error);
        }
    }

    /**
     * Execute batch operations
     */
    async batchOperations(operations: IndexOperation[]): Promise<IndexResult[]> {
        try {
            // Validate operations
            if (this.config.validateTasks) {
                operations.forEach(op => {
                    if (op.type === IndexOperationType.UPSERT && op.value) {
                        this.validateTask(op.value as Task);
                    }
                });
            }

            // Execute operations
            const results = await this.coordinator.batch(operations);

            // Emit events
            if (this.config.trackEvents) {
                await Promise.all(
                    results.map(async (result, index) => {
                        if (result.success) {
                            const operation = operations[index];
                            await this.emitEvent({
                                type: operation.type === IndexOperationType.DELETE
                                    ? IndexEventType.ENTRY_DELETED
                                    : operation.type === IndexOperationType.UPSERT
                                        ? IndexEventType.ENTRY_UPDATED
                                        : IndexEventType.ENTRY_ADDED,
                                timestamp: new Date().toISOString(),
                                entry: result.entry
                            });
                        }
                    })
                );
            }

            return results;
        } catch (error) {
            this.logger.error('Failed to execute batch operations', { error, operations });
            throw this.wrapError(error);
        }
    }

    /**
     * Query tasks
     */
    async queryTasks(query: IndexQuery): Promise<IndexQueryResult> {
        try {
            return await this.coordinator.query(query);
        } catch (error) {
            this.logger.error('Failed to query tasks', { error, query });
            throw this.wrapError(error);
        }
    }

    /**
     * Clear all tasks
     */
    async clearTasks(): Promise<void> {
        try {
            await this.coordinator.clear();

            // Emit event
            await this.emitEvent({
                type: IndexEventType.INDEX_CLEARED,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to clear tasks', { error });
            throw this.wrapError(error);
        }
    }

    /**
     * Add event listener
     */
    addEventListener(listener: EventListener): void {
        if (this.eventListeners.size >= this.config.maxEventListeners) {
            throw this.createError(
                IndexErrorType.LIMIT_EXCEEDED,
                'Maximum number of event listeners exceeded'
            );
        }
        this.eventListeners.add(listener);
    }

    /**
     * Remove event listener
     */
    removeEventListener(listener: EventListener): void {
        this.eventListeners.delete(listener);
    }

    /**
     * Get event history
     */
    getEventHistory(): IndexEvent[] {
        return [...this.eventHistory];
    }

    /**
     * Get service statistics
     */
    getStats(): Record<string, unknown> {
        return {
            coordinator: this.coordinator.getStats(),
            config: this.config,
            eventListeners: this.eventListeners.size,
            eventHistory: this.eventHistory.length,
            memoryUsage: process.memoryUsage().heapUsed
        };
    }

    /**
     * Validate task
     */
    private validateTask(task: Task): void {
        if (!task) {
            throw this.createError(
                IndexErrorType.INVALID_VALUE,
                'Task cannot be null'
            );
        }

        if (!task.id) {
            throw this.createError(
                IndexErrorType.INVALID_VALUE,
                'Task ID is required'
            );
        }

        // Add additional validation as needed
    }

    /**
     * Emit event
     */
    private async emitEvent(event: IndexEvent): Promise<void> {
        if (!this.config.trackEvents) {
            return;
        }

        // Add to history
        this.eventHistory.push(event);

        // Clean up old events
        const now = Date.now();
        while (
            this.eventHistory.length > 0 &&
            now - new Date(this.eventHistory[0].timestamp).getTime() > this.config.eventTTLMs
        ) {
            this.eventHistory.shift();
        }

        // Notify listeners
        const promises = Array.from(this.eventListeners)
            .map(listener => Promise.resolve().then(() => listener(event)));

        await Promise.all(promises);
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
 * Create index service instance
 */
export function createIndexService(
    factory: IndexFactory,
    config?: Partial<ServiceConfig>
): IndexService {
    return new IndexService(factory, config);
}
