import { Task } from './task.js';

export enum EventTypes {
  // Task Events
  TASK_CREATED = 'task:created',
  TASK_UPDATED = 'task:updated',
  TASK_DELETED = 'task:deleted',
  TASK_STATUS_CHANGED = 'task:status:changed',
  
  // Cache Events
  CACHE_INVALIDATED = 'cache:invalidated',
  CACHE_CLEARED = 'cache:cleared',
  CACHE_PRESSURE = 'cache:pressure',
  
  // System Events
  ERROR_OCCURRED = 'error:occurred',
  MEMORY_PRESSURE = 'memory:pressure',
  STORAGE_ERROR = 'storage:error',
  
  // Batch Events
  BATCH_STARTED = 'batch:started',
  BATCH_COMPLETED = 'batch:completed',
  BATCH_FAILED = 'batch:failed',
  
  // Transaction Events
  TRANSACTION_STARTED = 'transaction:started',
  TRANSACTION_COMMITTED = 'transaction:committed',
  TRANSACTION_ROLLED_BACK = 'transaction:rolled_back'
}

export interface BaseEvent {
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface TaskEvent extends BaseEvent {
  type: Extract<
    EventTypes,
    | EventTypes.TASK_CREATED
    | EventTypes.TASK_UPDATED
    | EventTypes.TASK_DELETED
    | EventTypes.TASK_STATUS_CHANGED
  >;
  task: Task;
  changes?: {
    before?: Partial<Task>;
    after?: Partial<Task>;
  };
}

export interface CacheEvent extends BaseEvent {
  type: Extract<
    EventTypes,
    | EventTypes.CACHE_INVALIDATED
    | EventTypes.CACHE_CLEARED
    | EventTypes.CACHE_PRESSURE
  >;
  metadata: {
    reason?: string;
    memoryUsage?: number;
    cacheSize?: number;
    threshold?: number;
    pattern?: string;
    entriesRemaining?: number;
    sizeBefore?: number;
    sizeAfter?: number;
    reduction?: number;
  };
}

export interface ErrorEvent extends BaseEvent {
  type: Extract<
    EventTypes,
    EventTypes.ERROR_OCCURRED | EventTypes.STORAGE_ERROR
  >;
  error: Error;
  context?: {
    operation?: string;
    component?: string;
    [key: string]: unknown;
  };
}

export interface BatchEvent extends BaseEvent {
  type: Extract<
    EventTypes,
    | EventTypes.BATCH_STARTED
    | EventTypes.BATCH_COMPLETED
    | EventTypes.BATCH_FAILED
  >;
  batchId: string;
  itemCount: number;
  metadata: {
    processingTime?: number;
    successCount?: number;
    errorCount?: number;
    errors?: Error[];
  };
}

export interface TransactionEvent extends BaseEvent {
  type: Extract<
    EventTypes,
    | EventTypes.TRANSACTION_STARTED
    | EventTypes.TRANSACTION_COMMITTED
    | EventTypes.TRANSACTION_ROLLED_BACK
  >;
  transactionId: string;
  metadata: {
    operation?: string;
    duration?: number;
    error?: Error;
  };
}

export interface SystemEvent extends BaseEvent {
  type: Extract<EventTypes, EventTypes.MEMORY_PRESSURE>;
  metadata: {
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
    };
    threshold: number;
  };
}

export type AtlasEvent =
  | TaskEvent
  | CacheEvent
  | ErrorEvent
  | BatchEvent
  | TransactionEvent
  | SystemEvent;

export interface EventHandler<T extends AtlasEvent = AtlasEvent> {
  (event: T): void | Promise<void>;
}

export interface EventSubscription {
  unsubscribe(): void;
}
