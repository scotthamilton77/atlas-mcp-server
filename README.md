# ATLAS MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.0.4-green.svg)](https://modelcontextprotocol.io/)
[![Version](https://img.shields.io/badge/Version-1.2.0-blue.svg)]()
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-blue.svg)]()
[![GitHub](https://img.shields.io/github/stars/cyanheads/atlas-mcp-server?style=social)](https://github.com/cyanheads/atlas-mcp-server)

ATLAS (Adaptive Task & Logic Automation System) is a Model Context Protocol server that provides hierarchical task management capabilities to Large Language Models. This tool enables LLMs to manage complex tasks and dependencies through a robust and flexible API.

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

ATLAS implements the Model Context Protocol (MCP), enabling standardized communication between LLMs and external systems through:

- **Clients** (Claude Desktop, IDEs) that maintain server connections
- **Servers** that provide tools and resources
- **LLMs** that interact with servers through client applications

### Core Components

- **TaskStore**: Central task storage and retrieval with ACID compliance
- **TaskValidator**: Comprehensive validation with dependency cycle detection
- **SqliteStorage**: Robust SQLite-based persistence with WAL and transaction support
- **BatchProcessor**: Optimized bulk operations with retry mechanism and dead letter queue
- **EventManager**: Enhanced event system with circuit breaker and health monitoring
- **ProcessManager**: Robust process lifecycle management with graceful shutdown
- **ErrorHandler**: Structured error handling with severity levels and context

## Features

### Task Management

- Hierarchical task organization
- Strong type validation (TASK, MILESTONE)
- Status management with transition rules
- Parent-child relationship validation
- Dependency cycle detection
- Rich metadata support
- Automatic subtask management
- Categorized notes (planning, progress, completion, troubleshooting)
- Technical requirements tracking
- Priority levels and tagging

### Storage & Performance

- SQLite backend with Write-Ahead Logging (WAL)
- ACID-compliant transactions
- Batch processing with retry mechanism
- Connection pooling with health monitoring
- Automatic checkpointing and maintenance
- Memory usage optimization
- Platform-specific optimizations
- Circuit breaker pattern for reliability

### Validation & Safety

- Path validation and sanitization
- Dependency cycle prevention
- Status transition validation
- Schema enforcement
- Relationship integrity checks

### Error Handling

Error severity levels:
- CRITICAL: Database/storage failures
- HIGH: Missing resources, transaction issues
- MEDIUM: Validation/dependency problems
- LOW: Non-critical operational issues

Error context tracking:
- Operation details
- Timestamps
- Stack traces
- Metadata

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
        "ATLAS_STORAGE_DIR": "/path/to/storage/directory", // Optional, defaults to ~/Documents/Cline/mcp-workspace/ATLAS
        "ATLAS_STORAGE_NAME": "atlas-tasks",               // Optional, defaults to atlas-tasks
        "NODE_ENV": "production",                          // Optional, defaults to development
        "ATLAS_LOG_LEVEL": "info",                        // Optional, defaults to debug
        "ATLAS_MAX_MEMORY": "1024",                       // Optional, in MB, defaults to 25% of system memory
        "ATLAS_CHECKPOINT_INTERVAL": "30000"              // Optional, in ms, defaults to 30000
      }
    }
  }
}
```

## Task Structure

Tasks follow a structured format:

```typescript
{
  // Core identification
  "path": "project/feature/task",          // Max length: 255, Max depth: 7
  "name": "Implementation Task",           // Max length: 200
  "description": "Implement functionality", // Max length: 2000
  "type": "TASK",                         // TASK or MILESTONE
  "status": "PENDING",                    // PENDING, IN_PROGRESS, COMPLETED, BLOCKED, CANCELLED

  // Relationships
  "dependencies": ["project/feature/design"], // Max: 50 dependencies
  "parentPath": "project/feature",

  // Status metadata
  "statusMetadata": {
    "lastUpdated": "10:00:00 AM 1/28/2024",
    "assignee": "developer1",
    "progress_indicators": ["Design complete", "Implementation started"],
    "blockedBy": [],
    "blockedReason": "",
    "completedBy": "",
    "verificationStatus": "passed"
  },

  // Rich metadata
  "metadata": {
    // Classification
    "category": "backend",
    "component": "authentication",
    "platform": "node.js",
    "scope": "internal",
    "tags": ["security", "api"],          // Max: 10 tags

    // Priority
    "priority": "high",                   // low, medium, high
    "criticality": "essential",
    "impact": "high",

    // Technical
    "language": "typescript",
    "framework": "express",
    "tools": ["jwt", "bcrypt"],
    "requirements": [
      "Implement error handling",
      "Add comprehensive logging",
      "Handle edge cases"
    ],

    // Quality
    "testingRequirements": [
      "Unit tests required",
      "Integration tests required"
    ],
    "qualityMetrics": {
      "coverage": 90,
      "complexity": 5,
      "performance": ["<100ms response time"]
    }
  },

  // Notes (Max 25 notes per category)
  "planningNotes": [
    "Review security requirements",
    "Design authentication flow"
  ],
  "progressNotes": [
    "Implemented JWT handling",
    "Added error handling"
  ],
  "completionNotes": [],
  "troubleshootingNotes": []
}
```

## Tools

### create_task

Create a new task in the system:

```typescript
{
  // Required fields
  "path": "project/backend/auth",
  "title": "Implement JWT Authentication",

  // Optional fields
  "type": "TASK",                                    // Defaults to TASK
  "description": "Add JWT-based authentication system with comprehensive security measures",
  "parentPath": "project/backend",                   // For organizing subtasks
  "dependencies": ["project/backend/database"],      // Tasks that must be completed first

  // Rich metadata
  "metadata": {
    "priority": "high",
    "tags": ["security", "api"],
    "reasoning": "Required for secure API access",
    "technical_requirements": [
      "Implement JWT generation and validation",
      "Add refresh token mechanism",
      "Implement rate limiting"
    ],
    "acceptance_criteria": [
      "All security tests pass",
      "Performance meets SLA requirements"
    ]
  },

  // Categorized notes
  "planningNotes": [
    "Research JWT best practices",
    "Design token refresh flow"
  ],
  "progressNotes": [],                              // Track implementation progress
  "completionNotes": [],                            // Document completion details
  "troubleshootingNotes": []                        // Record and resolve issues
}
```

### delete_task

Remove a task and its children:

```typescript
{
  "path": "project/backend/deprecated-auth",
  "reasoning": "Removing deprecated authentication implementation"
}
```

### bulk_task_operations

Execute multiple task operations atomically:

```typescript
{
  "operations": [
    // Create milestone for new feature
    {
      "type": "create",
      "path": "project/backend/oauth2",
      "data": {
        "title": "Implement OAuth2 Authentication",
        "type": "MILESTONE",
        "description": "Replace JWT auth with OAuth2 implementation",
        "metadata": {
          "priority": "high",
          "component": "authentication",
          "tags": ["security", "api", "oauth2"],
          "reasoning": "OAuth2 provides better security and standardization"
        },
        "planningNotes": [
          "Research OAuth2 providers",
          "Define integration requirements"
        ]
      }
    },
    // Create subtask with dependencies
    {
      "type": "create",
      "path": "project/backend/oauth2/provider-setup",
      "data": {
        "title": "Configure OAuth2 Providers",
        "type": "TASK",
        "dependencies": ["project/backend/oauth2"],
        "metadata": {
          "priority": "high",
          "technical_requirements": [
            "Configure Google OAuth2",
            "Configure GitHub OAuth2"
          ]
        },
        "planningNotes": [
          "List required OAuth2 providers",
          "Document configuration requirements"
        ]
      }
    },
    // Update existing task status
    {
      "type": "update",
      "path": "project/backend/auth",
      "data": {
        "status": "CANCELLED",
        "statusMetadata": {
          "lastUpdated": "2024-01-28T10:00:00Z",
          "completedBy": "system"
        },
        "completionNotes": [
          "Functionality replaced by OAuth2 implementation"
        ],
        "metadata": {
          "reasoning": "Replaced by OAuth2 implementation",
          "migrationPath": "project/backend/oauth2"
        }
      }
    }
  ],
  "reasoning": "Transitioning authentication system to OAuth2. Creating necessary task structure and updating existing tasks to reflect the change."
}
```

Operations are executed in dependency order and rolled back on failure. Each operation can:
- Create new tasks with full metadata and notes
- Update existing tasks while preserving required fields
- Delete tasks and update dependent references

### clear_all_tasks

Reset the task database:

```typescript
{
  "confirm": true,                                // Required to prevent accidental deletion
  "reasoning": "Resetting task structure for Q2 planning. Previous tasks archived at /backup/2024Q1, new structure defined in planning/2024Q2.md"
}
```

When to use:
- Starting fresh project phase
- Major project restructuring
- Development environment reset
- Test environment cleanup

Best practices:
- Backup data before clearing
- Document clear reasoning
- Consider selective deletion
- Plan new task structure

### vacuum_database

Optimize database storage and performance:

```typescript
{
  "analyze": true,                                // Optional, defaults to true
  "reasoning": "Running optimization after bulk task deletion to reclaim space and update query statistics"
}
```

When to use:
- After bulk operations
- During maintenance windows
- When performance degrades
- After large deletions

Best practices:
- Run during low activity
- Monitor space usage
- Schedule regularly
- Backup before running
- Check performance impact

### repair_relationships

Fix task hierarchy and dependency issues:

```typescript
{
  "dryRun": true,                                // Optional, defaults to false
  "reasoning": "Checking for relationship issues after recent bulk operations. Using dry-run to assess repairs needed."
}
```

When to use:
- After failed operations
- Fixing circular dependencies
- Resolving orphaned tasks
- Maintaining task integrity

Best practices:
- Run dry-run first
- Fix critical paths
- Verify results
- Document changes
- Update affected tasks

## Best Practices

### Task Management

- Use descriptive paths reflecting hierarchy
- Keep dependencies manageable
- Document changes in metadata
- Use batch operations for related changes
- Follow status transition rules
- Validate dependency compatibility
- Monitor task progression

### Performance

- Use bulk operations for multiple updates
- Keep task hierarchies shallow
- Regular database maintenance
- Monitor memory usage with automatic optimization
- Use appropriate batch sizes with retry mechanism
- Implement circuit breakers for stability
- Configure platform-specific optimizations

### Error Handling

- Check operation responses
- Handle errors by severity
- Validate inputs
- Use transactions for related changes
- Monitor error patterns
- Implement proper recovery

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
