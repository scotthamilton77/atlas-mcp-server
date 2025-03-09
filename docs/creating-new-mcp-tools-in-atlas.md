# Creating New MCP Tools in Atlas

This developer guide explains how to create new Model Context Protocol (MCP) tools for the Atlas MCP Server. It covers the entire process from designing your tool's interface to implementing its functionality and registering it with the server.

## Table of Contents

1. [Introduction](#introduction)
2. [Directory Structure](#directory-structure)
3. [Step 1: Define Your Tool's Types](#step-1-define-your-tools-types)
4. [Step 2: Implement the Tool Handler](#step-2-implement-the-tool-handler)
5. [Step 3: Create the Registration File](#step-3-create-the-registration-file)
6. [Step 4: Register with the MCP Server](#step-4-register-with-the-mcp-server)
7. [Error Handling Best Practices](#error-handling-best-practices)
8. [Logging Guidelines](#logging-guidelines)
9. [Testing Your Tool](#testing-your-tool)
10. [Advanced Patterns](#advanced-patterns)
11. [Complete Example](#complete-example)

## Introduction

Atlas MCP Server provides a framework for implementing tools that follow the Model Context Protocol. Tools are executable functions that perform operations with side effects, unlike resources which are read-only. Each tool:

- Has a unique name (e.g., `project_create`)
- Accepts structured input parameters
- Performs operations (database queries, calculations, etc.)
- Returns formatted responses
- Handles errors in a standardized way

This guide will walk you through creating a new tool from scratch.

## Directory Structure

All MCP tools live in the `src/mcp/tools/` directory. Each tool should have its own subdirectory following this structure:

```
src/mcp/tools/
  └── yourToolName/
      ├── types.ts         # Type definitions and schemas
      ├── yourToolName.ts  # Implementation of the tool
      └── index.ts         # Tool registration
```

## Step 1: Define Your Tool's Types

Start by creating the `types.ts` file to define your tool's input and output types using Zod for validation.

```typescript
// src/mcp/tools/yourToolName/types.ts
import { z } from "zod";

// Define validation schema for your tool's inputs
export const YourToolInputSchema = z.object({
  // Required fields
  requiredParam: z.string().min(1).describe(
    "A required parameter with a description"
  ),
  
  // Optional fields
  optionalParam: z.number().optional().describe(
    "An optional numeric parameter"
  ),
  
  // Enum fields
  mode: z.enum(["mode1", "mode2"]).describe(
    "Operation mode selection"
  )
});

// Type definition generated from the schema
export type YourToolInput = z.infer<typeof YourToolInputSchema>;

// For public export (used in registration)
export const YourToolSchema = {
  requiredParam: YourToolInputSchema.shape.requiredParam,
  optionalParam: YourToolInputSchema.shape.optionalParam,
  mode: YourToolInputSchema.shape.mode
};
```

**Key Points:**
- Always use Zod for schema validation
- Provide clear descriptions for each parameter
- Generate TypeScript types from Zod schemas with `z.infer`
- Export a const object with the schema shapes for registration

## Step 2: Implement the Tool Handler

Create the main implementation file (e.g., `yourToolName.ts`) with the tool handler function:

```typescript
// src/mcp/tools/yourToolName/yourToolName.ts
import { logger } from "../../../utils/logger.js";
import { createToolResponse } from "../../../types/mcp.js";
import { McpError, BaseErrorCode } from "../../../types/errors.js";
import { ToolContext } from "../../../utils/security.js";
import { YourToolInput, YourToolInputSchema } from "./types.js";

/**
 * MCP tool that performs a specific function
 * Provide a clear description of what your tool does
 */
export const yourToolHandler = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Step 1: Validate input
    const validatedInput = YourToolInputSchema.parse(input);
    
    // Step 2: Log the operation
    logger.info("Your tool called", { 
      param: validatedInput.requiredParam,
      mode: validatedInput.mode,
      requestId: context.requestContext?.requestId 
    });
    
    // Step 3: Perform the main operation
    const result = await processYourToolOperation(validatedInput, context);
    
    // Step 4: Log successful completion
    logger.info("Your tool completed successfully", {
      resultSummary: "summary of result",
      requestId: context.requestContext?.requestId
    });
    
    // Step 5: Return formatted response
    return createToolResponse(JSON.stringify(result, null, 2));
  } catch (error) {
    // Handle specific error types
    if (error instanceof McpError) {
      throw error;
    }
    
    // Log errors
    logger.error("Error in your tool", { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      requestId: context.requestContext?.requestId
    });
    
    // Convert to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error in your tool: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Helper function to process the main operation
 * Separating business logic makes the code more testable
 */
const processYourToolOperation = async (
  input: YourToolInput,
  context: ToolContext
) => {
  // Implement your tool's core functionality here
  // This might include database operations, calculations, etc.
  
  // Return a result that will be formatted as JSON
  return {
    success: true,
    message: `Operation completed for ${input.requiredParam}`,
    data: {
      // Operation output data
    }
  };
};
```

**Key Points:**
- Follow the standard try/catch pattern for error handling
- Use structured logging with the logger utility
- Separate core functionality into helper functions
- Always validate input using the Zod schema
- Return responses using `createToolResponse`
- Use consistent error handling patterns

## Step 3: Create the Registration File

Create an `index.ts` file to handle tool registration:

```typescript
// src/mcp/tools/yourToolName/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { YourToolSchema } from './types.js';
import { yourToolHandler } from './yourToolName.js';
import { registerTool, createToolExample, createToolMetadata } from '../../../types/tool.js';
import { z } from 'zod';

export const registerYourTool = (server: McpServer) => {
  registerTool(
    server,
    "your_tool_name",
    "Clear and concise description of what your tool does.",
    {
      // Input schema
      ...YourToolSchema
    },
    yourToolHandler,
    createToolMetadata({
      examples: [
        // Example 1
        createToolExample(
          {
            requiredParam: "example-value",
            mode: "mode1"
          },
          `{
  "success": true,
  "message": "Operation completed for example-value",
  "data": {
    "exampleOutput": "value"
  }
}`,
          "Example description"
        ),
        // Example 2
        createToolExample(
          {
            requiredParam: "another-example",
            optionalParam: 42,
            mode: "mode2"
          },
          `{
  "success": true,
  "message": "Another example output"
}`,
          "Another example description"
        )
      ],
      requiredPermission: "your:permission",
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30      // 30 requests per minute
      }
    })
  );
};
```

**Key Points:**
- Use snake_case for tool names (e.g., `your_tool_name`)
- Provide a clear, concise description
- Include practical examples showing input and output
- Set appropriate rate limiting
- Specify required permissions if applicable

## Step 4: Register with the MCP Server

Add your tool registration to the MCP server in `src/mcp/server.ts`:

```typescript
// src/mcp/server.ts
// Add import at the top with other tool imports
import { registerYourTool } from "./tools/yourToolName/index.js";

// ...

// Inside createMcpServer function, add your registration
// Keep the registrations in alphabetical order by tool name
registerYourTool(server); // your_tool_name
```

## Error Handling Best Practices

Atlas uses a standardized error system with error codes:

```typescript
// Error handling patterns
try {
  // Operation that might fail
} catch (error) {
  // 1. Handle specific application errors
  if (error instanceof McpError) {
    throw error; // Pass through existing McpErrors
  }
  
  // 2. Handle specific domain errors
  if (error instanceof Error && error.message.includes('duplicate')) {
    throw new McpError(
      YourDomainErrorCode.DUPLICATE_ITEM,
      "A more helpful error message",
      { details: "Additional context" }
    );
  }
  
  // 3. Log and convert unknown errors
  logger.error("Error during operation", { error });
  throw new McpError(
    BaseErrorCode.INTERNAL_ERROR,
    `Error during operation: ${error instanceof Error ? error.message : 'Unknown error'}`
  );
}
```

Common error codes:
- `BaseErrorCode.VALIDATION_ERROR`: For invalid input
- `BaseErrorCode.NOT_FOUND`: For resources that don't exist
- `BaseErrorCode.UNAUTHORIZED`: For permission issues
- `BaseErrorCode.INTERNAL_ERROR`: For unexpected errors

Define domain-specific error codes as needed in `src/types/errors.ts`.

## Logging Guidelines

Consistent logging is crucial for monitoring and debugging:

```typescript
// 1. Log operation start
logger.info("Operation starting", { 
  param: input.param,
  requestId: context.requestContext?.requestId 
});

// 2. Log important steps
logger.debug("Processing step", { 
  step: "step name",
  details: { /* relevant details */ } 
});

// 3. Log successful completion
logger.info("Operation completed", { 
  result: "summary",
  duration: endTime - startTime,
  requestId: context.requestContext?.requestId 
});

// 4. Log errors
logger.error("Operation failed", { 
  error: error instanceof Error ? error.message : 'Unknown error',
  stack: error instanceof Error ? error.stack : undefined,
  context: { /* operation context */ },
  requestId: context.requestContext?.requestId
});
```

Key logging guidelines:
- Always include the `requestId` from context for traceability
- Use appropriate log levels (info, debug, warn, error)
- Structure log messages as objects for better searchability
- Don't log sensitive data
- Include enough context to understand what happened

## Testing Your Tool

Test your tool with the MCP client:

```typescript
// Using the MCP tool:
const result = await client.use_mcp_tool({
  server_name: "atlas-mcp-server",
  tool_name: "your_tool_name",
  arguments: {
    requiredParam: "test-value",
    mode: "mode1"
  }
});
```

## Advanced Patterns

### Bulk Operations

For tools that need to handle bulk operations:

```typescript
// Example bulk operation in types.ts
export const YourToolInputSchema = z.object({
  mode: z.enum(["single", "bulk"]).describe(
    "'single' for one item, 'bulk' for multiple items."
  ),
  // Single mode parameters
  name: z.string().min(1).optional().describe(
    "Required for single mode: Item name."
  ),
  // Bulk mode parameters
  items: z.array(ItemSchema).min(1).max(100).optional().describe(
    "Required for bulk mode: Array of 1-100 items."
  )
});

// Example implementation
if (validatedInput.mode === 'bulk') {
  // Handle bulk operation
  const result = await processBulkOperation(validatedInput.items);
  return createToolResponse(JSON.stringify(result, null, 2));
} else {
  // Handle single operation
  const result = await processSingleOperation(validatedInput);
  return createToolResponse(JSON.stringify(result, null, 2));
}
```

### Including Related Data

For tools that need to include related data:

```typescript
// Example implementation
const result: Record<string, any> = { ...baseData };

// Add optional related data
if (input.includeRelatedData) {
  const relatedData = await fetchRelatedData(input.id);
  result.relatedData = relatedData;
}
```

## Complete Example

Below is a complete example demonstrating how to implement a simple `greeting` tool that creates a customized greeting message.

### types.ts
```typescript
import { z } from "zod";

export const GREETING_LANGUAGES = ["english", "spanish", "french"] as const;

export const GreetingInputSchema = z.object({
  name: z.string().min(1).describe(
    "The name of the person to greet"
  ),
  language: z.enum(GREETING_LANGUAGES).default("english").describe(
    "The language to use for the greeting"
  ),
  formal: z.boolean().default(false).describe(
    "Whether to use formal language"
  )
});

export type GreetingInput = z.infer<typeof GreetingInputSchema>;

export const GreetingSchema = {
  name: GreetingInputSchema.shape.name,
  language: GreetingInputSchema.shape.language,
  formal: GreetingInputSchema.shape.formal
};
```

### greeting.ts
```typescript
import { logger } from "../../../utils/logger.js";
import { createToolResponse } from "../../../types/mcp.js";
import { McpError, BaseErrorCode } from "../../../types/errors.js";
import { ToolContext } from "../../../utils/security.js";
import { GreetingInput, GreetingInputSchema } from "./types.js";

export const greeting = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = GreetingInputSchema.parse(input);
    
    logger.info("Greeting tool called", { 
      name: validatedInput.name,
      language: validatedInput.language,
      formal: validatedInput.formal,
      requestId: context.requestContext?.requestId 
    });
    
    // Generate greeting
    const result = generateGreeting(validatedInput);
    
    logger.info("Greeting generated", {
      result,
      requestId: context.requestContext?.requestId
    });
    
    return createToolResponse(JSON.stringify({
      greeting: result,
      timestamp: new Date().toISOString()
    }, null, 2));
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    
    logger.error("Error generating greeting", { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      requestId: context.requestContext?.requestId
    });
    
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error generating greeting: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

const generateGreeting = (input: GreetingInput): string => {
  const { name, language, formal } = input;
  
  switch (language) {
    case "english":
      return formal ? `Good day, ${name}.` : `Hello, ${name}!`;
    case "spanish":
      return formal ? `Buenos días, ${name}.` : `¡Hola, ${name}!`;
    case "french":
      return formal ? `Bonjour, ${name}.` : `Salut, ${name}!`;
    default:
      // This shouldn't happen due to enum validation
      return `Hello, ${name}!`;
  }
};
```

### index.ts
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GreetingSchema } from './types.js';
import { greeting } from './greeting.js';
import { registerTool, createToolExample, createToolMetadata } from '../../../types/tool.js';

export const registerGreetingTool = (server: McpServer) => {
  registerTool(
    server,
    "greeting",
    "Generate a customized greeting message in different languages.",
    {
      ...GreetingSchema
    },
    greeting,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            name: "Alice"
          },
          `{
  "greeting": "Hello, Alice!",
  "timestamp": "2025-03-08T21:34:52.795Z"
}`,
          "Simple greeting in English (default)"
        ),
        createToolExample(
          {
            name: "Carlos",
            language: "spanish",
            formal: true
          },
          `{
  "greeting": "Buenos días, Carlos.",
  "timestamp": "2025-03-08T21:35:12.123Z"
}`,
          "Formal greeting in Spanish"
        )
      ],
      rateLimit: {
        windowMs: 60 * 1000,
        maxRequests: 50
      }
    })
  );
};
```

### Update server.ts
```typescript
// Add import
import { registerGreetingTool } from "./tools/greeting/index.js";

// Inside createMcpServer
registerGreetingTool(server); // greeting
```

This guide covers the essential aspects of creating new MCP tools for the Atlas server. By following these patterns and best practices, you'll ensure your tools integrate seamlessly with the existing codebase while maintaining high standards for error handling, logging, and user experience.