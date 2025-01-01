/**
 * System event types and interfaces
 */
import { MonitoringMetrics } from './storage.js';
import { Task, TaskStatus } from './task.js';

// Base event interface with common properties
export interface BaseEvent {
  type: EventTypes;
  timestamp: number;
  retryCount?: number;
}

// Event handler types
export type EventHandler<T extends AtlasEvent> = (event: T) => void | Promise<void>;

export interface EventSubscription {
  unsubscribe: () => void;
  type: EventTypes | '*';
  createdAt: number;
}

export interface EventHandlerOptions {
  timeout?: number;
  maxRetries?: number;
  batchOptions?: {
    enabled: boolean;
    maxBatchSize?: number;
    maxWaitTime?: number;
  };
}

// Task-specific metadata interfaces
export interface TaskStatusMetadata {
  [key: string]: unknown;
  parentPath?: string;
  childrenPaths?: string[];
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  reason: 'parent_update' | 'children_completed' | 'dependency_update';
}

export interface TaskDependencyMetadata {
  [key: string]: unknown;
  taskPath: string;
  addedDependencies: string[];
  removedDependencies: string[];
}

// Event interfaces extending BaseEvent
export interface SystemEvent extends BaseEvent {
  metadata?: SystemEventMetadata;
}

export interface TaskEvent extends BaseEvent {
  taskId: string;
  task: Task;
  metadata?: TaskStatusMetadata | TaskDependencyMetadata | Record<string, unknown>;
  changes?: {
    before: Partial<Task>;
    after: Partial<Task>;
  };
}

export interface CacheEvent extends BaseEvent {
  metadata: {
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
    };
    threshold: number;
  };
}

export interface SerializableError {
  name: string;
  message: string;
  stack?: string;
  [key: string]: unknown;
}

export interface ErrorEvent extends BaseEvent {
  type: EventTypes.SYSTEM_ERROR;
  error: SerializableError;
  context?: {
    component: string;
    operation: string;
    args?: unknown;
  };
}

export interface TransactionEvent extends BaseEvent {
  transactionId: string;
  metadata?: Record<string, unknown>;
}

export interface BatchEvent extends BaseEvent {
  batchId: string;
  metadata?: Record<string, unknown>;
}

// Union type of all event types
export type AtlasEvent =
  | SystemEvent
  | TaskEvent
  | CacheEvent
  | ErrorEvent
  | TransactionEvent
  | BatchEvent;

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
  TASK_DEPENDENCIES_CHANGED = 'task_dependencies_changed',

  // Cache events
  MEMORY_PRESSURE = 'memory_pressure',
  CACHE_CLEARED = 'cache_cleared',
  CACHE_INVALIDATED = 'cache_invalidated',

  // Logger events
  LOGGER_INITIALIZED = 'logger_initialized',
  LOGGER_SHUTDOWN = 'logger_shutdown',
  LOGGER_TRANSPORT_ERROR = 'logger_transport_error',
  LOGGER_TRANSPORT_RECOVERED = 'logger_transport_recovered',
  LOGGER_TRANSPORT_FAILED = 'logger_transport_failed',
  LOGGER_FAILOVER_USED = 'logger_failover_used',
  LOGGER_CRITICAL_FAILURE = 'logger_critical_failure',
  LOGGER_HEALTH_CHECK = 'logger_health_check',
}

export interface SystemEventMetadata {
  // Tool execution
  tool?: string;
  args?: unknown;
  success?: boolean;
  error?: SerializableError;

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

  // Logger info
  transports?: string[];
  failoverEnabled?: boolean;
  transport?: string;
  status?: Record<string, unknown>;
  originalErrors?: string[];
  errors?: string[];
}
