import { Task } from '../../../shared/types/task.js';
import { StorageError } from '../../storage/types/errors.js';
import { StorageResult } from '../../storage/types/results.js';
import { TransactionState } from './common.js';
import { 
    TransactionOperation,
    SingleTaskOperation,
    CreateTaskOperation,
    UpdateTaskOperation,
    DeleteTaskOperation,
    BatchTaskOperation,
    isSingleTaskOperation,
    isBatchOperation
} from './operations.js';

/**
 * Transaction result interface
 */
export interface TransactionResult<T> extends StorageResult<T> {
    /**
     * Transaction state
     */
    state?: TransactionState;

    /**
     * Operation results
     */
    operations?: OperationResult[];

    /**
     * Transaction metadata
     */
    metadata?: Record<string, unknown>;
}

/**
 * Operation result interface
 */
export interface OperationResult {
    /**
     * Operation ID
     */
    id: string;

    /**
     * Operation success flag
     */
    success: boolean;

    /**
     * Operation result data
     */
    data?: Task;

    /**
     * Operation error
     */
    error?: StorageError;

    /**
     * Operation metadata
     */
    metadata?: Record<string, unknown>;
}

/**
 * Create successful transaction result
 */
export function createSuccessTransactionResult<T>(
    data: T,
    state: TransactionState,
    operations: OperationResult[] = [],
    metadata: Record<string, unknown> = {}
): TransactionResult<T> {
    return {
        success: true,
        data,
        state,
        operations,
        metadata
    };
}

/**
 * Create failed transaction result
 */
export function createErrorTransactionResult<T>(
    error: StorageError,
    state: TransactionState,
    operations: OperationResult[] = [],
    metadata: Record<string, unknown> = {}
): TransactionResult<T> {
    return {
        success: false,
        error,
        state,
        operations,
        metadata
    };
}

/**
 * Create operation result
 */
export function createOperationResult(
    operation: TransactionOperation,
    success: boolean,
    data?: Task,
    error?: StorageError,
    metadata: Record<string, unknown> = {}
): OperationResult {
    return {
        id: operation.id,
        success,
        data,
        error,
        metadata: {
            ...operation.metadata,
            ...metadata
        }
    };
}

/**
 * Type guard for transaction result
 */
export function isTransactionResult<T>(value: unknown): value is TransactionResult<T> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'success' in value &&
        typeof (value as TransactionResult<T>).success === 'boolean'
    );
}

/**
 * Type guard for successful transaction result
 */
export function isSuccessTransactionResult<T>(
    result: TransactionResult<T>
): result is TransactionResult<T> & { data: T } {
    return result.success && result.data !== undefined;
}

/**
 * Type guard for failed transaction result
 */
export function isErrorTransactionResult<T>(
    result: TransactionResult<T>
): result is TransactionResult<T> & { error: StorageError } {
    return !result.success && result.error !== undefined;
}

/**
 * Type guard for operation result
 */
export function isOperationResult(value: unknown): value is OperationResult {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        'success' in value &&
        typeof (value as OperationResult).success === 'boolean'
    );
}
