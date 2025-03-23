import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { createToolExample, createToolMetadata, registerTool } from '../../../types/tool.js';
import { atlasDeleteProject } from './deleteProject.js';
import { AtlasProjectDeleteSchemaShape } from './types.js';

export const registerAtlasProjectDeleteTool = (server: McpServer) => {
  registerTool(
    server,
    "atlas_project_delete",
    "Deletes existing project(s) from the system",
    AtlasProjectDeleteSchemaShape,
    atlasDeleteProject,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            mode: "single",
            id: "proj_123abc"
          },
          `{
            "success": true,
            "message": "Project with ID proj_123abc deleted successfully",
            "id": "proj_123abc"
          }`,
          "Delete a single project by ID"
        ),
        createToolExample(
          {
            mode: "bulk",
            projectIds: ["proj_123abc", "proj_456def"]
          },
          `{
            "success": true,
            "message": "Successfully deleted 2 projects",
            "deleted": ["proj_123abc", "proj_456def"],
            "errors": []
          }`,
          "Delete multiple projects in a single operation"
        )
      ],
      requiredPermission: "project:delete",
      returnSchema: z.union([
        // Single project deletion response
        z.object({
          id: z.string().describe("Project ID"),
          success: z.boolean().describe("Operation success status"),
          message: z.string().describe("Result message")
        }),
        // Bulk deletion response
        z.object({
          success: z.boolean().describe("Operation success status"),
          message: z.string().describe("Result message"),
          deleted: z.array(z.string()).describe("IDs of successfully deleted projects"),
          errors: z.array(z.object({
            projectId: z.string().describe("Project ID that failed to delete"),
            error: z.object({
              code: z.string().describe("Error code"),
              message: z.string().describe("Error message"),
              details: z.any().optional().describe("Additional error details")
            }).describe("Error information")
          })).describe("Deletion errors")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 10 // 10 requests per minute (either single or bulk)
      }
    })
  );
};
