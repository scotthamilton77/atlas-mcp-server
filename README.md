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

- **TaskStore**: Path-based task storage with caching, batch processing, and ACID compliance
- **Status Management**: State machine with validation and dependency-aware updates
- **Dependency System**: Graph-based management with cycle detection and impact analysis
- **StorageManager**: SQLite integration for durable data persistence
- **ValidationSystem**: Data integrity with Zod schema validation
- **Performance Monitoring**: Rate limiting, health tracking, and metrics collection

## Features

### Task Organization
- Hierarchical structures (max 8 levels) with parent-child relationships
- Dependency management and validation
- Status tracking and propagation
- Bulk operations support
- Session-based isolation

### Content Support
- Markdown documentation
- Code snippets with syntax highlighting
- JSON data with schema validation
- Rich metadata and tagging
- Decision history tracking
- Cross-reference support

### System Features

#### Storage & Performance
- Memory-optimized operations (512MB cache)
- SQLite optimization with WAL mode
- Connection pooling and retry logic
- Automatic cache management
- Index-based retrieval
- Batch processing support

#### Monitoring & Maintenance
- Health monitoring and metrics
- Rate limiting (100 req/min)
- Resource utilization tracking
- Database optimization
- Relationship repair
- Cache management

#### Error Handling
- Comprehensive validation
- Transaction rollback
- State preservation
- Recovery procedures
- Detailed error context
- Debug information

## Installation

1. Clone the repository:
\`\`\`bash
git clone https://github.com/cyanheads/atlas-mcp-server.git
cd atlas-mcp-server
npm install
\`\`\`

## Configuration

Add to your MCP client settings:

\`\`\`json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["/path/to/atlas-mcp-server/build/index.js"],
      "env": {
        "ATLAS_STORAGE_DIR": "/path/to/storage/directory",
        "ATLAS_STORAGE_NAME": "atlas-tasks",
        "ATLAS_MAX_RETRIES": "3",
        "ATLAS_RETRY_DELAY": "1000",
        "ATLAS_BUSY_TIMEOUT": "5000",
        "ATLAS_CHECKPOINT_INTERVAL": "300000",
        "ATLAS_CACHE_SIZE": "2000",
        "ATLAS_MMAP_SIZE": "30000000000",
        "ATLAS_PAGE_SIZE": "4096"
      }
    }
  }
}
\`\`\`

## Task Structure

Tasks support rich content and metadata within a hierarchical structure:

\`\`\`typescript
{
  "name": "Implementation Task",
  "description": "Implement core functionality",
  "type": "task",
  "notes": [
    "# Requirements\n- Feature A\n- Feature B",
    "interface Feature {\n  name: string;\n  enabled: boolean;\n}"
  ],
  "reasoning": "Modular development approach chosen for reusability",
  "metadata": {
    "priority": "high",
    "tags": ["core", "implementation"],
    "created": 1703094689310,
    "updated": 1703094734316,
    "version": 1
  }
}
\`\`\`

## Tools

### Task Management

#### create_task
Creates tasks with path-based hierarchy:
\`\`\`typescript
{
  "name": "Backend Development",
  "path": "project/backend",
  "type": "MILESTONE",
  "description": "Implement core backend services",
  "metadata": {
    "priority": "high",
    "tags": ["backend", "api"]
  }
}
\`\`\`

#### bulk_task_operations
Executes multiple task operations in sequence:
\`\`\`typescript
{
  "operations": [
    {
      "type": "create",
      "path": "project/frontend",
      "data": {
        "name": "Frontend Development",
        "type": "MILESTONE"
      }
    },
    {
      "type": "update",
      "path": "project/frontend/ui",
      "data": {
        "status": "IN_PROGRESS"
      }
    }
  ]
}
\`\`\`

#### update_task
Updates existing tasks with validation:
\`\`\`typescript
{
  "path": "project/frontend/ui/button",
  "updates": {
    "status": "IN_PROGRESS",
    "dependencies": ["project/frontend/ui/design-system"]
  }
}
\`\`\`

### Task Retrieval

- **get_tasks_by_status**: Filter by execution state
- **get_tasks_by_path**: Search using glob patterns
- **get_subtasks**: List immediate child tasks
- **get_task_tree**: Retrieve complete hierarchy

### Maintenance

- **vacuum_database**: Optimize storage and performance
- **repair_relationships**: Fix task relationship inconsistencies

## Best Practices

### Task Management
- Create parent tasks before subtasks
- Use descriptive, action-oriented names
- Document reasoning and context
- Maintain clean hierarchies
- Handle dependencies carefully
- Monitor task relationships

### Performance
- Use bulk operations for multiple tasks
- Monitor rate limits
- Handle errors gracefully
- Clean up completed tasks
- Optimize task retrieval
- Maintain data integrity

## Development

\`\`\`bash
npm run build    # Build project
npm run watch    # Watch for changes
npm run inspector # Run MCP inspector
\`\`\`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

For bugs and feature requests, please [create an issue](https://github.com/cyanheads/atlas-mcp-server/issues).

## License

Apache License 2.0

---

<div align="center">
Built with the Model Context Protocol
</div>
