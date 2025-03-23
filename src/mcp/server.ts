#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "../config/index.js";
import { BaseErrorCode, McpError } from "../types/errors.js";
import { logger } from "../utils/logger.js";
import { configureSecurity } from "../utils/security.js";

// Import tool registrations
import { registerAtlasProjectCreateTool } from "./tools/atlas_project_create/index.js";
import { registerAtlasProjectListTool } from "./tools/atlas_project_list/index.js";

export const createMcpServer = async () => {
  try {
    // Configure security settings
    configureSecurity({
      authRequired: config.security.authRequired
    });

    const server = new McpServer({
      name: config.mcpServerName,
      version: config.mcpServerVersion,
      capabilities: {
        resources: {},
        tools: {
          // Define global tool capabilities
          requestContext: true, // Enable request context for all tools
          rateLimit: {
            windowMs: 60 * 1000, // 1 minute default window
            maxRequests: 100 // 100 requests per minute default
          },
          permissions: {
            required: config.security.authRequired // Make permissions optional based on security config
          }
        }
      }
    });

    // Register tools
    registerAtlasProjectCreateTool(server); // atlas_project_create
    registerAtlasProjectListTool(server); // atlas_project_list

    // Register resources


    // Connect using stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info("ATLAS MCP Server running on stdio", {
      name: config.mcpServerName,
      version: config.mcpServerVersion,
      authRequired: config.security.authRequired
    });

    return server;
  } catch (error) {
    // Handle initialization errors
    logger.error("Failed to initialize MCP server", {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to initialize MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};
