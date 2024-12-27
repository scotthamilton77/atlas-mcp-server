# ATLAS MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.0.4-green.svg)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Beta-yellow.svg)]()
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
- Status management (PENDING, IN_PROGRESS, COMPLETED, FAILED, BLOCKED)
- Dependency tracking with cycle detection
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
- LRU caching with memory pressure monitoring
- Batch processing for bulk updates
- Index-based fast retrieval
- Automatic cache management
- Memory usage optimization

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

### Error Handling
- Detailed error codes and messages
- Transaction safety with rollback
- Retryable operation support
- Rich error context
- Event-based error tracking
- Cross-platform compatibility

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
        // Storage Configuration
        "ATLAS_STORAGE_DIR": "/path/to/storage/directory",  // Base directory for storage and logs
        "ATLAS_STORAGE_NAME": "atlas-tasks",                // Database name (default: atlas-tasks)
        "NODE_ENV": "production",                           // Environment (development/production)

        // Logging Configuration
        "ATLAS_LOG_CONSOLE": "true",                       // Enable console logging (default: true)
        "ATLAS_LOG_FILE": "true",                          // Enable file logging (default: true)
        "ATLAS_LOG_LEVEL": "debug",                        // Log level (debug/info/warn/error)
        "ATLAS_LOG_MAX_FILES": "5",                        // Maximum log files to keep (default: 5)
        "ATLAS_LOG_MAX_SIZE": "5242880",                   // Max log file size in bytes (default: 5MB)

        // Database Connection
        "ATLAS_DB_MAX_RETRIES": "3",                      // Max connection retry attempts (default: 3)
        "ATLAS_DB_RETRY_DELAY": "500",                    // Retry delay in ms (default: 500)
        "ATLAS_DB_BUSY_TIMEOUT": "2000",                  // Busy timeout in ms (default: 2000)

        // Database Performance
        "ATLAS_DB_CHECKPOINT_INTERVAL": "60000",          // Checkpoint interval in ms (default: 60000)
        "ATLAS_DB_CACHE_SIZE": "1000",                    // LRU cache size (default: 1000)
        "ATLAS_DB_MMAP_SIZE": "1073741824",              // Memory map size in bytes (default: 1GB)
        "ATLAS_DB_PAGE_SIZE": "4096"                      // Database page size (default: 4096)
      }
    }
  }
}
```

All environment variables are optional and will use the default values shown above if not specified. The only required variable is `ATLAS_STORAGE_DIR` which specifies where to store the database and log files.

The configuration is divided into several categories:

### Storage Configuration
- `ATLAS_STORAGE_DIR`: Base directory for all storage and log files
- `ATLAS_STORAGE_NAME`: Name of the SQLite database file
- `NODE_ENV`: Environment setting affecting various optimizations

### Logging Configuration
- `ATLAS_LOG_CONSOLE`: Enable/disable console logging
- `ATLAS_LOG_FILE`: Enable/disable file logging
- `ATLAS_LOG_LEVEL`: Set logging verbosity
- `ATLAS_LOG_MAX_FILES`: Number of log files to keep
- `ATLAS_LOG_MAX_SIZE`: Maximum size per log file

### Database Connection
- `ATLAS_DB_MAX_RETRIES`: Connection retry attempts
- `ATLAS_DB_RETRY_DELAY`: Delay between retries
- `ATLAS_DB_BUSY_TIMEOUT`: SQLite busy timeout

### Database Performance
- `ATLAS_DB_CHECKPOINT_INTERVAL`: WAL checkpoint frequency
- `ATLAS_DB_CACHE_SIZE`: LRU cache entry limit
- `ATLAS_DB_MMAP_SIZE`: Memory map size for performance
- `ATLAS_DB_PAGE_SIZE`: SQLite page size

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
  "created": 1703094689310,
  "updated": 1703094734316,
  "projectPath": "project",
  "version": 1
}
```

## Tools

### Task Management

#### create_task
Creates tasks with validation and dependency checks:
```typescript
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
```

#### update_task
Updates tasks with status and dependency validation:
```typescript
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
```

#### bulk_task_operations
Executes multiple operations atomically:
```typescript
{
  "operations": [
    {
      "type": "create",
      "path": "project/frontend",
      "data": {
        "name": "Frontend Development",
        "type": "TASK"
      }
    },
    {
      "type": "update",
      "path": "project/backend",
      "data": {
        "status": "COMPLETED"
      }
    }
  ]
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
- Consider dependencies carefully
- Maintain clean parent-child relationships
- Use batch operations for related changes

### Path Naming
- Use alphanumeric characters, dash, underscore
- Keep paths short and meaningful
- Start with valid project name
- Avoid special characters
- Use forward slashes
- Keep depth under 5 levels

### Performance
- Use bulk operations for multiple updates
- Keep task hierarchies shallow
- Clean up completed tasks regularly
- Monitor memory usage
- Use appropriate batch sizes
- Maintain proper indexes
- Schedule regular maintenance

### Data Integrity
- Validate inputs before operations
- Handle status transitions properly
- Check for circular dependencies
- Maintain metadata consistency
- Use transactions for related changes
- Regular database maintenance
- Monitor health metrics

## Development

```bash
# Install dependencies
npm install

# Build project
npm run build

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
