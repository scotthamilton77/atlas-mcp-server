# ATLAS MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.0.4-green.svg)](https://modelcontextprotocol.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Production%20Ready-green.svg)]()
[![GitHub](https://img.shields.io/github/stars/cyanheads/atlas-mcp-server?style=social)](https://github.com/cyanheads/atlas-mcp-server)

ATLAS (Adaptive Task & Logic Automation System) is a Model Context Protocol server that provides hierarchical task management capabilities to Large Language Models. This tool provides LLMs with the structure and context needed to manage complex tasks and dependencies.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Task Structure](#task-structure)
- [Tools](#tools)
- [Best Practices](#best-practices)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Overview

ATLAS implements the Model Context Protocol (MCP), created by Anthropic, which enables standardized communication between LLMs and external systems through:
- **Clients** (Claude Desktop, IDEs) that maintain server connections
- **Servers** that provide tools and resources
- **LLMs** that interact with servers through client applications

#### Dev Note:
- This project is in active development and may have breaking changes.
- This is my first time working with TypeScript and I'm learning as I go.

### Core Components

- **TaskManager**: Centralized task coordination with validation, event handling, and memory management
- **TaskOperations**: ACID-compliant task operations with transaction support and rollback
- **TaskValidator**: Comprehensive validation with dependency cycle detection and path validation
- **StorageManager**: SQLite-based persistence with Write-Ahead Logging (WAL) and automatic checkpointing
- **EventManager**: System-wide event tracking with error handling and health monitoring
- **BatchProcessors**: Optimized bulk operations with atomic transactions and dependency validation
- **CacheManager**: Intelligent caching with memory pressure monitoring and automatic cleanup
- **IndexManager**: Fast task retrieval with hierarchical indexing and real-time updates

## Features

### Task Organization
- Hierarchical task structure with parent-child relationships
- Strong type validation (TASK, MILESTONE)
- Status management with strict transition rules:
  - PENDING → IN_PROGRESS, BLOCKED
  - IN_PROGRESS → COMPLETED, FAILED, BLOCKED
  - BLOCKED → PENDING, IN_PROGRESS
  - FAILED → PENDING (retry capability)
  - COMPLETED (terminal state)
- Parent-child status constraints:
  - Parent completion blocks subtask modifications
  - All subtasks must complete before parent
  - Sibling status affects transitions
  - Automatic status propagation
- Dependency validation modes:
  - STRICT: All dependencies must exist (default for single operations)
  - DEFERRED: Allows missing dependencies (used in bulk operations)
- Dependency management:
  - Cycle detection
  - Status compatibility checks
  - Automatic dependency blocking
  - Completion requirements
  - Dependency order sorting for bulk operations
- Rich metadata support with schema validation
- Automatic subtask management

### Path Validation & Safety
- Directory traversal prevention
- Special character validation
- Parent-child path validation
- Path depth limits
- Project name validation
- Path sanitization
- Consistent path formatting

### Transaction Management
- ACID compliance
- Atomic batch operations
- Automatic rollback on failure
- Transaction-safe operations
- Vacuum and analyze support
- Checkpoint management

### Storage & Performance
- SQLite backend with Write-Ahead Logging (WAL)
- Caching system:
  - TTL-based expiration with adaptive extension
  - LRU eviction with size awareness
  - Two-phase cleanup (mark and sweep)
  - Automatic cache reduction under pressure
  - Memory usage estimation and limits
  - Hit/miss ratio monitoring
  - Configurable cleanup intervals
- Memory management:
  - Pressure monitoring and automatic reduction
  - Size-based eviction strategies
  - Memory usage estimation
  - Conservative growth policies
  - Automatic garbage collection
- Performance optimizations:
  - Batch processing for bulk updates
  - Index-based fast retrieval
  - Transaction batching
  - Query optimization
  - Connection pooling

### Validation & Safety
- Comprehensive input validation
- Circular dependency prevention
- Status transition validation
- Metadata schema enforcement
- Parent-child relationship validation
- Version tracking for concurrency

### Monitoring & Maintenance
- Comprehensive event system
- Memory usage monitoring
- Database optimization tools
- Relationship repair utilities
- Cache statistics tracking
- Health monitoring
- Graceful shutdown handling
- Performance metrics collection
- Structured logging support
- Automated backup scheduling
- Health check endpoints

### Error Handling
- Error severity classification:
  - CRITICAL: Database and storage errors requiring immediate attention
  - HIGH: Task not found, transaction issues impacting functionality
  - MEDIUM: Validation, dependency, and status errors needing investigation
  - LOW: Non-critical operational errors
- Error context and tracking:
  - Operation details and timestamps
  - Stack traces and correlation IDs
  - Metadata and original errors
  - User-friendly messages
  - Event-based error tracking
- Error types and handling:
  - Database and storage errors
  - Validation and dependency errors
  - Configuration and initialization errors
  - Permission and authorization errors
  - Timeout and performance errors
  - Server connection errors
  - Task operation errors
- Recovery mechanisms:
  - Transaction rollback on failures
  - Automatic retry with backoff
  - Cache and memory recovery
  - Connection pool management
  - Batch operation recovery

Common Error Types:
```typescript
// CRITICAL Severity
{
  "error": "Database operation failed",
  "code": "DATABASE_ERROR",
  "context": {
    "operation": "updateTask",
    "severity": "CRITICAL",
    "timestamp": "10:00:00 AM 1/28/2024",
    "originalError": {
      "name": "SqliteError",
      "message": "SQLITE_BUSY: database is locked"
    }
  }
}

// HIGH Severity
{
  "error": "Task not found: project/backend/api",
  "code": "TASK_NOT_FOUND",
  "context": {
    "operation": "getTask",
    "severity": "HIGH",
    "timestamp": "10:00:00 AM 1/28/2024",
    "resourceType": "Task",
    "identifier": "project/backend/api"
  }
}

// MEDIUM Severity
{
  "error": "Invalid status transition from BLOCKED to COMPLETED",
  "code": "TASK_STATUS",
  "context": {
    "operation": "updateTaskStatus",
    "severity": "MEDIUM",
    "timestamp": "10:00:00 AM 1/28/2024",
    "currentStatus": "BLOCKED",
    "newStatus": "COMPLETED",
    "validTransitions": ["PENDING", "IN_PROGRESS"]
  }
}

// LOW Severity
{
  "error": "Operation timed out after 5000ms",
  "code": "TIMEOUT",
  "context": {
    "operation": "bulkTaskOperations",
    "severity": "LOW",
    "timestamp": "10:00:00 AM 1/28/2024",
    "duration": 5000
  }
}

// Error with User Message
{
  "error": "Permission denied: update on project/backend/api",
  "code": "PERMISSION_DENIED",
  "userMessage": "You do not have permission to perform this action",
  "context": {
    "operation": "updateTask",
    "severity": "HIGH",
    "timestamp": "10:00:00 AM 1/28/2024",
    "resource": "project/backend/api",
    "action": "update"
  }
}

// Validation Error
{
  "error": "Task dependencies must be an array",
  "code": "VALIDATION_ERROR",
  "userMessage": "Validation failed",
  "context": {
    "operation": "validateDependencies",
    "severity": "MEDIUM",
    "timestamp": "10:00:00 AM 1/28/2024"
  }
}

// Storage Error
{
  "error": "Failed to initialize storage connection",
  "code": "STORAGE_ERROR",
  "userMessage": "A storage error occurred",
  "context": {
    "operation": "initializeStorage",
    "severity": "CRITICAL",
    "timestamp": "10:00:00 AM 1/28/2024"
  }
}
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/cyanheads/atlas-mcp-server.git
cd atlas-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

Add to your MCP client settings:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["/path/to/atlas-mcp-server/build/index.js"],
      "env": {
        // Environment Configuration
        "NODE_ENV": "production",                           // Environment (development/production/test)

        // Storage Configuration
        "ATLAS_STORAGE_DIR": "/path/to/storage/directory",  // Base directory for storage and logs
                                                           // Default: Platform-specific user data directory
                                                           // - Windows: %LOCALAPPDATA%/atlas-mcp/storage
                                                           // - Linux: $XDG_DATA_HOME/atlas-mcp/storage
                                                           // - macOS: ~/Library/Application Support/atlas-mcp/storage
        "ATLAS_STORAGE_NAME": "atlas-tasks",                // Database name (default: atlas-tasks)

        // Logging Configuration
        "ATLAS_LOG_CONSOLE": "true",                       // Enable console logging (default: true)
        "ATLAS_LOG_FILE": "true",                          // Enable file logging (default: true)
        "ATLAS_LOG_LEVEL": "debug",                        // Log level (debug/info/warn/error)
        "ATLAS_LOG_MAX_FILES": "5",                        // Maximum log files to keep (default: 5)
        "ATLAS_LOG_MAX_SIZE": "5242880",                   // Max log file size in bytes (default: 5MB)
        "ATLAS_LOG_FORMAT": "json",                        // Log format (json/text) (default: json)

        // Database Connection
        "ATLAS_DB_MAX_RETRIES": "3",                      // Max connection retry attempts (default: 3)
        "ATLAS_DB_RETRY_DELAY": "500",                    // Retry delay in ms (default: 500)
        "ATLAS_DB_BUSY_TIMEOUT": "2000",                  // Busy timeout in ms (default: 2000)

        // Database Performance
        "ATLAS_DB_CHECKPOINT_INTERVAL": "300000",         // Checkpoint interval in ms (default: 300000)
        "ATLAS_DB_CACHE_SIZE": "2000",                    // LRU cache size (default: 2000)
        "ATLAS_DB_MMAP_SIZE": "67108864",                // Memory map size in bytes (default: 64MB)
        "ATLAS_DB_PAGE_SIZE": "4096",                     // Database page size (default: 4096)
        "ATLAS_DB_MAX_MEMORY": "268435456",              // Max SQLite memory in bytes (default: 256MB)

        // Monitoring & Performance
        "ATLAS_METRICS_ENABLED": "true",                  // Enable metrics collection (default: false)
        "ATLAS_METRICS_INTERVAL": "60000",                // Metrics collection interval (default: 60000)
        "ATLAS_RATE_LIMIT": "600",                        // Max requests per minute (default: 600)
        "ATLAS_RETRY_MAX_ATTEMPTS": "3",                  // Max retry attempts (default: 3)
        "ATLAS_RETRY_BACKOFF": "exponential",             // Retry backoff type (default: exponential)

        // Backup Configuration
        "ATLAS_BACKUP_ENABLED": "true",                   // Enable automated backups (default: false)
        "ATLAS_BACKUP_INTERVAL": "86400000",              // Backup interval in ms (default: 24h)
        "ATLAS_BACKUP_RETENTION": "7",                    // Number of backups to keep (default: 7)
        "ATLAS_BACKUP_DIR": "/path/to/backup/directory"   // Backup directory (default: storage_dir/backups)
      }
    }
  }
}
```

All environment variables are optional and will use the default values shown above if not specified. The only required variable is `ATLAS_STORAGE_DIR` which specifies where to store the database and log files.

## Task Structure

Tasks support rich content and metadata within a hierarchical structure:

```typescript
{
  // Path must follow validation rules:
  // - No parent directory traversal (..)
  // - Only alphanumeric, dash, underscore
  // - Max depth of 5 levels
  // - Valid project name as first segment
  "path": "project/feature/task",
  
  "name": "Implementation Task",
  "description": "Implement core functionality",
  "type": "TASK", // TASK or MILESTONE
  "status": "PENDING",
  
  // Parent path must exist and follow same rules
  "parentPath": "project/feature",
  
  // Dependencies are validated for:
  // - Existence
  // - No circular references
  // - Status transitions
  "dependencies": ["project/feature/design"],
  
  // Metadata supports any JSON-serializable data
  "metadata": {
    "priority": "high",
    "tags": ["core", "implementation"],
    "estimatedHours": 8,
    "assignee": "john.doe",
    "customField": {
      "nested": {
        "value": 123
      }
    }
  },

  // System fields
  "created": "10:00:00 AM 1/28/2024",
  "updated": "10:01:00 AM 1/28/2024",
  "projectPath": "project",
  "version": 1
}
```

## Tools

### Task Management

#### create_task
Creates tasks with validation and dependency checks:
```typescript
// Request
{
  "path": "project/backend",
  "name": "Backend Development",
  "type": "TASK",
  "description": "Implement core backend services",
  "metadata": {
    "priority": "high",
    "tags": ["backend", "api"]
  }
}

// Success Response
{
  "success": true,
  "data": {
    "path": "project/backend",
    "name": "Backend Development",
    "type": "TASK",
    "status": "PENDING",
    // ... other fields
  }
}

// Error Response
{
  "error": "Invalid path format",
  "code": "PATH_INVALID"
}
```

#### update_task
Updates tasks with status and dependency validation:
```typescript
// Request
{
  "path": "project/backend/api",
  "updates": {
    "status": "IN_PROGRESS",
    "dependencies": ["project/backend/database"],
    "metadata": {
      "progress": 50,
      "assignee": "team-member"
    }
  }
}

// Success Response
{
  "success": true,
  "data": {
    "path": "project/backend/api",
    "status": "IN_PROGRESS",
    // ... updated fields
  }
}

// Error Response
{
  "error": "Invalid status transition",
  "code": "TASK_STATUS"
}
```

#### bulk_task_operations
Executes multiple operations atomically with intelligent dependency handling:
```typescript
// Request
{
  "operations": [
    {
      "type": "create",
      "path": "project/backend/database",
      "data": {
        "name": "Database Setup",
        "type": "TASK",
        "description": "Set up and configure database"
      }
    },
    {
      "type": "create",
      "path": "project/backend/api",
      "data": {
        "name": "API Development",
        "type": "TASK",
        "description": "Implement REST API endpoints",
        "dependencies": ["project/backend/database"]  // Forward-looking dependency
      }
    }
  ]
}

// Success Response
{
  "success": true,
  "data": [
    // Tasks are created in dependency order
    {
      "path": "project/backend/database",
      "name": "Database Setup",
      // ... other fields
    },
    {
      "path": "project/backend/api",
      "name": "API Development",
      "dependencies": ["project/backend/database"],
      // ... other fields
    }
  ],
  "metadata": {
    "operationCount": 2,
    "successCount": 2
  }
}
```

// Error Response
{
  "error": "Transaction failed: Invalid status transition",
  "code": "TRANSACTION_FAILED"
}
```

### Task Queries

#### get_tasks_by_status
Retrieve tasks by execution state:
```typescript
{
  "status": "IN_PROGRESS"
}
```

#### get_tasks_by_path
Search using glob patterns:
```typescript
{
  "pattern": "project/backend/**"
}
```

#### get_subtasks
List immediate child tasks:
```typescript
{
  "parentPath": "project/backend"
}
```

### Maintenance Tools

#### vacuum_database
Optimize database storage and performance:
```typescript
{
  "analyze": true // Also updates statistics
}
```

#### repair_relationships
Fix task relationship inconsistencies:
```typescript
{
  "dryRun": true,
  "pathPattern": "project/**"
}
```

#### clear_all_tasks
Reset database with confirmation:
```typescript
{
  "confirm": true
}
```

### Batch Operations

#### update_task_statuses
Update multiple task statuses atomically:
```typescript
{
  "updates": [
    {
      "path": "project/backend/api",
      "status": "COMPLETED"
    },
    {
      "path": "project/backend/database",
      "status": "IN_PROGRESS"
    }
  ]
}
```

#### update_task_dependencies
Update multiple task dependencies atomically:
```typescript
{
  "updates": [
    {
      "path": "project/backend/api",
      "dependencies": ["project/backend/auth", "project/backend/database"]
    },
    {
      "path": "project/backend/auth",
      "dependencies": ["project/backend/database"]
    }
  ]
}
```

## Best Practices

### Task Management
- Use descriptive path names reflecting hierarchy
- Set appropriate task types (TASK, MILESTONE)
- Include detailed descriptions for context
- Use metadata for custom fields
- Dependency management:
  - Plan dependency structure before creation
  - Create tasks in dependency order when possible
  - Use bulk operations for complex dependency chains
  - Validate circular dependencies
  - Consider using deferred validation for initial setup
  - Document dependency relationships
  - Keep dependency chains manageable
  - Regular dependency health checks
- Maintain clean parent-child relationships
- Use batch operations for related changes
- Follow status transition rules:
  - PENDING → IN_PROGRESS, BLOCKED
  - IN_PROGRESS → COMPLETED, FAILED, BLOCKED
  - BLOCKED → PENDING, IN_PROGRESS
  - COMPLETED/FAILED are terminal states
- Validate dependency status compatibility
- Handle blocked states appropriately
- Document status change reasons in metadata
- Use appropriate error handling strategies
- Monitor task progression and bottlenecks
- Keep task hierarchies manageable (max 5 levels)
- Regularly clean up completed/failed tasks

### Path Naming
- Use alphanumeric characters, dash, underscore
- Keep paths short and meaningful
- Start with valid project name
- Avoid special characters
- Use forward slashes
- Keep depth under 5 levels
- Use consistent naming conventions
- Avoid duplicate paths
- Consider path readability
- Plan for future expansion

### Performance
- Use bulk operations for multiple updates
- Keep task hierarchies shallow
- Clean up completed tasks regularly
- Monitor memory usage
- Use appropriate batch sizes
- Maintain proper indexes
- Schedule regular maintenance
- Monitor cache hit rates
- Optimize query patterns
- Use transaction batching
- Regular vacuum operations
- Configure rate limits appropriately
- Enable metrics collection in production
- Monitor retry patterns and adjust settings
- Use structured logging for better analysis

### Data Integrity
- Validate inputs before operations
- Handle status transitions properly
- Check for circular dependencies
- Maintain metadata consistency
- Use transactions for related changes
- Regular database maintenance
- Monitor health metrics
- Verify relationship integrity
- Handle edge cases gracefully
- Implement proper error recovery
- Regular backup procedures
- Test backup restoration periodically
- Monitor backup success rates
- Implement backup retention policies
- Verify backup integrity

### Monitoring
- Enable metrics collection
- Monitor rate limit usage
- Track retry patterns
- Watch cache hit rates
- Monitor database performance
- Check backup success/failure
- Track API response times
- Monitor error rates
- Set up alerts for critical issues
- Review logs regularly
- Monitor disk usage
- Track memory consumption
- Watch connection pool usage
- Monitor task completion rates
- Check relationship integrity

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

For bugs and feature requests, please create an issue.

## License

Apache License 2.0

---

<div align="center">
Built with the Model Context Protocol
</div>
