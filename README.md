# ATLAS MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.0.4-green.svg)](https://modelcontextprotocol.io/)
[![Version](https://img.shields.io/badge/Version-1.2.0-blue.svg)]()
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-blue.svg)]()
[![GitHub](https://img.shields.io/github/stars/cyanheads/atlas-mcp-server?style=social)](https://github.com/cyanheads/atlas-mcp-server)

ATLAS (Adaptive Task & Logic Automation System) is a Model Context Protocol server that provides
path-based task management capabilities to Large Language Models. This tool enables LLMs to manage
complex tasks and dependencies through a robust and flexible API.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Templates](#templates)
- [Task Structure](#task-structure)
- [Tools](#tools)
- [Best Practices](#best-practices)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Overview

ATLAS implements the Model Context Protocol (MCP), enabling standardized communication between LLMs
and external systems through:

- **Clients** (Claude Desktop, IDEs) that maintain server connections
- **Servers** that provide tools and resources (Like our ATLAS MCP Server)
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

- Path-based task organization
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
- Advanced memory management:
  - Progressive cache reduction
  - Memory pressure monitoring
  - Smart eviction strategies
  - Detailed memory metrics
- Platform-specific optimizations
- Circuit breaker pattern for reliability

### Validation & Safety

- Path validation and sanitization
- Dependency cycle prevention
- Status transition validation
- Schema enforcement
- Relationship integrity checks

### Error Handling & Monitoring

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

Monitoring capabilities:

- Memory pressure tracking
- Cache utilization metrics
- Performance analytics
- Health monitoring with:
  - Memory usage patterns
  - Cache efficiency metrics
  - Operation latency tracking
  - Resource pressure alerts

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
        "ATLAS_STORAGE_NAME": "atlas-tasks", // Optional, defaults to atlas-tasks
        "NODE_ENV": "production", // Optional, defaults to development
        "ATLAS_LOG_LEVEL": "info", // Optional, defaults to debug
        "ATLAS_MAX_MEMORY": "1024", // Optional, in MB, defaults to 25% of system memory
        "ATLAS_CHECKPOINT_INTERVAL": "30000" // Optional, in ms, defaults to 30000
      }
    }
  }
}
```

## Templates

ATLAS provides built-in templates for common task structures:

### Software Engineering Team Templates

A comprehensive set of templates for managing software engineering teams:

- **Team Coordinator**: Overall team coordination and milestone tracking
- **Product Designer**: User research and product design
- **System Architect**: System design and infrastructure planning
- **Security Engineer**: Security implementation and compliance
- **DevOps Engineer**: Infrastructure automation and deployment
- **Tech Lead**: Development standards and quality

Usage:

```typescript
{
  "templateId": "llm-software-team",
  "variables": {
    "projectName": "my-project",
    "teamScale": "growth",
    "developmentMethodology": "agile",
    "securityLevel": "high",
    "complianceFrameworks": "OWASP,SOC2"
  }
}
```

See [templates/README.md](templates/README.md) for detailed template documentation.

## Task Structure

Tasks follow a path-based format where relationships are established through forward-slash separated
paths:

```typescript
{
  // Core identification
  "path": "project/feature/task",          // Max length: 1000, Max depth: 10
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

  // Flexible metadata (Max total size: 100KB)
  "metadata": {
    // Common patterns (all fields optional)
    "priority": "high",
    "tags": ["security", "api"],
    "category": "backend",
    "component": "authentication",

    // Technical details (flexible structure)
    "technicalRequirements": {
      "language": "typescript",
      "framework": "express",
      "dependencies": ["jwt", "bcrypt"],
      "environment": "node.js",
      // Additional fields as needed
      "performance": {
        "memory": "512MB",
        "cpu": "2 cores",
        "latency": "<100ms"
      }
    },

    // Quality & progress (flexible structure)
    "quality": {
      "testingRequirements": ["unit", "integration"],
      "coverage": 90,
      "metrics": {
        "complexity": 5,
        "performance": ["<100ms response"]
      }
    },

    // Custom fields (any additional metadata)
    "customFields": {
      "scope": "internal",
      "impact": "high",
      "criticality": "essential"
    }
  },

  // Notes (Max 25 notes per category, max 2000 chars each)
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

  // Flexible metadata (Max total size: 100KB)
  "metadata": {
    // Core fields
    "priority": "high",
    "tags": ["security", "api"],
    "reasoning": "Required for secure API access",

    // Technical requirements (flexible structure)
    "technicalRequirements": {
      "language": "typescript",
      "framework": "node",
      "dependencies": ["jsonwebtoken", "express-rate-limit"],
      "environment": "Node.js v18+",
      "requirements": [
        "Implement JWT generation and validation",
        "Add refresh token mechanism",
        "Implement rate limiting"
      ]
    },

    // Validation criteria (flexible structure)
    "acceptanceCriteria": {
      "criteria": [
        "All security tests pass",
        "Performance meets SLA requirements"
      ],
      "testCases": [
        "Verify token generation",
        "Test rate limiting"
      ]
    }
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
          "tags": ["security", "api", "oauth2"],
          "reasoning": "OAuth2 provides better security and standardization",
          "technicalRequirements": {
            "language": "typescript",
            "framework": "node",
            "dependencies": ["oauth2-server", "passport"],
            "environment": "Node.js v18+"
          },
          "acceptanceCriteria": {
            "criteria": [
              "OAuth2 flows implemented",
              "Security best practices followed"
            ],
            "testCases": [
              "Test authorization flows",
              "Verify token handling"
            ]
          }
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
          "technicalRequirements": {
            "language": "typescript",
            "framework": "node",
            "dependencies": ["passport-google-oauth20", "passport-github2"],
            "environment": "Node.js v18+",
            "requirements": [
              "Configure Google OAuth2",
              "Configure GitHub OAuth2"
            ]
          },
          "acceptanceCriteria": {
            "criteria": [
              "OAuth2 providers configured",
              "Authentication flows tested"
            ]
          }
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
- Under memory pressure

Best practices:

- Run during low activity
- Monitor space usage
- Schedule regularly
- Backup before running
- Check performance impact
- Monitor memory metrics:
  - Heap usage
  - Cache pressure
  - Memory fragmentation

### repair_relationships

Fix task path and dependency issues:

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

## Resources

ATLAS exposes two main resources through the MCP protocol:

### Task Overview Resource

Access real-time task information:

```typescript
// Resource URI
tasklist://current

// Returns
{
  "timestamp": "2024-01-28T10:00:00Z",
  "totalTasks": 42,
  "statusCounts": {
    "PENDING": 10,
    "IN_PROGRESS": 15,
    "COMPLETED": 12,
    "BLOCKED": 3,
    "CANCELLED": 2
  },
  "recentUpdates": [
    {
      "path": "project/backend/auth",
      "status": "COMPLETED",
      "timestamp": "2024-01-28T09:55:00Z"
    }
  ],
  "metrics": {
    "averageCompletionTime": "3.5 days",
    "blockageRate": "7%",
    "progressRate": "tasks/day: 4.2"
  }
}
```

### Template Resource

Access available task templates and their metadata:

```typescript
// Resource URI
templates://current

// Returns
{
  "timestamp": "2024-01-28T10:00:00Z",
  "totalTemplates": 6,
  "templates": [
    {
      "id": "software-team",
      "name": "Software Engineering Team",
      "description": "Complete software team structure with roles and responsibilities",
      "tags": ["software", "team", "engineering"],
      "variables": [
        {
          "name": "projectName",
          "description": "Name of the project",
          "required": true
        },
        {
          "name": "teamScale",
          "description": "Team size category (startup, growth, enterprise)",
          "required": true,
          "default": "growth"
        },
        {
          "name": "developmentMethodology",
          "description": "Development methodology to use",
          "required": false,
          "default": "agile"
        }
      ]
    }
  ]
}
```

Access these resources through standard MCP endpoints:

```typescript
// List available resources
GET resources/list
-> Returns both tasklist://current and templates://current

// Get task overview
GET resources/read?uri=tasklist://current
-> Returns current task statistics

// Get template overview
GET resources/read?uri=templates://current
-> Returns all template information
```

## Best Practices

### Task Management

- Use descriptive, well-structured paths (e.g., "project/component/feature")
- Keep dependencies manageable
- Document changes in metadata
- Use batch operations for related changes
- Follow status transition rules
- Validate dependency compatibility
- Monitor task progression

### Performance

- Use bulk operations for multiple updates
- Keep path structures shallow (max 10 levels, enforced by path validation)
- Regular database maintenance
- Advanced memory management:
  - Progressive cache reduction
  - Memory pressure monitoring
  - Smart eviction strategies
  - Cache efficiency optimization
- Use appropriate batch sizes with retry mechanism
- Implement circuit breakers for stability
- Configure platform-specific optimizations
- Monitor system health:
  - Memory usage patterns
  - Cache hit ratios
  - Operation latencies
  - Resource pressure

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
