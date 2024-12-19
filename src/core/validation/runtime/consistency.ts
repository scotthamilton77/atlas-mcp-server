import { Task, TaskType } from '../../../shared/types/task.js';
import { ValidationContext, ValidationOptions, ValidationResult, ValidationError, ValidationErrorCodes } from '../types.js';

/**
 * Validates data consistency across tasks, ensuring relationships and references
 * are valid and consistent.
 */
export class ConsistencyChecker {
  async check(
    context: ValidationContext,
    data: unknown,
    _options?: ValidationOptions
  ): Promise<ValidationResult<ValidationError>> {
    if (!this.isTask(data)) {
      const error: ValidationError = {
        type: ValidationErrorCodes.TYPE_ERROR,
        message: 'Invalid data type',
        path: [],
        value: data,
        metadata: {
          error: 'Invalid data type',
          checker: 'consistency'
        }
      };
      return {
        valid: false,
        success: false,
        errors: [error],
        error,
        metadata: {
          duration: 0,
          timestamp: new Date().toISOString(),
          validator: 'ConsistencyChecker'
        }
      };
    }

    // Verify parent-child consistency
    if (data.parentId) {
      const parentResult = await this.verifyParentChildConsistency(context, data);
      if (!parentResult.success) return parentResult;
    }

    // Verify dependency consistency
    if (data.dependencies?.length) {
      const dependencyResult = await this.verifyDependencyConsistency(context, data);
      if (!dependencyResult.success) return dependencyResult;
    }

    // Verify subtask consistency
    if (data.subtasks?.length) {
      const subtaskResult = await this.verifySubtaskConsistency(context, data);
      if (!subtaskResult.success) return subtaskResult;
    }

    return {
      valid: true,
      success: true,
      errors: [],
      metadata: {
        duration: 0,
        timestamp: new Date().toISOString(),
        validator: 'ConsistencyChecker'
      }
    };
  }

  private isTask(data: unknown): data is Task {
    return (
      typeof data === 'object' &&
      data !== null &&
      'id' in data &&
      'name' in data &&
      'type' in data &&
      'status' in data
    );
  }

  private async verifyParentChildConsistency(
    context: ValidationContext,
    data: Task
  ): Promise<ValidationResult<ValidationError>> {
    const parent = await context.taskStore?.getTask(data.parentId!);
    
    if (!parent) {
      const error: ValidationError = {
        type: ValidationErrorCodes.INVALID_REFERENCE,
        message: 'Parent task not found',
        path: ['parentId'],
        value: data.parentId,
        metadata: {
          error: 'Parent task not found',
          checker: 'consistency'
        }
      };
      return {
        valid: false,
        success: false,
        errors: [error],
        error,
        metadata: {
          duration: 0,
          timestamp: new Date().toISOString(),
          validator: 'ConsistencyChecker'
        }
      };
    }

    if (parent.type !== TaskType.GROUP) {
      const error: ValidationError = {
        type: ValidationErrorCodes.CONSTRAINT_ERROR,
        message: 'Parent task must be a group task',
        path: ['parentId'],
        value: data.parentId,
        metadata: {
          error: 'Parent task must be a group task',
          checker: 'consistency',
          parentType: parent.type
        }
      };
      return {
        valid: false,
        success: false,
        errors: [error],
        error,
        metadata: {
          duration: 0,
          timestamp: new Date().toISOString(),
          validator: 'ConsistencyChecker'
        }
      };
    }

    return {
      valid: true,
      success: true,
      errors: [],
      metadata: {
        duration: 0,
        timestamp: new Date().toISOString(),
        validator: 'ConsistencyChecker'
      }
    };
  }

  private async verifyDependencyConsistency(
    context: ValidationContext,
    data: Task
  ): Promise<ValidationResult<ValidationError>> {
    const dependencies: (Task | null | undefined)[] = await Promise.all(
      data.dependencies!.map(id => context.taskStore?.getTask(id))
    );

    // Check for missing dependencies
    if (dependencies.some((dep: Task | null | undefined) => !dep)) {
      const error: ValidationError = {
        type: ValidationErrorCodes.INVALID_REFERENCE,
        message: 'One or more dependencies not found',
        path: ['dependencies'],
        value: data.dependencies,
        metadata: {
          error: 'One or more dependencies not found',
          checker: 'consistency'
        }
      };
      return {
        valid: false,
        success: false,
        errors: [error],
        error,
        metadata: {
          duration: 0,
          timestamp: new Date().toISOString(),
          validator: 'ConsistencyChecker'
        }
      };
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const checking = new Set<string>();

    const hasCircular = await this.detectCircularDependencies(
      context,
      data.id,
      visited,
      checking
    );

    if (hasCircular) {
      const error: ValidationError = {
        type: ValidationErrorCodes.DEPENDENCY_ERROR,
        message: 'Circular dependency detected',
        path: ['dependencies'],
        value: data.dependencies,
        metadata: {
          error: 'Circular dependency detected',
          checker: 'consistency'
        }
      };
      return {
        valid: false,
        success: false,
        errors: [error],
        error,
        metadata: {
          duration: 0,
          timestamp: new Date().toISOString(),
          validator: 'ConsistencyChecker'
        }
      };
    }

    return {
      valid: true,
      success: true,
      errors: [],
      metadata: {
        duration: 0,
        timestamp: new Date().toISOString(),
        validator: 'ConsistencyChecker'
      }
    };
  }

  private async verifySubtaskConsistency(
    context: ValidationContext,
    data: Task
  ): Promise<ValidationResult<ValidationError>> {
    if (data.type !== TaskType.GROUP) {
      const error: ValidationError = {
        type: ValidationErrorCodes.CONSTRAINT_ERROR,
        message: 'Only group tasks can have subtasks',
        path: ['type', 'subtasks'],
        value: data.type,
        metadata: {
          error: 'Only group tasks can have subtasks',
          checker: 'consistency'
        }
      };
      return {
        valid: false,
        success: false,
        errors: [error],
        error,
        metadata: {
          duration: 0,
          timestamp: new Date().toISOString(),
          validator: 'ConsistencyChecker'
        }
      };
    }

    // Check for duplicate subtask IDs
    const subtaskIds = new Set<string>();
    for (const subtask of data.subtasks!) {
      if (subtaskIds.has(subtask.id)) {
          const error: ValidationError = {
            type: ValidationErrorCodes.CONSTRAINT_ERROR,
            message: 'Duplicate subtask IDs detected',
            path: ['subtasks'],
            value: subtask.id,
            metadata: {
              error: 'Duplicate subtask IDs detected',
              checker: 'consistency',
              duplicateId: subtask.id
            }
          };
          return {
            valid: false,
            success: false,
            errors: [error],
            error,
            metadata: {
              duration: 0,
              timestamp: new Date().toISOString(),
              validator: 'ConsistencyChecker'
            }
          };
      }
      subtaskIds.add(subtask.id);
    }

    // Verify each subtask's parent reference
    for (const subtask of data.subtasks!) {
      if (subtask.parentId !== data.id) {
          const error: ValidationError = {
            type: ValidationErrorCodes.RELATIONSHIP_ERROR,
            message: 'Invalid subtask parent reference',
            path: ['subtasks', subtask.id, 'parentId'],
            value: subtask.parentId,
            metadata: {
              error: 'Invalid subtask parent reference',
              checker: 'consistency',
              expectedParentId: data.id,
              actualParentId: subtask.parentId
            }
          };
          return {
            valid: false,
            success: false,
            errors: [error],
            error,
            metadata: {
              duration: 0,
              timestamp: new Date().toISOString(),
              validator: 'ConsistencyChecker'
            }
          };
      }
    }

    return {
      valid: true,
      success: true,
      errors: [],
      metadata: {
        duration: 0,
        timestamp: new Date().toISOString(),
        validator: 'ConsistencyChecker'
      }
    };
  }

  private async detectCircularDependencies(
    context: ValidationContext,
    taskId: string,
    visited: Set<string>,
    checking: Set<string>
  ): Promise<boolean> {
    if (checking.has(taskId)) {
      return true; // Circular dependency found
    }

    if (visited.has(taskId)) {
      return false; // Already checked this path
    }

    const task = await context.taskStore?.getTask(taskId);
    if (!task?.dependencies?.length) {
      return false;
    }

    checking.add(taskId);

    for (const depId of task.dependencies) {
      if (await this.detectCircularDependencies(context, depId, visited, checking)) {
        return true;
      }
    }

    checking.delete(taskId);
    visited.add(taskId);
    return false;
  }
}
