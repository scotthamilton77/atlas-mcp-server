/**
 * Core validation system exports
 */

// Export validation constants and types
export * from './constants.js';

// Export path validation
export * from './path/schema.js';

// Export ID validation
export * from './id/schema.js';

// Export config validation
export * from './config/schema.js';

/**
 * Validation error helper
 */
export class ValidationError extends Error {
  constructor(
    message: string | string[],
    public readonly metadata?: Record<string, unknown>
  ) {
    super(Array.isArray(message) ? message.join('; ') : message);
    this.name = 'ValidationError';
  }
}

/**
 * Helper to create a validation result
 */
export function createValidationResult<T>(
  success: boolean,
  data?: T,
  errors?: string[],
  warnings?: string[]
): ValidationResult<T> {
  return {
    success,
    data,
    errors,
    warnings,
    metadata: {
      validationTime: Date.now(),
    },
  };
}

/**
 * Helper to combine multiple validation results
 */
export function combineValidationResults<T>(results: ValidationResult<T>[]): ValidationResult<T[]> {
  const success = results.every(r => r.success);
  const data = results.map(r => r.data).filter((d): d is T => d !== undefined);
  const errors = results.flatMap(r => r.errors || []);
  const warnings = results.flatMap(r => r.warnings || []);

  return {
    success,
    data: data.length > 0 ? data : undefined,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    metadata: {
      validationTime: Date.now(),
    },
  };
}

// Import ValidationResult type
import type { ValidationResult } from './constants.js';
