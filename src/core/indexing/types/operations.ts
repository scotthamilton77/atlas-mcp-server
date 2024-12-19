import { IndexEntry, IndexOperation, IndexResult as IndexOperationResult } from './entries.js';

/**
 * Operation executor interface
 */
export interface OperationExecutor<T extends IndexEntry> {
  executeOperation(operation: IndexOperation<T>): Promise<IndexOperationResult>;
}

/**
 * Operation validator interface
 */
export interface OperationValidator<T extends IndexEntry> {
  validateOperation(operation: IndexOperation<T>): Promise<boolean>;
  validateBatch(operations: IndexOperation<T>[]): Promise<boolean>;
}

/**
 * Operation monitor interface
 */
export interface OperationMonitor<T extends IndexEntry> {
  onOperationStart(operation: IndexOperation<T>): void;
  onOperationComplete(operation: IndexOperation<T>, result: IndexOperationResult): void;
  onOperationError(operation: IndexOperation<T>, error: Error): void;
  onBatchStart(operations: IndexOperation<T>[]): void;
  onBatchComplete(results: IndexOperationResult[]): void;
  onBatchError(error: Error): void;
}

/**
 * Operation scheduler interface
 */
export interface OperationScheduler<T extends IndexEntry> {
  schedule(operation: IndexOperation<T>): Promise<void>;
  scheduleBatch(operations: IndexOperation<T>[]): Promise<void>;
  cancel(operationId: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}

/**
 * Operation retry policy
 */
export interface RetryPolicy {
  shouldRetry(error: Error, attempt: number): boolean;
  getDelay(attempt: number): number;
  getMaxAttempts(): number;
}

/**
 * Operation rate limiter
 */
export interface RateLimiter {
  acquire(): Promise<void>;
  release(): void;
  setRate(rate: number): void;
  getBurst(): number;
  setBurst(burst: number): void;
}

/**
 * Operation queue interface
 */
export interface OperationQueue<T extends IndexEntry> {
  enqueue(operation: IndexOperation<T>): Promise<void>;
  dequeue(): Promise<IndexOperation<T> | null>;
  peek(): Promise<IndexOperation<T> | null>;
  size(): number;
  clear(): Promise<void>;
  isEmpty(): boolean;
}
