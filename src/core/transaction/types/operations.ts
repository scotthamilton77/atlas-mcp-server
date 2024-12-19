import { Task } from '../../../shared/types/task.js';

/**
 * Transaction operation types
 */
export const TransactionOperationType = {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    BATCH: 'batch'
} as const;

export type TransactionOperationType = typeof TransactionOperationType[keyof typeof TransactionOperationType];

/**
 * Base transaction operation interface
 */
export interface BaseOperation {
    /**
     * Operation ID
     */
    id: string;

    /**
     * Operation type
     */
    type: TransactionOperationType;

    /**
     * Operation timestamp
     */
    timestamp: Date;

    /**
     * Operation metadata
     */
    metadata?: Record<string, unknown>;
}

/**
 * Create task operation
 */
export interface CreateTaskOperation extends BaseOperation {
    type: typeof TransactionOperationType.CREATE;
    task: Task;
}

/**
 * Update task operation
 */
export interface UpdateTaskOperation extends BaseOperation {
    type: typeof TransactionOperationType.UPDATE;
    task: Task;
}

/**
 * Delete task operation
 */
export interface DeleteTaskOperation extends BaseOperation {
    type: typeof TransactionOperationType.DELETE;
    task: Task;
}

/**
 * Single task operation type
 */
export type SingleTaskOperation = CreateTaskOperation | UpdateTaskOperation | DeleteTaskOperation;

/**
 * Batch task operation
 */
export interface BatchTaskOperation extends BaseOperation {
    type: typeof TransactionOperationType.BATCH;
    operations: SingleTaskOperation[];
}

/**
 * Transaction operation type
 */
export type TransactionOperation = SingleTaskOperation | BatchTaskOperation;

/**
 * Create task operation
 */
export function createTaskOperation(task: Task, metadata?: Record<string, unknown>): CreateTaskOperation {
    return {
        id: generateOperationId(),
        type: TransactionOperationType.CREATE,
        task,
        timestamp: new Date(),
        metadata
    };
}

/**
 * Update task operation
 */
export function updateTaskOperation(task: Task, metadata?: Record<string, unknown>): UpdateTaskOperation {
    return {
        id: generateOperationId(),
        type: TransactionOperationType.UPDATE,
        task,
        timestamp: new Date(),
        metadata
    };
}

/**
 * Delete task operation
 */
export function deleteTaskOperation(task: Task, metadata?: Record<string, unknown>): DeleteTaskOperation {
    return {
        id: generateOperationId(),
        type: TransactionOperationType.DELETE,
        task,
        timestamp: new Date(),
        metadata
    };
}

/**
 * Create batch operation
 */
export function batchOperation(operations: SingleTaskOperation[], metadata?: Record<string, unknown>): BatchTaskOperation {
    return {
        id: generateOperationId(),
        type: TransactionOperationType.BATCH,
        operations,
        timestamp: new Date(),
        metadata
    };
}

/**
 * Generate operation ID
 */
function generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Type guard for single task operation
 */
export function isSingleTaskOperation(operation: TransactionOperation): operation is SingleTaskOperation {
    return operation.type !== TransactionOperationType.BATCH;
}

/**
 * Type guard for batch operation
 */
export function isBatchOperation(operation: TransactionOperation): operation is BatchTaskOperation {
    return operation.type === TransactionOperationType.BATCH;
}

/**
 * Type guard for create operation
 */
export function isCreateOperation(operation: TransactionOperation): operation is CreateTaskOperation {
    return operation.type === TransactionOperationType.CREATE;
}

/**
 * Type guard for update operation
 */
export function isUpdateOperation(operation: TransactionOperation): operation is UpdateTaskOperation {
    return operation.type === TransactionOperationType.UPDATE;
}

/**
 * Type guard for delete operation
 */
export function isDeleteOperation(operation: TransactionOperation): operation is DeleteTaskOperation {
    return operation.type === TransactionOperationType.DELETE;
}
