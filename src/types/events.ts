/**
 * Event types and interfaces for the Atlas MCP Server
 */

export enum EventTypes {
    // Task events
    TASK_CREATED = 'task.created',
    TASK_UPDATED = 'task.updated',
    TASK_DELETED = 'task.deleted',
    TASK_STATUS_CHANGED = 'task.status_changed',
    TASK_DEPENDENCY_ADDED = 'task.dependency_added',
    TASK_DEPENDENCY_REMOVED = 'task.dependency_removed',

    // Cache events
    CACHE_HIT = 'cache.hit',
    CACHE_MISS = 'cache.miss',
    CACHE_CLEARED = 'cache.cleared',
    CACHE_EVICTED = 'cache.evicted',
    CACHE_INVALIDATED = 'cache.invalidated',
    MEMORY_PRESSURE = 'cache.memory_pressure',

    // Error events
    ERROR_OCCURRED = 'error.occurred',

    // Batch events
    BATCH_STARTED = 'batch.started',
    BATCH_COMPLETED = 'batch.completed',
    BATCH_FAILED = 'batch.failed',

    // Transaction events
    TRANSACTION_STARTED = 'transaction.started',
    TRANSACTION_COMMITTED = 'transaction.committed',
    TRANSACTION_ROLLED_BACK = 'transaction.rolled_back',

    // System events
    SYSTEM_STARTUP = 'system.startup',
    SYSTEM_SHUTDOWN = 'system.shutdown',
    SYSTEM_ERROR = 'system.error',

    // Tool events
    TOOL_STARTED = 'tool.started',
    TOOL_COMPLETED = 'tool.completed',
    TOOL_FAILED = 'tool.failed'
}

export interface BaseEvent {
    type: EventTypes;
    timestamp: number;
    metadata?: Record<string, unknown>;
}

export interface TaskEvent extends BaseEvent {
    type: EventTypes.TASK_CREATED | EventTypes.TASK_UPDATED | EventTypes.TASK_DELETED | EventTypes.TASK_STATUS_CHANGED;
    taskId?: string;  // Optional since some events use task object directly
    task?: unknown;   // Allow task object to be included
    changes?: {
        before?: unknown;
        after?: unknown;
        [key: string]: unknown;
    };
}

export interface CacheEvent extends BaseEvent {
    type: EventTypes.CACHE_HIT | EventTypes.CACHE_MISS | EventTypes.CACHE_CLEARED | EventTypes.CACHE_EVICTED | EventTypes.CACHE_INVALIDATED | EventTypes.MEMORY_PRESSURE;
    key?: string;  // Optional for events like CACHE_CLEARED
    size?: number;
    metadata?: {
        pattern?: string;
        entriesRemaining?: number;
        reason?: string;
        sizeBefore?: number;
        sizeAfter?: number;
        reduction?: number;
        memoryUsage?: {
            heapUsed: number;
            heapTotal: number;
            rss: number;
        };
        threshold?: number;
    };
}

export interface ErrorEvent extends BaseEvent {
    type: EventTypes.ERROR_OCCURRED | EventTypes.SYSTEM_ERROR;
    error: Error;
    context: {
        component: string;
        operation: string;
        [key: string]: unknown;
    };
}

export interface BatchEvent extends BaseEvent {
    type: EventTypes.BATCH_STARTED | EventTypes.BATCH_COMPLETED | EventTypes.BATCH_FAILED;
    batchId: string;
    itemCount: number;
    error?: Error;
}

export interface TransactionEvent extends BaseEvent {
    type: EventTypes.TRANSACTION_STARTED | EventTypes.TRANSACTION_COMMITTED | EventTypes.TRANSACTION_ROLLED_BACK;
    transactionId: string;
    error?: Error;
}

export interface SystemEvent extends BaseEvent {
    type: EventTypes.SYSTEM_STARTUP | EventTypes.SYSTEM_SHUTDOWN | EventTypes.SYSTEM_ERROR | EventTypes.TOOL_STARTED | EventTypes.TOOL_COMPLETED | EventTypes.TOOL_FAILED;
    metadata: {
        tool?: string;
        args?: unknown;
        success?: boolean;
        error?: Error;
        version?: string;
        environment?: string;
        reason?: string;
        memoryUsage?: {
            heapUsed: number;
            heapTotal: number;
            rss: number;
        };
        threshold?: number;
    };
}

export type AtlasEvent = TaskEvent | CacheEvent | ErrorEvent | BatchEvent | TransactionEvent | SystemEvent;

export type EventHandler<T extends AtlasEvent> = (event: T) => void | Promise<void>;

export interface EventSubscription {
    unsubscribe: () => void;
}
