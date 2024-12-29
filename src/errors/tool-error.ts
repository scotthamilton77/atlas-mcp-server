import { BaseError } from './base-error.js';
import { ErrorCode, ErrorContext, ErrorSeverity } from '../types/error.js';

type ToolErrorCode = Extract<
  ErrorCode,
  'TOOL_NOT_FOUND' | 'TOOL_EXECUTION' | 'TOOL_VALIDATION' | 'TOOL_TIMEOUT' | 'TOOL_PERMISSION'
>;

/**
 * Tool-specific error class
 */
export class ToolError extends BaseError {
  constructor(code: ToolErrorCode, message: string, context: ErrorContext, toolName?: string) {
    // Add tool name to metadata if provided
    const enrichedContext: ErrorContext = {
      ...context,
      metadata: {
        ...context.metadata,
        ...(toolName && { toolName }),
      },
    };

    super(code, message, enrichedContext);
    this.name = 'ToolError';
  }

  /**
   * Gets the tool name if available
   */
  getToolName(): string | undefined {
    return this.getMetadata()?.toolName as string | undefined;
  }

  /**
   * Creates a string representation of the tool error
   */
  toString(): string {
    const toolName = this.getToolName();
    return `${this.name} [${this.code}]${toolName ? ` in ${toolName}` : ''}: ${this.message}${
      this.getUserMessage() !== this.message ? ` (${this.getUserMessage()})` : ''
    }`;
  }

  /**
   * Converts the tool error to a JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      toolName: this.getToolName(),
    };
  }

  /**
   * Creates a not found error
   */
  static notFound(
    toolName: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): ToolError {
    return new ToolError(
      'TOOL_NOT_FOUND',
      `Tool not found: ${toolName}`,
      {
        operation,
        timestamp: Date.now(),
        severity: ErrorSeverity.HIGH,
        metadata: {
          ...metadata,
          toolName,
        },
      },
      toolName
    );
  }

  /**
   * Creates an execution error
   */
  static execution(
    toolName: string,
    operation: string,
    reason: string,
    metadata?: Record<string, unknown>
  ): ToolError {
    return new ToolError(
      'TOOL_EXECUTION',
      `Tool execution failed: ${reason}`,
      {
        operation,
        timestamp: Date.now(),
        severity: ErrorSeverity.HIGH,
        metadata: {
          ...metadata,
          toolName,
          reason,
        },
      },
      toolName
    );
  }

  /**
   * Creates a validation error
   */
  static validation(
    toolName: string,
    operation: string,
    errors: string[],
    metadata?: Record<string, unknown>
  ): ToolError {
    return new ToolError(
      'TOOL_VALIDATION',
      `Tool validation failed: ${errors.join('; ')}`,
      {
        operation,
        timestamp: Date.now(),
        severity: ErrorSeverity.HIGH,
        metadata: {
          ...metadata,
          toolName,
          validationErrors: errors,
        },
      },
      toolName
    );
  }

  /**
   * Creates a timeout error
   */
  static timeout(
    toolName: string,
    operation: string,
    duration: number,
    metadata?: Record<string, unknown>
  ): ToolError {
    return new ToolError(
      'TOOL_TIMEOUT',
      `Tool execution timed out after ${duration}ms`,
      {
        operation,
        timestamp: Date.now(),
        severity: ErrorSeverity.HIGH,
        metadata: {
          ...metadata,
          toolName,
          duration,
        },
      },
      toolName
    );
  }

  /**
   * Creates a permission error
   */
  static permission(
    toolName: string,
    operation: string,
    action: string,
    metadata?: Record<string, unknown>
  ): ToolError {
    return new ToolError(
      'TOOL_PERMISSION',
      `Permission denied: ${action}`,
      {
        operation,
        timestamp: Date.now(),
        severity: ErrorSeverity.HIGH,
        metadata: {
          ...metadata,
          toolName,
          action,
        },
      },
      toolName
    );
  }
}
