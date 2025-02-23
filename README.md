# ATLAS MCP Server 2.0

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.5-green.svg)](https://modelcontextprotocol.io/)
[![Version](https://img.shields.io/badge/Version-2.0.1-blue.svg)]()
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-blue.svg)]()
[![GitHub](https://img.shields.io/github/stars/cyanheads/atlas-mcp-server?style=social)](https://github.com/cyanheads/atlas-mcp-server)

ATLAS (Adaptive Task & Logic Automation System) is a Model Context Protocol server designed for LLMs to manage complex projects. Built with TypeScript and featuring
Neo4j graph database integration, efficient project management, and collaborative features, ATLAS provides LLM Agents project management capabilities through a clean, flexible tool interface.

> **Important Version Note**: [Version 1.5.4](https://github.com/cyanheads/atlas-mcp-server/releases/tag/v1.5.4) is the last version that uses SQLite as the database. Version 2.0 and onwards has been completely rewritten to use Neo4j, which requires either:
> - Self-hosting using Docker (docker-compose included in repository)
> - Using Neo4j AuraDB cloud service: https://neo4j.com/product/auradb/

## Table of Contents

- [Overview](#overview)
  - [Architecture & Components](#architecture--components)
- [Features](#features)
  - [Project Management](#project-management)
  - [Collaboration Features](#collaboration-features)
  - [Whiteboard System](#whiteboard-system)
  - [Graph Database Integration](#graph-database-integration)
- [Installation](#installation)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Tools](#tools)
  - [Project Operations](#project-operations)
  - [Member Management](#member-management)
  - [Dependency Management](#dependency-management)
  - [Whiteboard Operations](#whiteboard-operations)
  - [Database Operations](#database-operations)
- [Resources](#resources)
  - [Project Resources](#project-resources)
- [Best Practices](#best-practices)
  - [Project Organization](#project-organization)
  - [Performance Optimization](#performance-optimization)
  - [Error Prevention](#error-prevention)
- [Contributing](#contributing)
- [License](#license)

## Overview

ATLAS implements the Model Context Protocol (MCP), enabling standardized communication between LLMs and external systems through:

- **Clients**: Claude Desktop, IDEs, and other MCP-compatible clients
- **Servers**: Tools and resources for project management and collaboration
- **LLM Agents**: AI models that leverage the server's project management capabilities

Key capabilities:

- **Project Management**: Comprehensive project lifecycle management with metadata and status tracking
- **Collaboration Tools**: Member management, dependencies, and resource linking
- **Whiteboard System**: Real-time collaborative whiteboards with version history
- **Graph Database**: Neo4j-powered relationship management and querying
- **Performance Focus**: Optimized caching, batch operations, and health monitoring
- **Graceful Shutdown**: Robust error handling and graceful shutdown mechanisms

### Architecture & Components

Core system architecture:

```mermaid
flowchart TB
    subgraph API["API Layer"]
        direction LR
        MCP["MCP Protocol"]
        Val["Validation"]
        Rate["Rate Limiting"]

        MCP --> Val --> Rate
    end

    subgraph Core["Core Services"]
        direction LR
        Project["Project Store"]
        Whiteboard["Whiteboard System"]
        Member["Member Management"]

        Project <--> Member
        Member <--> Whiteboard
        Project <-.-> Whiteboard
    end

    subgraph Storage["Storage Layer"]
        direction LR
        Neo4j["Neo4j Graph DB"]
        Cache["Cache Layer"]

        Neo4j <--> Cache
    end

    Rate --> Project
    Rate --> Whiteboard
    Project --> Neo4j
    Whiteboard --> Neo4j

    classDef layer fill:#2d3748,stroke:#4299e1,stroke-width:3px,rx:5,color:#fff
    classDef component fill:#1a202c,stroke:#a0aec0,stroke-width:2px,rx:3,color:#fff
    classDef api fill:#3182ce,stroke:#90cdf4,stroke-width:2px,rx:3,color:#fff
    classDef core fill:#319795,stroke:#81e6d9,stroke-width:2px,rx:3,color:#fff
    classDef storage fill:#2f855a,stroke:#9ae6b4,stroke-width:2px,rx:3,color:#fff

    class API,Core,Storage layer
    class MCP,Val,Rate api
    class Project,Whiteboard,Member core
    class Neo4j,Cache storage
```

Core Components:

- **Storage Layer**: Neo4j graph database with caching layer
- **Project Layer**: Project management, relationships, and dependency tracking
- **Member System**: Role-based access control and collaboration
- **Whiteboard Engine**: Real-time collaboration and version control
- **Error Handling**: Comprehensive error handling and logging system

## Features

### Project Management

- **Project Organization**: Comprehensive project metadata and status tracking
- **Rich Content**: Notes, links, and documentation management
- **Status Tracking**: Project lifecycle state management
- **Dependency Management**: Project relationship tracking and validation
- **Bulk Operations**: Efficient batch processing for project operations
- **Search Capabilities**: Advanced Neo4j-powered search functionality

### Collaboration Features

- **Member Management**: Role-based access control (owner, admin, member, viewer)
- **Team Coordination**: Project-level collaboration tools
- **Resource Sharing**: Link management and organization
- **Activity Tracking**: Project updates and member contributions

### Whiteboard System

- **Real-time Collaboration**: Shared whiteboard spaces
- **Version Control**: History tracking and rollback capabilities
- **Schema Validation**: Structured content validation
- **Project Integration**: Whiteboard-project relationships

### Graph Database Integration

- **Relationship Management**: Native graph database capabilities
- **Efficient Queries**: Optimized graph traversal and search
- **Data Integrity**: ACID-compliant transactions
- **Scalability**: High-performance graph operations
- **Advanced Search**: Property-based search with fuzzy matching and wildcards

## Installation

### Option 1: Install via npm

```bash
npm install atlas-mcp-server
```

### Option 2: Install from source

1. Clone the repository:
```bash
git clone https://github.com/cyanheads/atlas-mcp-server.git
cd atlas-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Configure Neo4j:
```bash
# Start Neo4j using Docker
docker-compose up -d
```

4. Build the project:
```bash
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password2

# Application Configuration
LOG_LEVEL=info # debug, info, warn, error
NODE_ENV=development # development, production
```

### MCP Client Settings

Add to your MCP client settings:

```json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["/path/to/atlas-mcp-server/dist/index.js"],
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "password2",
        "LOG_LEVEL": "info",
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Project Structure

The codebase follows a modular structure:

```
src/
├── config/          # Configuration management
├── mcp/            # MCP server implementation
│   ├── resources/  # MCP resources
│   └── tools/      # MCP tools
├── scripts/        # Build and maintenance scripts
├── logs/           # Application logs
├── output/         # Generated output files
├── neo4j/         # Neo4j database services
│   └── projectService/ # Project-related operations
├── types/         # TypeScript type definitions
└── utils/         # Utility functions
```

## Tools

ATLAS 2.0 provides comprehensive tools for project management:

### Project Operations

```typescript
// Project Management
project.create    // Create new projects
project.update    // Update existing projects
project.delete    // Remove projects
project.note.add  // Add project notes
project.link.add  // Add project links

// Bulk Operations
project.create (bulk mode)  // Create multiple projects
project.update (bulk mode)  // Update multiple projects
```

### Member Management

```typescript
// Member Operations
project.member.add     // Add project members
project.member.remove  // Remove project members
project.member.list    // List project members
```

### Dependency Management

```typescript
// Dependency Operations
project.dependency.add     // Add project dependencies
project.dependency.remove  // Remove project dependencies
project.dependency.list    // List project dependencies
```

### Whiteboard Operations

```typescript
// Whiteboard Management
whiteboard.create   // Create new whiteboards
whiteboard.update   // Update whiteboard content
whiteboard.get      // Retrieve whiteboard data
whiteboard.delete   // Remove whiteboards
```

### Database Operations

```typescript
// Neo4j Search
neo4j.search       // Search nodes with property filters
database.clean     // Clean and reinitialize database
```

## Resources

ATLAS 2.0 exposes system resources through standard MCP endpoints:

### Project Resources

```typescript
// Project List
project-list://all          // Lists all projects with pagination

// Project Details
project://{projectId}       // Fetches project details with related data

// Project Notes
project://{projectId}/notes // Fetches project notes with tags and metadata

// Project Links
project://{projectId}/links // Fetches project links with categories

// Project Dependencies
project://{projectId}/dependencies // Lists dependencies and dependents

// Project Members
project://{projectId}/members     // Lists members with roles and activity
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