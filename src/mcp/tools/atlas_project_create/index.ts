import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { createToolExample, createToolMetadata, registerTool } from '../../../types/tool.js';
import { ProjectStatus } from '../../../types/mcp.js';
import { atlasCreateProject } from './createProject.js';
import { AtlasProjectCreateSchemaShape } from './types.js';

export const registerAtlasProjectCreateTool = (server: McpServer) => {
  registerTool(
    server,
    "atlas_project_create",
    "Creates a new project or multiple projects in the system",
    AtlasProjectCreateSchemaShape,
    atlasCreateProject,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            mode: "single",
            name: "Atlas Platform Migration",
            description: "Migrate existing system to Atlas Platform",
            status: "active",
            urls: [{title: "Requirements", url: "https://example.com/requirements"}],
            completionRequirements: "All migration tasks completed with validation",
            outputFormat: "Functional system with documentation",
            taskType: "integration"
          },
          `{
  "id": "proj_123abc",
  "name": "Atlas Platform Migration",
  "description": "Migrate existing system to Atlas Platform",
  "status": "active",
  "urls": [{"title": "Requirements", "url": "https://example.com/requirements or file://path/to/file"}],
  "completionRequirements": "All migration tasks completed with validation",
  "outputFormat": "Functional system with documentation",
  "taskType": "integration",
  "createdAt": "2025-03-23T10:11:24.123Z",
  "updatedAt": "2025-03-23T10:11:24.123Z"
}`,
          "Create a single project with detailed specifications"
        ),
        createToolExample(
          {
            mode: "bulk",
            projects: [
              {
                name: "Data Migration",
                description: "Migrate database to new structure",
                completionRequirements: "All data migrated with validation",
                outputFormat: "Verified database",
                taskType: "data"
              },
              {
                name: "User Interface Redesign",
                description: "Redesign the application UI",
                status: "pending",
                completionRequirements: "All screens redesigned and approved",
                outputFormat: "Design specifications and prototypes",
                taskType: "design"
              }
            ]
          },
          `{
  "success": true,
  "message": "Successfully created 2 projects",
  "created": [
    {
      "id": "proj_123abc",
      "name": "Data Migration",
      "description": "Migrate database to new structure",
      "status": "active",
      "urls": [],
      "completionRequirements": "All data migrated with validation",
      "outputFormat": "Verified database",
      "taskType": "data",
      "createdAt": "2025-03-23T10:11:24.123Z",
      "updatedAt": "2025-03-23T10:11:24.123Z"
    },
    {
      "id": "proj_456def",
      "name": "User Interface Redesign",
      "description": "Redesign the application UI",
      "status": "pending",
      "urls": [],
      "completionRequirements": "All screens redesigned and approved",
      "outputFormat": "Design specifications and prototypes",
      "taskType": "design",
      "createdAt": "2025-03-23T10:11:24.456Z",
      "updatedAt": "2025-03-23T10:11:24.456Z"
    }
  ],
  "errors": []
}`,
          "Create multiple projects in a single operation"
        )
      ],
      requiredPermission: "project:create",
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
        // Bulk creation response
        z.object({
          success: z.boolean().describe("Operation success status"),
          message: z.string().describe("Result message"),
          created: z.array(z.object({
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
          })).describe("Created projects"),
          errors: z.array(z.object({
            index: z.number().describe("Index in the projects array"),
            project: z.any().describe("Original project data"),
            error: z.object({
              code: z.string().describe("Error code"),
              message: z.string().describe("Error message"),
              details: z.any().optional().describe("Additional error details")
            }).describe("Error information")
          })).describe("Creation errors")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 10 // 10 requests per minute (either single or bulk)
      }
    })
  );
};
