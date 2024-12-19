import { Task } from '../../../shared/types/task.js';
import { ValidationContext, ValidationOptions, ValidationResult, ValidationError, ValidationErrorCodes } from '../types.js';

/**
 * Validates data integrity for tasks, ensuring all required data is present
 * and properly formatted.
 */
export class DataIntegrityChecker {
  async check(
    _context: ValidationContext,
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
          checker: 'integrity'
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
          validator: 'DataIntegrityChecker'
        }
      };
    }

    // Verify required fields are present and properly formatted
    if (!this.verifyRequiredFields(data)) {
      const error: ValidationError = {
        type: ValidationErrorCodes.MISSING_FIELD,
        message: 'Missing or malformed required fields',
        path: [],
        value: data,
        metadata: {
          error: 'Missing or malformed required fields',
          checker: 'integrity'
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
          validator: 'DataIntegrityChecker'
        }
      };
    }

    // Verify timestamps are valid
    if (!this.verifyTimestamps(data)) {
      const error: ValidationError = {
        type: ValidationErrorCodes.FORMAT_ERROR,
        message: 'Invalid timestamp format or values',
        path: ['metadata', 'created', 'updated'],
        value: data,
        metadata: {
          error: 'Invalid timestamp format or values',
          checker: 'integrity'
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
          validator: 'DataIntegrityChecker'
        }
      };
    }

    // Verify IDs are valid UUIDs
    if (!this.verifyIds(data)) {
      const error: ValidationError = {
        type: ValidationErrorCodes.FORMAT_ERROR,
        message: 'Invalid ID format',
        path: ['id'],
        value: data,
        metadata: {
          error: 'Invalid ID format',
          checker: 'integrity'
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
          validator: 'DataIntegrityChecker'
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
        validator: 'DataIntegrityChecker'
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

  private verifyRequiredFields(data: Task): boolean {
    return !!(
      data.id &&
      data.name &&
      data.type &&
      data.status &&
      data.metadata
    );
  }

  private verifyTimestamps(data: Task): boolean {
    const { created, updated } = data.metadata;
    if (!created || !updated) return false;

    const createdDate = new Date(created);
    const updatedDate = new Date(updated);

    return (
      !isNaN(createdDate.getTime()) &&
      !isNaN(updatedDate.getTime()) &&
      createdDate <= updatedDate
    );
  }

  private verifyIds(data: Task): boolean {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    // Check main task ID
    if (!uuidPattern.test(data.id)) return false;

    // Check parent ID if present
    if (data.parentId && !uuidPattern.test(data.parentId)) return false;

    // Check dependency IDs if present
    if (data.dependencies?.some((id: string) => !uuidPattern.test(id))) return false;

    // Check subtask IDs if present
    if (data.subtasks?.some((subtask: Task) => !uuidPattern.test(subtask.id))) {
      return false;
    }

    return true;
  }
}
