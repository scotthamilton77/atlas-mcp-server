import { Task } from '../../../shared/types/task.js';
import {
    IndexOperation,
    IndexResult,
    IndexQuery,
    IndexQueryResult
} from './entries.js';

/**
 * Base index interface
 */
export interface BaseIndex {
    upsert(task: Task): Promise<IndexResult>;
    delete(id: string): Promise<IndexResult>;
    batch(operations: IndexOperation[]): Promise<IndexResult[]>;
    query(query: IndexQuery): Promise<IndexQueryResult>;
    clear(): Promise<void>;
    getStats(): Record<string, unknown>;
}

/**
 * Index configuration interface
 */
export interface BaseIndexConfig {
    validateKeys: boolean;
    maxEntries: number;
    [key: string]: unknown;
}

/**
 * Index operation result
 */
export interface IndexOperationResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: Error;
    metadata?: Record<string, unknown>;
}

/**
 * Index operation context
 */
export interface IndexOperationContext {
    operation: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}

/**
 * Index operation options
 */
export interface IndexOperationOptions {
    atomic?: boolean;
    validate?: boolean;
    retry?: number;
    timeout?: number;
    metadata?: Record<string, unknown>;
}

/**
 * Index query options
 */
export interface IndexQueryOptions {
    limit?: number;
    offset?: number;
    sort?: {
        field: string;
        order: 'asc' | 'desc';
    }[];
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
export interface IndexEvent {
    type: IndexEventType;
    timestamp: string;
    data?: unknown;
    metadata?: Record<string, unknown>;
}

/**
 * Index event handler type
 */
export type IndexEventHandler = (event: IndexEvent) => void | Promise<void>;

/**
 * Index validation result
 */
export interface IndexValidationResult {
    valid: boolean;
    errors?: string[];
    metadata?: Record<string, unknown>;
}

/**
 * Index validation options
 */
export interface IndexValidationOptions {
    strict?: boolean;
    maxErrors?: number;
    metadata?: Record<string, unknown>;
}

/**
 * Index maintenance options
 */
export interface IndexMaintenanceOptions {
    compact?: boolean;
    rebuild?: boolean;
    validate?: boolean;
    backup?: boolean;
    metadata?: Record<string, unknown>;
}

/**
 * Index maintenance result
 */
export interface IndexMaintenanceResult {
    success: boolean;
    operations: string[];
    duration: number;
    metadata?: Record<string, unknown>;
}

/**
 * Index statistics
 */
export interface IndexStats {
    totalEntries: number;
    memoryUsage: number;
    lastUpdated: string;
    metadata?: Record<string, unknown>;
}

/**
 * Index health status
 */
export interface IndexHealth {
    status: 'healthy' | 'degraded' | 'error';
    message?: string;
    lastCheck: string;
    metadata?: Record<string, unknown>;
}
