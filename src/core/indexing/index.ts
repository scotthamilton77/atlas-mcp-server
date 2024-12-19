import { Task } from '../../shared/types/task.js';
import { Logger } from '../../logging/index.js';
import { createIndexFactory, IndexFactory } from './factory.js';
import { createIndexService, IndexService, ServiceConfig } from './service.js';
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
import { BaseIndex } from './types/common.js';

/**
 * Indexing system configuration
 */
export interface IndexingConfig {
    service?: Partial<ServiceConfig>;
    factory?: Record<string, unknown>;
}

/**
 * Default indexing configuration
 */
export const DEFAULT_INDEXING_CONFIG: IndexingConfig = {
    service: {},
    factory: {}
};

/**
 * Main indexing system interface
 */
export interface IndexingSystem {
    // Task Operations
    createTask(task: Task): Promise<IndexResult>;
    updateTask(task: Task): Promise<IndexResult>;
    deleteTask(id: string): Promise<IndexResult>;
    batchOperations(operations: IndexOperation[]): Promise<IndexResult[]>;
    queryTasks(query: IndexQuery): Promise<IndexQueryResult>;
    clearTasks(): Promise<void>;

    // Event Management
    addEventListener(listener: (event: IndexEvent) => void | Promise<void>): void;
    removeEventListener(listener: (event: IndexEvent) => void | Promise<void>): void;
    getEventHistory(): IndexEvent[];

    // System Information
    getStats(): Record<string, unknown>;
}

/**
 * Create indexing system instance
 */
export function createIndexingSystem(config: Partial<IndexingConfig> = {}): IndexingSystem {
    const logger = Logger.getInstance().child({ component: 'IndexingSystem' });
    const mergedConfig = { ...DEFAULT_INDEXING_CONFIG, ...config };

    try {
        // Create factory and service
        const factory = createIndexFactory(mergedConfig.factory);
        const service = createIndexService(factory, mergedConfig.service);

        // Return system interface
        return {
            // Task Operations
            createTask: (task: Task) => service.createTask(task),
            updateTask: (task: Task) => service.updateTask(task),
            deleteTask: (id: string) => service.deleteTask(id),
            batchOperations: (operations: IndexOperation[]) => service.batchOperations(operations),
            queryTasks: (query: IndexQuery) => service.queryTasks(query),
            clearTasks: () => service.clearTasks(),

            // Event Management
            addEventListener: (listener) => service.addEventListener(listener),
            removeEventListener: (listener) => service.removeEventListener(listener),
            getEventHistory: () => service.getEventHistory(),

            // System Information
            getStats: () => service.getStats()
        };
    } catch (error) {
        logger.error('Failed to create indexing system', { error, config });
        throw error;
    }
}

// Export types
export {
    IndexOperation,
    IndexOperationType,
    IndexResult,
    IndexError,
    IndexErrorType,
    IndexQuery,
    IndexQueryResult,
    IndexEvent,
    IndexEventType,
    BaseIndex,
    IndexFactory,
    IndexService,
    ServiceConfig
};

// Export factory and service creators
export { createIndexFactory, createIndexService };

// Export index implementations
export { PrimaryIndex } from './indexes/primary.js';
export { StatusIndex, TaskStatus, VALID_STATUS_VALUES } from './indexes/status.js';
export { HierarchyIndex, RelationType } from './indexes/hierarchy.js';
