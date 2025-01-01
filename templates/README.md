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

Metadata provides additional context and requirements for tasks. Supported fields:

```json
{
  "metadata": {
    "priority": "high|medium|low",
    "tags": ["tag1", "tag2"],
    "technicalRequirements": {
      "language": "programming language",
      "framework": "framework name",
      "dependencies": ["dep1", "dep2"],
      "environment": "runtime environment"
    },
    "acceptanceCriteria": {
      "criteria": ["criterion1", "criterion2"],
      "testCases": ["test1", "test2"]
    }
  }
}
```

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

### Basic Project Template

```json
{
  "id": "basic-project",
  "name": "Basic Project Setup",
  "description": "Simple project structure with core tasks",
  "version": "1.0.0",
  "variables": [
    {
      "name": "projectName",
      "description": "Project name",
      "type": "string",
      "required": true
    }
  ],
  "tasks": [
    {
      "path": "${projectName}/setup",
      "title": "Project Setup",
      "description": "Initialize project structure",
      "type": "MILESTONE"
    },
    {
      "path": "${projectName}/setup/structure",
      "title": "Create Structure",
      "description": "Set up directories",
      "type": "TASK",
      "dependencies": ["${projectName}/setup"],
      "metadata": {
        "priority": "high",
        "tags": ["setup", "infrastructure"]
      }
    }
  ]
}
```

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
  metadata?: {
    priority?: 'high' | 'medium' | 'low';
    tags?: string[];
    technicalRequirements?: {
      language?: string;
      framework?: string;
      dependencies?: string[];
      environment?: string;
    };
    acceptanceCriteria?: {
      criteria?: string[];
      testCases?: string[];
    };
  };
}
```

### Validation Rules

- Template IDs must be unique and alphanumeric with dashes
- Versions must follow semantic versioning
- Task paths must be unique within a template
- Dependencies must reference existing task paths
- Variables must have unique names
- Required variables must not have defaults
- Task titles must be under 200 characters
- Descriptions must be under 2000 characters
- Tags must be under 100 characters each
- Maximum 100 tags per task/template
- Maximum 50 dependencies per task
- Maximum 20 acceptance criteria per task
