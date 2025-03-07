import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DeleteProjectSchemaShape } from './types.js';
import { deleteProject } from './deleteProject.js';
import { registerTool, createToolExample, createToolMetadata } from '../../../types/tool.js';
import { z } from 'zod';

export const registerDeleteProjectTool = (server: McpServer) => {
  registerTool(
    server,
    "project_delete",
    "Delete projects and their associated data from the system. Supports both single project deletion and bulk operations for multiple projects.",
    DeleteProjectSchemaShape,
    deleteProject,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            mode: "single",
            projectId: "proj_123"
          },
          `{
  "success": true,
  "message": "Project proj_123 deleted successfully. Cleaned up: 2 notes, 1 links, 3 members, 1 outgoing dependencies, 2 incoming dependencies"
}`,
          "Delete a single project"
        ),
        createToolExample(
          {
            mode: "bulk",
            projectIds: ["proj_123", "proj_456"]
          },
          `{
  "success": true,
  "message": "Successfully deleted 2 projects",
  "deletedCount": 2,
  "notFoundIds": []
}`,
          "Delete multiple projects"
        )
      ],
      requiredPermission: "project:delete",
      returnSchema: z.union([
        // Single deletion response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result with cleanup details. WARNING: This action removes all associated data and cannot be undone.")
        }),
        // Bulk deletion response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message"),
          deletedCount: z.number().describe("Projects deleted"),
          notFoundIds: z.array(z.string()).describe("Projects not found")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 10 // 10 project deletions per minute (single or bulk)
      }
    })
  );
};