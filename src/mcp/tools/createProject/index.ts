import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProjectSchema, CreateProjectSchema, VALID_PROJECT_STATUSES } from './types.js';
import { createProject } from './createProject.js';
import { registerTool, createToolExample, createToolMetadata } from '../../../types/tool.js';
import { z } from 'zod';

export const registerCreateProjectTool = (server: McpServer) => {
  registerTool(
    server,
    "project.create",
    "Create projects individually or in bulk. Each project needs a unique name, with optional description and status. " +
    "Use 'single' mode for one project or 'bulk' mode with a projects array for multiple (max 100).",
    {
      mode: z.enum(["single", "bulk"]).describe(
        "'single' for one project, 'bulk' for multiple projects."
      ),
      name: z.string().min(1).optional().describe(
        "Required for single mode: Project name (unique, non-empty)."
      ),
      description: z.string().optional().describe(
        "Optional project description."
      ),
      status: z.enum(VALID_PROJECT_STATUSES).optional().describe(
        "Project status: 'active' (default), 'pending', 'completed', or 'archived'."
      ),
      projects: z.array(ProjectSchema).min(1).max(100).optional().describe(
        "Required for bulk mode: Array of 1-100 projects."
      )
    },
    createProject,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            name: "My Project",
            description: "A sample project for demonstration",
            mode: "single"
          },
          `{
  "id": "proj_123",
  "name": "My Project", 
  "description": "A sample project for demonstration",
  "status": "active"
}`,
          "Create a single project"
        ),
        createToolExample(
          {
            mode: "bulk",
            projects: [
              {
                name: "Project A",
                description: "First project in batch"
              },
              {
                name: "Project B",
                description: "Second project in batch",
                status: "pending"
              }
            ]
          },
          `{
  "success": true,
  "message": "Successfully created 2 projects",
  "projects": [
    {
      "id": "proj_123",
      "name": "Project A",
      "description": "First project in batch",
      "status": "active"
    },
    {
      "id": "proj_124", 
      "name": "Project B",
      "description": "Second project in batch",
      "status": "pending"
    }
  ]
}`,
          "Create multiple projects"
        )
      ],
      requiredPermission: "project:create",
      returnSchema: z.union([
        // Single project response
        z.object({
          id: z.string().describe("Project ID (proj_ prefix)"),
          name: z.string().describe("Project name"),
          description: z.string().describe("Project description"),
          status: z.string().describe("Project status")
        }),
        // Bulk creation response
        z.object({
          success: z.boolean().describe("Operation success status"),
          message: z.string().describe("Result message"),
          projects: z.array(z.object({
            id: z.string().describe("Project ID"),
            name: z.string().describe("Project name"),
            description: z.string().describe("Project description"), 
            status: z.string().describe("Project status")
          })).describe("Created projects")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 10 // 10 requests per minute (either single or bulk)
      }
    })
  );
};