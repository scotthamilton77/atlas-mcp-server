import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { ProjectStatus } from '../../../types/mcp.js';
import { createToolExample, createToolMetadata, registerTool } from '../../../types/tool.js';
import { atlasUpdateProject } from './updateProject.js';
import { AtlasProjectUpdateSchemaShape } from './types.js';

export const registerAtlasProjectUpdateTool = (server: McpServer) => {
  registerTool(
    server,
    "atlas_project_update",
    "Updates existing project(s) in the system",
    AtlasProjectUpdateSchemaShape,
    atlasUpdateProject,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            mode: "single",
            id: "proj_123abc",
            updates: {
              name: "Atlas Platform Migration Updated",
              description: "Updated description for Atlas Platform Migration",
              status: "in-progress"
            }
          },
          `{
            "id": "proj_123abc",
            "name": "Atlas Platform Migration Updated",
            "description": "Updated description for Atlas Platform Migration",
            "status": "in-progress",
            "urls": [{"title": "Requirements", "url": "https://example.com/requirements"}],
            "completionRequirements": "All migration tasks completed with validation",
            "outputFormat": "Functional system with documentation",
            "taskType": "integration",
            "createdAt": "2025-03-23T10:11:24.123Z",
            "updatedAt": "2025-03-23T10:12:34.456Z"
          }`,
          "Update a single project with new name, description, and status"
        ),
        createToolExample(
          {
            mode: "bulk",
            projects: [
              {
                id: "proj_123abc",
                updates: {
                  status: "completed",
                  completionRequirements: "Updated completion requirements"
                }
              },
              {
                id: "proj_456def",
                updates: {
                  status: "in-progress",
                  description: "Updated description for the UI redesign"
                }
              }
            ]
          },
          `{
            "success": true,
            "message": "Successfully updated 2 projects",
            "updated": [
              {
                "id": "proj_123abc",
                "name": "Data Migration",
                "description": "Migrate database to new structure",
                "status": "completed",
                "urls": [],
                "completionRequirements": "Updated completion requirements",
                "outputFormat": "Verified database",
                "taskType": "data",
                "createdAt": "2025-03-23T10:11:24.123Z",
                "updatedAt": "2025-03-23T10:12:34.456Z"
              },
              {
                "id": "proj_456def",
                "name": "User Interface Redesign",
                "description": "Updated description for the UI redesign",
                "status": "in-progress",
                "urls": [],
                "completionRequirements": "All screens redesigned and approved",
                "outputFormat": "Design specifications and prototypes",
                "taskType": "design",
                "createdAt": "2025-03-23T10:11:24.456Z",
                "updatedAt": "2025-03-23T10:12:34.789Z"
              }
            ],
            "errors": []
          }`,
          "Update multiple projects in a single operation"
        )
      ],
      requiredPermission: "project:update",
      returnSchema: z.union([
        // Single project response
        z.object({
          id: z.string().describe("Project ID"),
          name: z.string().describe("Project name"),
          description: z.string().describe("Project description"),
          status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).describe("Project status"),
          urls: z.array(z.object({
            title: z.string(),
            url: z.string()
          })).describe("Reference materials"),
          completionRequirements: z.string().describe("Completion criteria"),
          outputFormat: z.string().describe("Deliverable format"),
          taskType: z.string().describe("Project classification"),
          createdAt: z.string().describe("Creation timestamp"),
          updatedAt: z.string().describe("Last update timestamp")
        }),
        // Bulk update response
        z.object({
          success: z.boolean().describe("Operation success status"),
          message: z.string().describe("Result message"),
          updated: z.array(z.object({
            id: z.string().describe("Project ID"),
            name: z.string().describe("Project name"),
            description: z.string().describe("Project description"),
            status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.PENDING, ProjectStatus.COMPLETED, ProjectStatus.ARCHIVED]).describe("Project status"),
            urls: z.array(z.object({
              title: z.string(),
              url: z.string()
            })).describe("Reference materials"),
            completionRequirements: z.string().describe("Completion criteria"),
            outputFormat: z.string().describe("Deliverable format"),
            taskType: z.string().describe("Project classification"),
            createdAt: z.string().describe("Creation timestamp"),
            updatedAt: z.string().describe("Last update timestamp")
          })).describe("Updated projects"),
          errors: z.array(z.object({
            index: z.number().describe("Index in the projects array"),
            project: z.any().describe("Original project update data"),
            error: z.object({
              code: z.string().describe("Error code"),
              message: z.string().describe("Error message"),
              details: z.any().optional().describe("Additional error details")
            }).describe("Error information")
          })).describe("Update errors")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 15 // 15 requests per minute (either single or bulk)
      }
    })
  );
};
