# ATLAS MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.0.4-green.svg)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-blue.svg)]()
[![GitHub](https://img.shields.io/github/stars/cyanheads/atlas-mcp-server?style=social)](https://github.com/cyanheads/atlas-mcp-server)

ATLAS (Adaptive Task & Logic Automation System) is a Model Context Protocol server that provides
hierarchical task management capabilities to Large Language Models. This tool enables LLMs to manage
complex tasks and dependencies through a robust and flexible API.

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

ATLAS implements the Model Context Protocol (MCP), enabling standardized communication between LLMs
and external systems through:

- **Clients** (Claude Desktop, IDEs) that maintain server connections
- **Servers** that provide tools and resources
- **LLMs** that interact with servers through client applications

### Core Components

- **TaskStore**: Central task storage and retrieval with ACID compliance
- **TaskValidator**: Comprehensive validation with dependency cycle detection
- **SqliteStorage**: Robust SQLite-based persistence with WAL and transaction support
- **BatchProcessor**: Optimized bulk operations with dependency awareness
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

### Storage & Performance

- SQLite backend with Write-Ahead Logging (WAL)
- ACID-compliant transactions
- Batch processing optimization
- Connection pooling
- Automatic checkpointing
- Database maintenance tools

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

1. Clone the repository: \`\`\`bash git clone https://github.com/cyanheads/atlas-mcp-server.git cd
   atlas-mcp-server \`\`\`

2. Install dependencies: \`\`\`bash npm install \`\`\`

3. Build the project: \`\`\`bash npm run build \`\`\`

## Configuration

Add to your MCP client settings:

\`\`\`json { "mcpServers": { "atlas": { "command": "node", "args":
["/path/to/atlas-mcp-server/build/index.js"], "env": { "ATLAS_STORAGE_DIR":
"/path/to/storage/directory", "ATLAS_LOG_LEVEL": "info", "ATLAS_DB_MAX_RETRIES": "3",
"ATLAS_DB_RETRY_DELAY": "500", "ATLAS_DB_BUSY_TIMEOUT": "2000" } } } } \`\`\`

## Task Structure

Tasks follow a structured format:

\`\`\`typescript { "path": "project/feature/task", "name": "Implementation Task", "description":
"Implement core functionality", "type": "TASK", // TASK or MILESTONE "status": "PENDING",
"dependencies": ["project/feature/design"], "metadata": { "priority": "high", "tags": ["core",
"implementation"] } } \`\`\`

## Tools

### create_task

Create a new task in the system:

\`\`\`typescript { "path": "project/backend/auth", "title": "Implement JWT Authentication", "type":
"TASK", "description": "Add JWT-based authentication system", "dependencies":
["project/backend/database"], "metadata": { "priority": "high", "tags": ["security", "api"] } }
\`\`\`

### delete_task

Remove a task and its children:

\`\`\`typescript { "path": "project/backend/deprecated-auth", "reasoning": "Removing deprecated
authentication implementation" } \`\`\`

### bulk_task_operations

Execute multiple task operations atomically:

\`\`\`typescript { "operations": [ { "type": "create", "path": "project/backend/oauth2", "data": {
"title": "Implement OAuth2", "type": "MILESTONE", "description": "OAuth2 implementation" } }, {
"type": "create", "path": "project/backend/oauth2/setup", "data": { "title": "Provider Setup",
"dependencies": ["project/backend/oauth2"] } } ], "reasoning": "Implementing OAuth2 authentication"
} \`\`\`

### clear_all_tasks

Reset the task database:

\`\`\`typescript { "confirm": true, "reasoning": "Resetting task structure for Q2 planning" } \`\`\`

### vacuum_database

Optimize database storage:

\`\`\`typescript { "analyze": true, "reasoning": "Running optimization after bulk deletions" }
\`\`\`

### repair_relationships

Fix task hierarchy issues:

\`\`\`typescript { "dryRun": true, "reasoning": "Checking for relationship issues" } \`\`\`

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
- Monitor memory usage
- Use appropriate batch sizes

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
