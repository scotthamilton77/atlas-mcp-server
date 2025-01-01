# Tools System

The tools system implements the Model Context Protocol (MCP) tools that enable AI assistants to
manage tasks, templates, and visualizations through the Atlas Task Manager.

## Overview

The tools system provides:

- MCP tool implementations
- Tool request handling
- Schema validation
- Error handling
- Tool definitions

## Architecture

### Core Components

#### ToolHandler

- Tool request processing
- Tool registration
- Error handling
- Response formatting

#### Core Subsystems

##### Tool Definitions

- Tool specifications
- Input schemas
- Response formats
- Documentation

##### Schema Validation

- Input validation
- Type checking
- Constraint enforcement
- Error reporting

##### Error Handler

- Error classification
- Context preservation
- Response formatting
- Recovery handling

## Available Tools

```typescript
// Task Management Tools
interface TaskTools {
  // Create new tasks
  create_task: {
    path: string;
    name: string;
    type?: 'TASK' | 'MILESTONE';
    description?: string;
    metadata?: Record<string, unknown>;
  };

  // Update existing tasks
  update_task: {
    path: string;
    updates: {
      status?: TaskStatus;
      metadata?: Record<string, unknown>;
      notes?: Record<string, string[]>;
    };
  };

  // Query tasks
  get_tasks_by_status: {
    status: TaskStatus;
    pathPattern?: string;
  };

  // Bulk operations
  bulk_task_operations: {
    operations: {
      type: 'create' | 'update' | 'delete';
      path: string;
      data?: Record<string, unknown>;
    }[];
  };
}

// Template Tools
interface TemplateTools {
  // List templates
  list_templates: {
    tag?: string;
  };

  // Use template
  use_template: {
    templateId: string;
    variables: Record<string, unknown>;
    parentPath?: string;
  };
}
```

## Usage Examples

```typescript
// Tool handler setup
const toolHandler = new ToolHandler(taskManager, templateManager);

// List available tools
const tools = await toolHandler.listTools();

// Handle tool call
const result = await toolHandler.handleToolCall({
  params: {
    name: 'create_task',
    arguments: {
      path: 'project/backend/auth',
      name: 'Implement Authentication',
      type: 'TASK',
    },
  },
});

// Error handling
try {
  await toolHandler.handleToolCall(request);
} catch (error) {
  if (error instanceof ToolError) {
    // Handle tool-specific error
  }
}
```

## Best Practices

1. **Tool Design**

   - Clear tool names
   - Comprehensive schemas
   - Detailed documentation
   - Consistent patterns

2. **Input Validation**

   - Validate all inputs
   - Check constraints
   - Handle edge cases
   - Provide clear errors

3. **Error Handling**

   - Use specific errors
   - Include context
   - Guide resolution
   - Log issues

4. **Performance**

   - Optimize operations
   - Handle timeouts
   - Manage resources
   - Monitor usage

5. **Documentation**
   - Document parameters
   - Provide examples
   - Explain errors
   - Update changes
