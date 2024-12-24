/**
 * System event types and interfaces
 */
import { MonitoringMetrics } from './storage.js';

// Base event type
export type AtlasEvent = SystemEvent | TaskEvent | CacheEvent | ErrorEvent | TransactionEvent | BatchEvent;

// Event handler types
export type EventHandler<T extends AtlasEvent> = (event: T) => void | Promise<void>;

export interface EventSubscription {
    unsubscribe: () => void;
}

// Transaction event interface
export interface TransactionEvent {
    type: EventTypes;
    timestamp: number;
    transactionId: string;
    metadata?: Record<string, unknown>;
}

// Batch event interface
export interface BatchEvent {
    type: EventTypes;
    timestamp: number;
    batchId: string;
    metadata?: Record<string, unknown>;
}

export enum EventTypes {
    // System events
    SYSTEM_STARTUP = 'system_startup',
    SYSTEM_SHUTDOWN = 'system_shutdown',
    SYSTEM_ERROR = 'system_error',

    // Tool events
    TOOL_STARTED = 'tool_started',
    TOOL_COMPLETED = 'tool_completed',
    TOOL_FAILED = 'tool_failed',

    // Storage events
    STORAGE_WAL_ENABLED = 'storage_wal_enabled',
    STORAGE_WAL_CHECKPOINT = 'storage_wal_checkpoint',
    STORAGE_VACUUM = 'storage_vacuum',
    STORAGE_ANALYZE = 'storage_analyze',

    // Transaction events
    TRANSACTION_STARTED = 'transaction_started',
    TRANSACTION_COMMITTED = 'transaction_committed',
    TRANSACTION_ROLLED_BACK = 'transaction_rolled_back',
    TRANSACTION_TIMEOUT = 'transaction_timeout',
    TRANSACTION_ERROR = 'transaction_error',

    // Task events
    TASK_CREATED = 'task_created',
    TASK_UPDATED = 'task_updated',
    TASK_DELETED = 'task_deleted',
    TASK_STATUS_CHANGED = 'task_status_changed',

    // Cache events
    MEMORY_PRESSURE = 'memory_pressure',
    CACHE_CLEARED = 'cache_cleared',
    CACHE_INVALIDATED = 'cache_invalidated'
}

export interface SystemEventMetadata {
    // Tool execution
    tool?: string;
    args?: unknown;
    success?: boolean;
    error?: Error;

    // System info
    version?: string;
    environment?: string;
    component?: string;
    operation?: string;
    reason?: string;

    // Resource usage
    memoryUsage?: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
    };
    threshold?: number;

    // Transaction info
    transactionId?: string;
    connectionId?: string;
    isolation?: string;
    duration?: number;

    // Storage info
    dbPath?: string;
    checkpointCount?: number;
    walMode?: boolean;
    metrics?: MonitoringMetrics;
    unhealthyConnections?: string[];
    healthStatus?: {
        isHealthy: boolean;
        errorCount: number;
        avgResponseTime: number;
    };
}

export interface SystemEvent {
    type: EventTypes;
    timestamp: number;
    metadata?: SystemEventMetadata;
}

export interface ErrorEvent {
    type: EventTypes.SYSTEM_ERROR;
    timestamp: number;
    error: Error;
    context?: {
        component: string;
        operation: string;
        args?: unknown;
    };
}

export interface TaskEvent {
    type: EventTypes;
    timestamp: number;
    taskId: string;
    task: unknown;
    metadata?: Record<string, unknown>;
    changes?: {
        before: unknown;
        after: unknown;
    };
}

export interface CacheEvent {
    type: EventTypes;
    timestamp: number;
    metadata: {
        memoryUsage: {
            heapUsed: number;
            heapTotal: number;
            rss: number;
        };
        threshold: number;
    };
}
