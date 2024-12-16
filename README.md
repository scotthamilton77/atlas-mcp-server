# ATLAS MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.0.3-green.svg)](https://modelcontextprotocol.ai)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Beta-orange.svg)]()
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

### Model Context Protocol Integration

ATLAS implements the Model Context Protocol (MCP), a standardized communication protocol between LLMs and external systems. The architecture consists of:

- **Clients** (Claude Desktop, IDEs) that maintain server connections
- **Servers** that provide tools and resources to clients
- **LLMs** that interact with servers through client applications

This separation enables LLMs to safely access external functionality while maintaining security boundaries.

### Current Status

- ✓ Hierarchical task management
- ✓ Rich content support (markdown, code, JSON)
- ✓ Dependency tracking and validation
- ✓ Status propagation
- ✓ Session persistence

## Features

### Task Organization
- Hierarchical task structures
- Parent-child relationships
- Dependency management
- Status tracking and propagation

### Content Support
- Markdown documentation
- Code snippets with syntax highlighting
- JSON data structures
- Rich metadata

### Session Management
- Persistent storage
- Session isolation
- Backup support
- State recovery

## Installation

```bash
npm install atlas-mcp-server
```

## Configuration

ATLAS requires configuration in your MCP client settings:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["/path/to/atlas-mcp-server/build/index.js"],
      "env": {
        "TASK_STORAGE_DIR": "/path/to/storage/directory"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| TASK_STORAGE_DIR | Directory for task data storage | Yes |

## Task Structure

Tasks support rich content and metadata:

```typescript
{
  "name": "Implementation Task",
  "description": "Implement core functionality",
  "type": "task",
  "notes": [
    {
      "type": "markdown",
      "content": "# Requirements\n- Feature A\n- Feature B"
    },
    {
      "type": "code",
      "language": "typescript",
      "content": "interface Feature {\n  name: string;\n  enabled: boolean;\n}"
    }
  ],
  "metadata": {
    "context": "Core implementation phase",
    "tags": ["core", "implementation"]
  }
}
```

## Tools

### Task Management

#### create_task
Creates a new task with optional subtasks.

<details>
<summary><b>Parameters</b></summary>

```typescript
{
  "parentId": string | null,  // Parent task ID or null for root tasks
  "name": string,            // Task name (required)
  "description": string,     // Task description
  "notes": Note[],          // Rich content notes
  "type": "task" | "milestone" | "group",
  "dependencies": string[], // Task IDs this task depends on
  "metadata": {             // Additional task metadata
    "context": string,
    "tags": string[]
  }
}
```
</details>

#### create_tasks
Batch creates multiple tasks under the same parent.

#### update_task
Updates task attributes and status.

#### delete_task
Removes a task and its subtasks.

### Task Retrieval

#### get_task
Gets task by ID.

#### get_subtasks
Lists subtasks of a task.

#### get_task_tree
Gets full task hierarchy.

#### get_tasks_by_status
Filters tasks by status.

## Best Practices

### Task Creation
- Create parent tasks before subtasks
- Use task IDs for dependencies
- Provide clear context in metadata
- Use appropriate task types

### Status Management
- Update status appropriately
- Consider impact on dependent tasks
- Monitor parent task status

### Content Organization
- Use appropriate note types
- Include relevant code samples
- Maintain clear documentation

## Development

```bash
# Build the project
npm run build

# Watch for changes
npm run watch

# Run MCP inspector
npm run inspector
```

### Error Handling

ATLAS provides detailed error information:
- Validation errors
- Dependency conflicts
- Task not found
- Internal errors

## Contributing

I welcome contributions! Please follow these steps:

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
