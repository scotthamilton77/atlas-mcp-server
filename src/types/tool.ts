import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createToolMiddleware, ToolContext } from "../utils/security.js";
import { McpToolResponse, createToolResponse } from "./mcp.js";
import { McpError, BaseErrorCode } from "./errors.js";

// Tool example definition
export interface ToolExample {
  input: Record<string, unknown>;
  output: string;
  description?: string;
}

// Tool metadata
export interface ToolMetadata {
  examples?: ToolExample[];
  returnSchema?: z.ZodType<any>;
  requiredPermission?: string;
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
}

// Base handler type that matches SDK expectations
type BaseToolHandler = (
  input: unknown,
  context: ToolContext
) => Promise<McpToolResponse>;

// Enhanced tool registration function
export const registerTool = (
  server: McpServer,
  name: string,
  description: string,
  schema: z.ZodRawShape,
  handler: BaseToolHandler,
  metadata?: ToolMetadata
) => {
  const wrappedHandler = async (
    args: Record<string, unknown>,
    extra: Record<string, unknown>
  ): Promise<McpToolResponse> => {
    try {
      // Check permissions if required
      if (metadata?.requiredPermission) {
        const { checkPermission } = await import("../utils/security.js");
        checkPermission(extra as ToolContext, metadata.requiredPermission);
      }

      // Validate input
      const zodSchema = z.object(schema);
      const validatedInput = zodSchema.parse(args);

      // Create middleware with custom rate limit if specified
      const middleware = createToolMiddleware(name);
      
      const result = await middleware(handler, validatedInput, extra as ToolContext);
      
      // Ensure result matches expected format
      if (typeof result === 'object' && result !== null && 'content' in result) {
        return result as McpToolResponse;
      }
      
      // Convert unexpected result format to standard response
      return createToolResponse(JSON.stringify(result));
    } catch (error) {
      if (error instanceof McpError) {
        return error.toResponse();
      }
      if (error instanceof z.ZodError) {
        return createToolResponse(
          `Validation error: ${error.errors.map(e => e.message).join(", ")}`,
          true
        );
      }
      return createToolResponse(
        `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`,
        true
      );
    }
  };

  // Build enhanced description with examples
  const fullDescription = metadata?.examples 
    ? `${description}\n\nExamples:\n${
        metadata.examples.map(ex => 
          `${ex.description ? `${ex.description}:\n` : ''}Input: ${JSON.stringify(ex.input, null, 2)}\nOutput: ${ex.output}`
        ).join('\n\n')
      }`
    : description;

  // Register tool with server
  server.tool(name, fullDescription, schema, wrappedHandler);
};

// Helper to create tool examples
export const createToolExample = (
  input: Record<string, unknown>,
  output: string,
  description?: string
): ToolExample => ({
  input,
  output,
  description
});

// Helper to create tool metadata
export const createToolMetadata = (metadata: ToolMetadata): ToolMetadata => metadata;

// Example usage:
/*
registerTool(
  server,
  "project.create",
  "Create a new project",
  CreateProjectSchemaShape,
  async (input, context) => {
    const validatedInput = CreateProjectSchema.parse(input);
    const result = await createProject(validatedInput, context);
    return createToolResponse(JSON.stringify(result, null, 2));
  },
  createToolMetadata({
    examples: [
      createToolExample(
        { name: "My Project", description: "A test project" },
        "Project created successfully with ID: proj_123",
        "Create a basic project"
      )
    ],
    requiredPermission: "project:create",
    returnSchema: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional()
    })
  })
);
*/