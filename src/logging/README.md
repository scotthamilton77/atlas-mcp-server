# Logging System

The logging system provides comprehensive logging capabilities for the Atlas Task Manager,
supporting both console and file-based logging with configurable levels, formats, and rotation
policies.

## Overview

The logging system provides:

- Multi-transport logging (console, file)
- Log level management
- Structured logging format
- File rotation and retention
- Error formatting and context

## Architecture

### Core Components

#### Logger

- Manages log operations
- Handles multiple transports
- Controls log levels
- Formats log messages

#### TransportManager

- Manages logging destinations
- Handles transport lifecycle
- Controls log routing
- Manages transport errors

#### FileTransport

- Handles file-based logging
- Manages log rotation
- Controls file permissions
- Handles write operations

#### ErrorFormatter

- Formats error messages
- Adds context information
- Structures error data
- Maintains consistency

## Usage Examples

```typescript
// Initialize logger
const logger = await Logger.initialize({
  console: true,
  file: true,
  minLevel: LogLevels.DEBUG,
  logDir: '/path/to/logs',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 10,
});

// Basic logging
logger.info('Operation completed', {
  component: 'TaskManager',
  operation: 'createTask',
  taskId: 'task-123',
});

// Error logging
logger.error('Operation failed', {
  error: new Error('Invalid input'),
  component: 'TaskManager',
  context: { input },
});

// Debug logging with context
logger.debug('Processing batch', {
  batchId: 'batch-123',
  items: items.length,
  timestamp: Date.now(),
});
```

## Log Levels

```typescript
enum LogLevels {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}
```

## Best Practices

1. **Log Structure**

   - Use consistent log formats
   - Include relevant context
   - Add timestamps
   - Use appropriate levels

2. **Error Logging**

   - Include stack traces
   - Add error context
   - Use error codes
   - Maintain error hierarchy

3. **Performance**

   - Configure appropriate levels
   - Use log rotation
   - Monitor log size
   - Handle backpressure

4. **Security**

   - Sanitize sensitive data
   - Control log access
   - Secure log files
   - Monitor log usage

5. **Maintenance**
   - Rotate logs regularly
   - Archive old logs
   - Monitor disk space
   - Clean up old files
