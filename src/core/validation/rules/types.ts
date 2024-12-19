import { Task } from '../../../shared/types/task.js';
import { ValidationContext, ValidationOptions } from '../types.js';

/**
 * Extended validation context with task store
 */
export interface TaskValidationContext extends ValidationContext {
  taskStore: {
    getTask(id: string): Promise<Task | null>;
  };
}

/**
 * Task validation options
 */
export interface TaskValidationOptions extends ValidationOptions {
  validateDependencies?: boolean;
  validateStatus?: boolean;
  validateRelationships?: boolean;
}
