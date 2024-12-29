import { Task } from './task.js';

/**
 * Configuration for batch processing operations
 */
export interface BatchConfig {
  /** Maximum number of items per batch */
  batchSize: number;
  /** Maximum number of concurrent batch operations */
  concurrentBatches: number;
  /** Number of retry attempts for failed operations */
  retryCount: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay: number;
}

/**
 * Result of a batch processing operation
 */
export interface BatchResult {
  /** Whether the batch operation was successful */
  success: boolean;
  /** Number of successfully processed items */
  processedCount: number;
  /** Number of failed items */
  failedCount: number;
  /** Detailed error information for failed items */
  errors: Array<BatchError>;
}

/**
 * Error information for a failed batch item
 */
export interface BatchError {
  /** The item that failed processing */
  item: unknown;
  /** The error that occurred */
  error: Error;
  /** Additional context about the failure */
  context?: BatchErrorContext;
}

/**
 * Context information for batch errors
 */
export interface BatchErrorContext {
  /** Size of the batch being processed */
  batchSize: number;
  /** Index of the current item in the batch */
  currentIndex: number;
  /** Number of items processed so far */
  processedCount: number;
  /** Reason for the failure */
  failureReason?: string;
  /** Additional context properties */
  [key: string]: unknown;
}

/**
 * Callbacks for tracking batch processing progress
 */
export interface BatchProgressCallback {
  /** Called when a batch starts processing */
  onBatchStart?: (batchIndex: number, totalBatches: number) => void;
  /** Called when a batch completes processing */
  onBatchComplete?: (batchIndex: number, result: BatchResult) => void;
  /** Called when an individual operation completes */
  onOperationComplete?: (itemIndex: number, totalItems: number) => void;
}

/**
 * Base interface for batch processors
 */
export interface BatchProcessor {
  processBatch<T>(
    batch: T[],
    operation: (item: T) => Promise<void>,
    progressCallback?: BatchProgressCallback
  ): Promise<BatchResult>;

  processInBatches<T>(
    items: T[],
    batchSize: number,
    operation: (item: T) => Promise<void>,
    progressCallback?: BatchProgressCallback
  ): Promise<BatchResult>;
}

/**
 * Interface for items with dependencies
 */
export interface DependentItem {
  /** Unique identifier for the item */
  id?: string;
  /** Path-based identifier for the item */
  path?: string;
  /** Dependencies that must be processed before this item */
  dependencies?: string[];
}

/**
 * Extended batch result for task operations
 */
export interface TaskBatchResult extends BatchResult {
  /** Paths of tasks affected by the operation */
  affectedTasks: string[];
  /** ID of the transaction if applicable */
  transactionId?: string;
  /** Validation errors encountered */
  validationErrors?: Array<{
    path: string;
    error: Error;
  }>;
}

/**
 * Configuration for task batch operations
 */
export interface TaskBatchOperation {
  /** Type of operation to perform */
  type: 'add' | 'update' | 'remove';
  /** Tasks to process */
  tasks: Task[];
  /** Additional options for the operation */
  options?: {
    /** Skip validation checks */
    skipValidation?: boolean;
    /** Force update even if conditions aren't met */
    forceUpdate?: boolean;
    /** Continue processing despite errors */
    ignoreErrors?: boolean;
  };
}

/**
 * Status update operation for tasks
 */
export interface StatusUpdate {
  /** Path of the task to update */
  taskPath: string;
  /** New status to apply */
  newStatus: Task['status'];
}
