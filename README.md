# ATLAS MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.0.4-green.svg)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-green.svg)]()
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

### Core Components

- **TaskManager**: Centralized task coordination with validation and event handling
- **TaskOperations**: ACID-compliant task operations with transaction support
- **TaskValidator**: Comprehensive validation with Zod schemas and dependency checks
- **StorageManager**: SQLite-based persistence with WAL mode and connection management
- **EventManager**: System-wide event tracking and notification
- **BatchProcessors**: Optimized bulk operations for status and dependency updates

## Features

### Task Organization
- Hierarchical task structure with parent-child relationships
- Strong type validation (TASK, GROUP, MILESTONE)
- Status management (PENDING, IN_PROGRESS, COMPLETED, FAILED, BLOCKED)
- Dependency tracking with cycle detection
- Rich metadata support with schema validation

### Storage & Performance
- SQLite backend with Write-Ahead Logging (WAL)
- LRU caching with memory pressure monitoring
- Transaction-based operations with rollback
- Batch processing for bulk updates
- Index-based fast retrieval
- Automatic cache management

### Validation & Safety
- Zod schema validation for all inputs
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

### Error Handling
- Detailed error codes and messages
- Transaction safety with rollback
- Retryable operation support
- Rich error context
- Event-based error tracking

## Installation

1. Clone the repository:
```bash
git clone https://github.com/cyanheads/atlas-mcp-server.git
cd atlas-mcp-server
npm install
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
        "ATLAS_STORAGE_DIR": "/path/to/storage/directory",
        "ATLAS_STORAGE_NAME": "atlas-tasks",
        "NODE_ENV": "production"
      }
    }
  }
}
```

Advanced configuration options:
```json
{
  "storage": {
    "connection": {
      "maxRetries": 3,
      "retryDelay": 500,
      "busyTimeout": 2000
    },
    "performance": {
      "checkpointInterval": 60000,
      "cacheSize": 1000,
      "mmapSize": 1073741824,
      "pageSize": 4096
    }
  },
  "logging": {
    "console": true,
    "file": true,
    "level": "debug"
  }
}
```

## Task Structure

Tasks support rich content and metadata within a hierarchical structure:

```typescript
{
  "path": "project/feature/task",
  "name": "Implementation Task",
  "description": "Implement core functionality",
  "type": "TASK",
  "status": "PENDING",
  "parentPath": "project/feature",
  "dependencies": ["project/feature/design"],
  "notes": [
    "# Requirements\n- Feature A\n- Feature B",
    "interface Feature {\n  name: string;\n  enabled: boolean;\n}"
  ],
  "metadata": {
    "priority": "high",
    "tags": ["core", "implementation"],
    "created": 1703094689310,
    "updated": 1703094734316,
    "projectPath": "project",
    "version": 1
  }
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
  "type": "GROUP",
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
        "type": "GROUP"
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
  "analyze": true
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

## Best Practices

### Task Management
- Use descriptive path names reflecting hierarchy
- Set appropriate task types (TASK, GROUP, MILESTONE)
- Include detailed descriptions for context
- Use metadata for custom fields
- Consider dependencies carefully
- Maintain clean parent-child relationships

### Performance
- Use bulk operations for multiple updates
- Keep task hierarchies shallow (max 8 levels)
- Clean up completed tasks regularly
- Monitor memory usage
- Use appropriate batch sizes
- Maintain proper indexes

### Data Integrity
- Validate inputs before operations
- Handle status transitions properly
- Check for circular dependencies
- Maintain metadata consistency
- Use transactions for related changes
- Regular database maintenance

## Development

```bash
npm run build    # Build project
npm run watch    # Watch for changes
npm test        # Run tests
```

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
