import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { UpdateProjectSchemaShape } from './types.js';
import { updateProject } from './updateProject.js';
import { registerTool, createToolExample, createToolMetadata } from '../../../types/tool.js';
import { z } from 'zod';
import { VALID_PROJECT_STATUSES } from '../createProject/types.js';

export const registerUpdateProjectTool = (server: McpServer) => {
  registerTool(
    server,
    "project.update",
    "Update projects individually or in bulk. For single updates, provide project ID and field changes. " +
    "For multiple updates, provide a projects array. Only specified fields are modified.",
    UpdateProjectSchemaShape,
    updateProject,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            mode: "single",
            id: "proj_123",
            updates: {
              name: "Updated Project Name",
              description: "New project description"
            }
          },
          `{
  "id": "proj_123",
  "name": "Updated Project Name",
  "description": "New project description",
  "status": "active",
  "createdAt": "2025-02-20T13:45:30Z",
  "updatedAt": "2025-02-20T14:30:00Z"
}`,
          "Update a single project"
        ),
        createToolExample(
          {
            mode: "bulk",
            projects: [
              {
                id: "proj_123",
                updates: {
                  name: "Updated Project 1",
                  status: "completed"
                }
              },
              {
                id: "proj_456",
                updates: {
                  description: "Updated description",
                  status: "archived"
                }
              }
            ]
          },
          `{
  "success": true,
  "message": "Successfully updated 2 projects",
  "updated": [
    {
      "id": "proj_123",
      "name": "Updated Project 1",
      "description": "Original description remains unchanged",
      "status": "completed",
      "createdAt": "2025-02-20T13:45:30Z",
      "updatedAt": "2025-02-20T14:30:00Z"
    },
    {
      "id": "proj_456",
      "name": "Original name remains unchanged", 
      "description": "Updated description",
      "status": "archived",
      "createdAt": "2025-02-20T13:46:00Z",
      "updatedAt": "2025-02-20T14:30:00Z"
    }
  ],
  "notFound": []
}`,
          "Update multiple projects"
        )
      ],
      requiredPermission: "project:update",
      returnSchema: z.union([
        // Single update response
        z.object({
          id: z.string().describe("Project ID"),
          name: z.string().describe("Current name"),
          description: z.string().describe("Current description"),
          status: z.enum(VALID_PROJECT_STATUSES).describe("Current status"),
          createdAt: z.string().describe("Creation time"),
          updatedAt: z.string().describe("Last update time")
        }),
        // Bulk update response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message"),
          updated: z.array(z.object({
            id: z.string().describe("Project ID"),
            name: z.string().describe("Name"),
            description: z.string().describe("Description"),
            status: z.enum(VALID_PROJECT_STATUSES).describe("Status"),
            createdAt: z.string().describe("Created"),
            updatedAt: z.string().describe("Updated")
          })).describe("Updated projects"),
          notFound: z.array(z.string()).describe("Projects not found")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 20 // 20 project updates per minute (single or bulk)
      }
    })
  );
};