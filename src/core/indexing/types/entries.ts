/**
 * Index entry interface
 */
export interface IndexEntry<T = unknown> {
    key: string;
    value: T;
    metadata: {
        createdAt: string;
        updatedAt: string;
        version: number;
        [key: string]: unknown;
    };
}

/**
 * Index operation types
 */
export enum IndexOperationType {
    UPSERT = 'upsert',
    DELETE = 'delete',
    GET = 'get',
    QUERY = 'query',
    BATCH = 'batch'
}

/**
 * Index operation interface
 */
export interface IndexOperation<T = unknown> {
    type: IndexOperationType;
    key?: string;
    value?: T;
    metadata?: Record<string, unknown>;
}

/**
 * Index result interface
 */
export interface IndexResult<T = unknown> {
    success: boolean;
    operation: IndexOperationType;
    entry?: IndexEntry<T>;
    entries?: IndexEntry<T>[];
    error?: IndexError;
    metadata?: Record<string, unknown>;
}

/**
 * Index error types
 */
export enum IndexErrorType {
    NOT_FOUND = 'not_found',
    INVALID_KEY = 'invalid_key',
    INVALID_VALUE = 'invalid_value',
    INVALID_OPERATION = 'invalid_operation',
    LIMIT_EXCEEDED = 'limit_exceeded',
    INTERNAL_ERROR = 'internal_error',
    VALIDATION_ERROR = 'validation_error',
    CONCURRENCY_ERROR = 'concurrency_error'
}

/**
 * Index error interface
 */
export interface IndexError {
    type: IndexErrorType;
    message: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}

/**
 * Index query interface
 */
export interface IndexQuery {
    filter?: Record<string, unknown>;
    sort?: {
        field: string;
        order: 'asc' | 'desc';
    }[];
    limit?: number;
    offset?: number;
    metadata?: Record<string, unknown>;
}

/**
 * Index query result interface
 */
export interface IndexQueryResult<T = unknown> extends IndexResult<T> {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
}

/**
 * Index batch result interface
 */
export interface IndexBatchResult<T = unknown> extends IndexResult<T> {
    results: IndexResult<T>[];
    failedOperations: IndexOperation<T>[];
}

/**
 * Index statistics interface
 */
export interface IndexStats {
    totalEntries: number;
    memoryUsage: number;
    averageKeyLength: number;
    lastUpdated: string;
    metadata?: Record<string, unknown>;
}

/**
 * Index configuration interface
 */
export interface IndexConfig {
    caseSensitive: boolean;
    validateKeys: boolean;
    maxKeyLength: number;
    maxEntries: number;
    metadata?: Record<string, unknown>;
}

/**
 * Index event types
 */
export enum IndexEventType {
    ENTRY_ADDED = 'entry_added',
    ENTRY_UPDATED = 'entry_updated',
    ENTRY_DELETED = 'entry_deleted',
    INDEX_CLEARED = 'index_cleared',
    ERROR = 'error'
}

/**
 * Index event interface
 */
export interface IndexEvent<T = unknown> {
    type: IndexEventType;
    timestamp: string;
    entry?: IndexEntry<T>;
    error?: IndexError;
    metadata?: Record<string, unknown>;
}

/**
 * Index event handler type
 */
export type IndexEventHandler<T = unknown> = (event: IndexEvent<T>) => void | Promise<void>;

/**
 * Index validation error interface
 */
export interface IndexValidationError extends IndexError {
    type: IndexErrorType.VALIDATION_ERROR;
    field: string;
    constraint: string;
    expected?: unknown;
    actual?: unknown;
}

/**
 * Index concurrency error interface
 */
export interface IndexConcurrencyError extends IndexError {
    type: IndexErrorType.CONCURRENCY_ERROR;
    conflictingEntry?: IndexEntry;
    expectedVersion?: number;
    actualVersion?: number;
}
