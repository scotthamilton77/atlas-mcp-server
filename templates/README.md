# Atlas Task Templates Guide

This guide explains how to create effective task templates for the Atlas task management system.

## Table of Contents

- [Overview](#overview)
- [Template Structure](#template-structure)
- [Variables](#variables)
- [Tasks](#tasks)
- [Metadata](#metadata)
- [Best Practices](#best-practices)
- [Examples](#examples)
- [Schema Reference](#schema-reference)

## Overview

Atlas templates allow you to define reusable task structures that can be instantiated with different
variables. Templates are particularly useful for:

- Standardizing project setups
- Ensuring consistent task organization
- Automating repetitive task creation
- Maintaining best practices across projects

## Template Structure

A template is defined in a JSON file with the following top-level structure:

```json
{
  "id": "template-id",
  "name": "Template Name",
  "description": "Template description",
  "version": "1.0.0",
  "author": "Author Name",
  "tags": ["tag1", "tag2"],
  "variables": [],
  "tasks": []
}
```

### Required Fields

- `id`: Unique identifier for the template
- `name`: Human-readable name
- `description`: Detailed description of the template's purpose
- `version`: Semantic version number
- `tasks`: Array of task definitions

### Optional Fields

- `author`: Template creator
- `tags`: Categorization tags
- `variables`: Input variables for customization

## Variables

Variables allow templates to be customized when instantiated. They support the following types:

- `string`: Text values
- `boolean`: True/false flags
- `number`: Numeric values

Example variable definition:

```json
{
  "variables": [
    {
      "name": "projectName",
      "description": "Name of the project",
      "type": "string",
      "required": true
    },
    {
      "name": "useTypeScript",
      "description": "Whether to use TypeScript",
      "type": "boolean",
      "required": false,
      "default": false
    }
  ]
}
```

### Variable Usage

- Use `${variableName}` syntax in task paths and content
- Variables can be used in:
  - Task paths
  - Task titles
  - Task descriptions
  - Dependency paths
  - Metadata values

## Tasks

Tasks define the work items that will be created. Each task must include:

```json
{
  "path": "${projectName}/path/to/task",
  "title": "Task Title",
  "description": "Task description",
  "type": "TASK",
  "dependencies": ["${projectName}/path/to/dependency"],
  "metadata": {}
}
```

### Task Types

- `TASK`: Concrete work item
- `MILESTONE`: Group of related tasks

### Dependencies

- Use full paths including variable substitutions
- Dependencies must exist within the template
- Avoid circular dependencies

## Metadata

Metadata provides additional context and requirements for tasks. The metadata structure is flexible
and can include any fields needed, with only a size limit constraint. Common patterns include:

```json
{
  "metadata": {
    // Core fields (optional)
    "priority": "high|medium|low",
    "tags": ["tag1", "tag2"],
    "reasoning": "Explanation of decisions",

    // Technical details (flexible structure)
    "technicalRequirements": {
      "language": "programming language",
      "framework": "framework name",
      "dependencies": ["dep1", "dep2"],
      "environment": "runtime environment",
      // Additional technical fields as needed
      "performance": {
        "memory": "512MB",
        "cpu": "2 cores"
      }
    },

    // Validation & progress (flexible structure)
    "acceptanceCriteria": {
      "criteria": ["criterion1", "criterion2"],
      "testCases": ["test1", "test2"]
    },
    "progress": {
      "percentage": 0,
      "milestones": ["milestone1", "milestone2"],
      "lastUpdated": "timestamp"
    },

    // Resource tracking (flexible structure)
    "resources": {
      "toolsUsed": ["tool1", "tool2"],
      "contextUsed": ["context1", "context2"]
    },

    // Custom fields (any additional metadata)
    "customFields": {
      "field1": "value1",
      "field2": {
        "nestedField": "value"
      }
    }
  }
}
```

The only constraint on metadata is a total size limit to prevent performance issues. Within this
limit, you can structure the metadata as needed for your use case.

## Best Practices

1. **Template Organization**

   - Use clear, descriptive template IDs
   - Group related tasks under milestones
   - Keep dependency chains manageable
   - Include comprehensive descriptions

2. **Variables**

   - Provide clear descriptions and defaults
   - Use required flag sparingly
   - Consider validation needs
   - Use consistent naming conventions

3. **Tasks**

   - Use consistent path structures
   - Keep tasks focused and atomic
   - Include clear acceptance criteria
   - Document technical requirements

4. **Dependencies**

   - Create logical task sequences
   - Avoid unnecessary dependencies
   - Consider parallel execution
   - Document dependency reasoning

5. **Metadata**
   - Use consistent tagging schemes
   - Include relevant technical details
   - Document environment requirements
   - Specify clear acceptance criteria

## Examples

### Software Engineering Team Template

The software engineering team templates provide a comprehensive structure for managing software
development teams with specialized roles:

```json
{
  "id": "llm-software-team",
  "name": "LLM Software Engineering Team",
  "variables": [
    {
      "name": "projectName",
      "type": "string",
      "required": true
    },
    {
      "name": "teamScale",
      "type": "string",
      "required": true,
      "default": "growth"
    },
    {
      "name": "securityLevel",
      "type": "string",
      "default": "standard"
    }
  ],
  "tasks": [
    {
      "path": "${projectName}/team-setup",
      "title": "Team Setup & Coordination",
      "type": "MILESTONE",
      "metadata": {
        "priority": "high",
        "customFields": {
          "roleTemplate": "llm-team-coordinator"
        }
      }
    },
    {
      "path": "${projectName}/product-design",
      "title": "Product Design Phase",
      "type": "MILESTONE",
      "dependencies": ["${projectName}/team-setup"],
      "metadata": {
        "customFields": {
          "roleTemplate": "llm-product-designer"
        }
      }
    }
  ]
}
```

Available role templates:

- `llm-product-designer`: Product design and research
- `llm-system-architect`: System architecture and design
- `llm-security-engineer`: Security implementation
- `llm-devops-engineer`: Infrastructure automation
- `llm-tech-lead`: Development standards and quality

### Web Project Template

See [web-project.json](examples/templates/web-project.json) for a complete example of a web project
template with TypeScript and testing options.

## Schema Reference

### Template Schema

```typescript
interface Template {
  id: string; // Unique identifier
  name: string; // Display name
  description: string; // Detailed description
  version: string; // Semantic version
  author?: string; // Template creator
  tags?: string[]; // Categorization tags
  variables?: Variable[]; // Input variables
  tasks: Task[]; // Task definitions
}

interface Variable {
  name: string; // Variable name
  description: string; // Variable description
  type: 'string' | 'boolean' | 'number';
  required?: boolean; // Is input required?
  default?: any; // Default value
}

interface Task {
  path: string; // Task path with variables
  title: string; // Task title
  description: string; // Task description
  type: 'TASK' | 'MILESTONE';
  dependencies?: string[]; // Task dependencies
  metadata?: Record<string, unknown>; // Flexible metadata structure
}
```

### Validation Rules

1. **Template Structure**

   - Template IDs must be 1-100 characters
   - Template names must be 1-200 characters
   - Descriptions must be under 2000 characters
   - Version strings must be 1-50 characters
   - Author name must be under 100 characters

2. **Variables**

   - Variable names must be 1-100 characters
   - Variable descriptions must be under 500 characters
   - Type must be one of: string, number, boolean, array
   - Required variables must not have defaults
   - Default values must match declared type
   - Variable names must be unique within template

3. **Tasks**

   - Task paths must be unique within template
   - Paths must be under 1000 characters
   - Titles must be 1-200 characters
   - Descriptions must be under 2000 characters
   - Type must be either TASK or MILESTONE
   - Dependencies must reference existing task paths
   - No circular dependencies allowed

4. **Variable References**

   - ${variable} syntax must reference defined variables
   - Variables can be used in:
     - Task paths
     - Task titles
     - Task descriptions
     - Dependencies
     - Metadata string values

5. **Metadata**
   - Total metadata size must be under 100KB
   - All string values support variable interpolation
   - Structure is flexible within size constraint
