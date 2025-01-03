import { Task, TaskStatus } from '../../../../types/task.js';

export interface BatchData {
  id: string;
  [key: string]: any;
}

export interface BatchValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface BatchResult<T> {
  results: T[];
  errors: Error[];
  metadata?: {
    processingTime: number;
    successCount: number;
    errorCount: number;
    [key: string]: any;
  };
}

export interface BatchItemResult {
  path: string;
  success: boolean;
  task?: Task;
  error?: string;
  warnings?: string[];
  suggestions?: string[];
  statusEffects?: Array<{
    path: string;
    fromStatus: TaskStatus;
    toStatus: TaskStatus;
    reason: string;
  }>;
}
