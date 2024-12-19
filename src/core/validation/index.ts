/**
 * Unified validation module that exports all validation-related components
 */

import { ValidationCoordinator } from './coordinator.js';
import { TaskType, TaskStatus, Task } from '../../shared/types/task.js';
import { TaskValidationContext, TaskValidationOptions } from './rules/types.js';
import { 
  ValidationResult, 
  ValidationError, 
  TaskValidationError 
} from './types.js';

// Core validation types and interfaces
export * from './types.js';
export * from './rules/types.js';

// Validation rules
export { DependencyRule } from './rules/dependency-rule.js';
export { StatusRule } from './rules/status-rule.js';
export { RelationshipRule } from './rules/relationship-rule.js';

// Schema validators
export * from './schemas/task-types.js';
export * from './schemas/task-validator.js';
export * from './schemas/base-validator.js';

// Re-export main coordinator
export { ValidationCoordinator };

// Re-export validation types
export * from './types.js';

// Default validation coordinator instance with standard rules
export const createDefaultValidationCoordinator = (): ValidationCoordinator => {
  const coordinator = new ValidationCoordinator();
  coordinator.resetRules(); // Ensures default rules are loaded
  return coordinator;
};

// Helper functions for common validation tasks
export const validateTask = async (
  context: TaskValidationContext,
  task: Task,
  options?: TaskValidationOptions
): Promise<ValidationResult<TaskValidationError>> => {
  const coordinator = createDefaultValidationCoordinator();
  return coordinator.validateTask(context, task, options);
};

export const validateTasks = async (
  context: TaskValidationContext,
  tasks: Task[],
  options?: TaskValidationOptions
): Promise<ValidationResult<TaskValidationError>[]> => {
  const coordinator = createDefaultValidationCoordinator();
  return coordinator.validateTasks(context, tasks, options);
};

// Utility functions for working with validation results
export const isValidationError = (error: unknown): error is ValidationError => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'rule' in error &&
    'constraint' in error &&
    'message' in error
  );
};

export const formatValidationErrors = (result: ValidationResult<ValidationError>): string => {
  if (result.success) {
    return 'Validation passed successfully';
  }

  const groupedErrors = result.errors.reduce((grouped: Record<string, string[]>, error: ValidationError) => {
    const ruleName = error.metadata.rule as string;
    if (!grouped[ruleName]) {
      grouped[ruleName] = [];
    }
    grouped[ruleName].push(error.message);
    return grouped;
  }, {} as Record<string, string[]>);

  return Object.entries(groupedErrors)
    .map(([rule, messages]) => {
      return `${rule}:\n${messages.map((msg: string) => `  - ${msg}`).join('\n')}`;
    })
    .join('\n\n');
};

export const combineValidationResults = (
  results: ValidationResult<ValidationError>[]
): ValidationResult<ValidationError> => {
  const allErrors = results.flatMap(r => r.errors);
  const valid = allErrors.length === 0;
  return {
    valid,
    success: valid,
    errors: allErrors,
    metadata: {
      duration: 0,
      timestamp: new Date().toISOString(),
      validator: 'ValidationModule'
    }
  };
};

// Constants for validation
export const VALIDATION_CONSTANTS = {
  MAX_HIERARCHY_DEPTH: 5,
  MAX_DEPENDENCIES: 50,
  MAX_SUBTASKS: 100,
  MAX_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 2000
} as const;

// Type guards for validation
export const isValidTaskType = (value: unknown): value is TaskType => {
  return (
    typeof value === 'string' &&
    Object.values(TaskType).includes(value as TaskType)
  );
};

export const isValidTaskStatus = (value: unknown): value is TaskStatus => {
  return (
    typeof value === 'string' &&
    Object.values(TaskStatus).includes(value as TaskStatus)
  );
};
