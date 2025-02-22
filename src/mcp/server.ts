#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { McpError, BaseErrorCode } from "../types/errors.js";
import { configureSecurity } from "../utils/security.js";

// Import tool registrations
import { registerCreateProjectTool } from "./tools/createProject/index.js";
import { registerUpdateProjectTool } from "./tools/updateProject/index.js";
import { registerDeleteProjectTool } from "./tools/deleteProject/index.js";
import { registerAddProjectNoteTool } from "./tools/addProjectNote/index.js";
import { registerProjectLinkTools } from "./tools/manageProjectLinks/index.js";
import { registerDependencyTools } from "./tools/manageDependencies/index.js";
import { registerMemberTools } from "./tools/manageMembers/index.js";
import { registerDatabaseTools } from "./tools/databaseManagement/index.js";
import { registerWhiteboardTools } from "./tools/whiteboard/index.js";
import { registerNeo4jSearchTool } from "./tools/neo4jSearch/index.js";

// Import resource registrations
import { registerProjectListResource } from "./resources/projectList/index.js";
import { registerProjectDetailsResource } from "./resources/projectDetails/index.js";
import { registerProjectNotesResource } from "./resources/projectNotes/index.js";
import { registerProjectLinksResource } from "./resources/projectLinks/index.js";
import { registerProjectDependenciesResource } from "./resources/projectDependencies/index.js";
import { registerProjectMembersResource } from "./resources/projectMembers/index.js";

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
    registerCreateProjectTool(server);
    registerUpdateProjectTool(server);
    registerDeleteProjectTool(server);
    registerAddProjectNoteTool(server);
    registerProjectLinkTools(server);
    registerDependencyTools(server);
    registerMemberTools(server);
    registerDatabaseTools(server);
    registerWhiteboardTools(server); // Register whiteboard tools
    registerNeo4jSearchTool(server);

    // Register resources
    registerProjectListResource(server);
    registerProjectDetailsResource(server);
    registerProjectNotesResource(server);
    registerProjectLinksResource(server);
    registerProjectDependenciesResource(server);
    registerProjectMembersResource(server);

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