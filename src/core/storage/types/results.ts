import { StorageError } from './errors.js';

/**
 * Storage result interface
 */
export interface StorageResult<T> {
    /**
     * Operation success flag
     */
    success: boolean;

    /**
     * Operation result data
     */
    data?: T;

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
 * Create successful storage result
 */
export function createSuccessResult<T>(
    data: T,
    metadata: Record<string, unknown> = {}
): StorageResult<T> {
    return {
        success: true,
        data,
        metadata
    };
}

/**
 * Create failed storage result
 */
export function createErrorResult<T>(
    error: StorageError,
    metadata: Record<string, unknown> = {}
): StorageResult<T> {
    return {
        success: false,
        error,
        metadata
    };
}

/**
 * Create empty success result
 */
export function createEmptyResult(
    metadata: Record<string, unknown> = {}
): StorageResult<void> {
    return {
        success: true,
        metadata
    };
}

/**
 * Type guard for storage result
 */
export function isStorageResult<T>(value: unknown): value is StorageResult<T> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'success' in value &&
        typeof (value as StorageResult<T>).success === 'boolean'
    );
}

/**
 * Type guard for successful storage result
 */
export function isSuccessResult<T>(result: StorageResult<T>): result is StorageResult<T> & { data: T } {
    return result.success && result.data !== undefined;
}

/**
 * Type guard for failed storage result
 */
export function isErrorResult<T>(result: StorageResult<T>): result is StorageResult<T> & { error: StorageError } {
    return !result.success && result.error !== undefined;
}
