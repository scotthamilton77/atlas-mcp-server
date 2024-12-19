import { Task } from '../../../shared/types/task.js';

/**
 * Storage operation types
 */
export enum StorageOperationType {
  SAVE = 'save',
  LOAD = 'load',
  DELETE = 'delete',
  CLEAR = 'clear',
  BACKUP = 'backup',
  RESTORE = 'restore'
}

/**
 * Base interface for all storage operations
 */
export interface StorageOperation {
  type: StorageOperationType;
  timestamp: number;
  correlationId: string;
}

/**
 * Save operation
 */
export interface SaveOperation extends StorageOperation {
  type: StorageOperationType.SAVE;
  task: Task;
}

/**
 * Load operation
 */
export interface LoadOperation extends StorageOperation {
  type: StorageOperationType.LOAD;
  taskId: string;
}

/**
 * Delete operation
 */
export interface DeleteOperation extends StorageOperation {
  type: StorageOperationType.DELETE;
  taskId: string;
}

/**
 * Clear operation
 */
export interface ClearOperation extends StorageOperation {
  type: StorageOperationType.CLEAR;
}

/**
 * Backup operation
 */
export interface BackupOperation extends StorageOperation {
  type: StorageOperationType.BACKUP;
  backupPath: string;
}

/**
 * Restore operation
 */
export interface RestoreOperation extends StorageOperation {
  type: StorageOperationType.RESTORE;
  backupPath: string;
}

/**
 * Union type of all storage operations
 */
export type StorageOperations =
  | SaveOperation
  | LoadOperation
  | DeleteOperation
  | ClearOperation
  | BackupOperation
  | RestoreOperation;
