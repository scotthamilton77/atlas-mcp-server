import { ErrorCode } from '../types/error.js';
import { ErrorFactory } from './error-factory.js';

/**
 * Template error codes
 */
export const TemplateErrorCodes = {
  TEMPLATE_LOADING: 'TEMPLATE_LOADING' as const,
  TEMPLATE_PARSING: 'TEMPLATE_PARSING' as const,
  TEMPLATE_VALIDATION: 'TEMPLATE_VALIDATION' as const,
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND' as const,
  TEMPLATE_DUPLICATE: 'TEMPLATE_DUPLICATE' as const,
  TEMPLATE_INVALID_PATH: 'TEMPLATE_INVALID_PATH' as const,
  TEMPLATE_INVALID_DEPENDENCY: 'TEMPLATE_INVALID_DEPENDENCY' as const,
  TEMPLATE_CYCLE: 'TEMPLATE_CYCLE' as const,
} as const;

// Update ErrorCode type to include template error codes
declare module '../types/error.js' {
  interface ErrorCodes {
    TEMPLATE_LOADING: typeof TemplateErrorCodes.TEMPLATE_LOADING;
    TEMPLATE_PARSING: typeof TemplateErrorCodes.TEMPLATE_PARSING;
    TEMPLATE_VALIDATION: typeof TemplateErrorCodes.TEMPLATE_VALIDATION;
    TEMPLATE_NOT_FOUND: typeof TemplateErrorCodes.TEMPLATE_NOT_FOUND;
    TEMPLATE_DUPLICATE: typeof TemplateErrorCodes.TEMPLATE_DUPLICATE;
    TEMPLATE_INVALID_PATH: typeof TemplateErrorCodes.TEMPLATE_INVALID_PATH;
    TEMPLATE_INVALID_DEPENDENCY: typeof TemplateErrorCodes.TEMPLATE_INVALID_DEPENDENCY;
    TEMPLATE_CYCLE: typeof TemplateErrorCodes.TEMPLATE_CYCLE;
  }
}

/**
 * Template error factory
 */
export class TemplateErrorFactory {
  static createError(
    code: ErrorCode,
    message: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): Error {
    return ErrorFactory.createError(code, message, operation, undefined, metadata);
  }

  static createLoadingError(
    message: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): Error {
    return this.createError(TemplateErrorCodes.TEMPLATE_LOADING, message, operation, metadata);
  }

  static createParsingError(
    message: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): Error {
    return this.createError(TemplateErrorCodes.TEMPLATE_PARSING, message, operation, metadata);
  }

  static createValidationError(
    message: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): Error {
    return this.createError(TemplateErrorCodes.TEMPLATE_VALIDATION, message, operation, metadata);
  }

  static createNotFoundError(
    message: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): Error {
    return this.createError(TemplateErrorCodes.TEMPLATE_NOT_FOUND, message, operation, metadata);
  }

  static createDuplicateError(
    message: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): Error {
    return this.createError(TemplateErrorCodes.TEMPLATE_DUPLICATE, message, operation, metadata);
  }

  static createInvalidPathError(
    message: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): Error {
    return this.createError(TemplateErrorCodes.TEMPLATE_INVALID_PATH, message, operation, metadata);
  }

  static createInvalidDependencyError(
    message: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): Error {
    return this.createError(
      TemplateErrorCodes.TEMPLATE_INVALID_DEPENDENCY,
      message,
      operation,
      metadata
    );
  }

  static createCycleError(
    message: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): Error {
    return this.createError(TemplateErrorCodes.TEMPLATE_CYCLE, message, operation, metadata);
  }
}
