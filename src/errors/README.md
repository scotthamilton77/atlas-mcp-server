# Error Handling System

This directory contains the error handling system for the Atlas Task Manager. The system provides a consistent way to create, handle, and propagate errors throughout the application.

## Architecture

The error handling system is built around several key components:

### Base Error Class (`BaseError`)
- Extends the native `Error` class
- Provides common error properties and methods
- Supports error codes, context, and metadata
- Enables consistent error formatting and logging

### Specialized Error Classes
- `TaskError`: Task-related errors (validation, not found, etc.)
- `StorageError`: Database and storage operations errors
- `ConfigError`: Configuration and initialization errors
- `ToolError`: Tool execution and integration errors

### Error Handlers
Each major component has its own error handler that:
- Provides domain-specific error handling methods
- Integrates with the logging system
- Ensures consistent error creation and propagation
- Maintains error context and metadata

## Error Types

### Task Errors
```typescript
// Operation failures
TaskError.operationFailed(
    component: string,
    operation: string,
    message: string,
    details?: Record<string, unknown>
)

// Validation failures
TaskError.validationFailed(
    operation: string,
    message: string,
    details?: Record<string, unknown>
)

// Not found errors
TaskError.notFound(
    path: string,
    operation: string,
    details?: Record<string, unknown>
)

// Dependency errors
TaskError.dependencyError(
    operation: string,
    message: string,
    details?: Record<string, unknown>
)

// Status errors
TaskError.statusError(
    operation: string,
    message: string,
    details?: Record<string, unknown>
)

// Bulk operation errors
TaskError.bulkOperationFailed(
    operation: string,
    errors: Error[],
    details?: Record<string, unknown>
)
```

### Error Context
All errors include context information:
```typescript
interface ErrorContext {
    operation: string;        // Operation that failed
    timestamp: number;        // When the error occurred
    severity: ErrorSeverity;  // Error severity level
    metadata?: Record<string, unknown>; // Additional context
    stackTrace?: string;      // Error stack trace
}
```

## Usage Examples

### Creating Task Errors
```typescript
// Operation failed
throw TaskError.operationFailed(
    'TaskManager',
    'createTask',
    'Failed to create task: Invalid input',
    { input }
);

// Validation error
throw TaskError.validationFailed(
    'validateTask',
    'Task name is required',
    { input }
);

// Not found error
throw TaskError.notFound(
    taskPath,
    'getTask',
    { query }
);
```

### Using Error Handlers
```typescript
class TaskManager {
    private readonly errorHandler = getErrorHandler();

    async createTask(input: CreateTaskInput): Promise<Task> {
        try {
            // Validate input
            if (!input.name) {
                this.errorHandler.handleValidationError(
                    'Task name is required',
                    'createTask',
                    { input }
                );
            }

            // Create task...
        } catch (error) {
            this.errorHandler.handleOperationError(
                error,
                'createTask',
                { input }
            );
        }
    }
}
```

### Error Handler Features
- Automatic logging of errors with context
- Consistent error creation and formatting
- Integration with monitoring and metrics
- Support for error recovery and cleanup
- Transaction rollback coordination

## Best Practices

1. **Use Specialized Error Types**
   - Create specific error types for different domains
   - Use appropriate error codes and severities
   - Include relevant context and metadata

2. **Proper Error Handling**
   - Always catch and handle errors appropriately
   - Use error handlers for consistent behavior
   - Maintain error context through the call stack
   - Clean up resources in error cases

3. **Error Context**
   - Include operation name and timestamp
   - Add relevant metadata for debugging
   - Preserve error stack traces
   - Use appropriate severity levels

4. **Error Recovery**
   - Implement cleanup and rollback logic
   - Handle partial failures in bulk operations
   - Maintain system consistency on errors
   - Log recovery actions for auditing

5. **Error Logging**
   - Log errors with appropriate severity
   - Include context for debugging
   - Structure error messages consistently
   - Enable error tracking and monitoring

## Testing

The error system includes comprehensive tests:
- Error creation and properties
- Error handler behavior
- Context preservation
- Recovery mechanisms
- Logging integration

Example test:
```typescript
describe('TaskManagerErrorHandler', () => {
    it('should handle validation errors', () => {
        const handler = new TaskManagerErrorHandler();
        
        expect(() => {
            handler.handleValidationError(
                'Invalid input',
                'validate',
                { field: 'name' }
            );
        }).toThrow(TaskError);
    });
});
