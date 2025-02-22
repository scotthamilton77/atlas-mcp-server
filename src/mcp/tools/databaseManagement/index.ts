import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { cleanDatabase } from "./cleanDatabase.js";
import { CleanDatabaseSchemaShape } from "./types.js";
import { registerTool, createToolMetadata } from '../../../types/tool.js';
import { z } from 'zod';

export const registerDatabaseTools = (server: McpServer) => {
  registerTool(
    server,
    "database.clean",
    "Clean the database by removing all nodes and relationships, then reinitialize the schema. " +
    "This action cannot be undone.",
    CleanDatabaseSchemaShape,
    cleanDatabase,
    createToolMetadata({
      requiredPermission: "database:admin",
      returnSchema: z.object({
        success: z.boolean().describe("Operation success"),
        message: z.string().describe("Result message"),
        details: z.object({
          nodesDeleted: z.number().describe("Nodes removed"),
          relationshipsDeleted: z.number().describe("Relationships removed")
        }).optional().describe("Cleanup details")
      }),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 1 // Only allow 1 database clean per minute
      }
    })
  );
};