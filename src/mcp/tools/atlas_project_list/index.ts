import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { ProjectStatus } from '../../../types/mcp.js';
import { createToolExample, createToolMetadata, registerTool } from '../../../types/tool.js';
import { listProjects } from './listProjects.js';
import { ProjectListRequest } from './types.js';
import { formatProjectListResponse } from './responseFormat.js';

/**
 * Registers the atlas_project_list tool with the MCP server
 * 
 * @param server The MCP server instance
 */
export function registerAtlasProjectListTool(server: McpServer): void {
  registerTool(
    server,
    "atlas_project_list",
    "Lists projects according to specified filters",
    {
      mode: z.enum(['all', 'details']).optional().default('all')
        .describe('Listing mode - "all" for paginated list, "details" for single project'),
      id: z.string().optional()
        .describe('Project ID to retrieve details for (required for mode="details")'),
      page: z.number().min(1).optional().default(1)
        .describe('Page number for paginated results (Default: 1)'),
      limit: z.number().min(1).max(100).optional().default(20)
        .describe('Number of results per page, maximum 100 (Default: 20)'),
      includeKnowledge: z.boolean().optional().default(false)
        .describe('Boolean flag to include associated knowledge items (Default: false)'),
      includeTasks: z.boolean().optional().default(false)
        .describe('Boolean flag to include associated tasks (Default: false)'),
      taskType: z.string().optional()
        .describe('Filter results by project classification'),
      status: z.union([
        z.enum(['active', 'pending', 'completed', 'archived']),
        z.array(z.enum(['active', 'pending', 'completed', 'archived']))
      ]).optional()
        .describe('Filter results by project status')
    },
    async (input, context) => {
      // Parse and process input
      const result = await listProjects(input as unknown as ProjectListRequest);
      
      // Return the result using the formatter for rich display
      return formatProjectListResponse(result);
    },
    createToolMetadata({
      examples: [
        createToolExample(
          {
            mode: "all",
            limit: 5
          },
          `{
            "projects": [
              {
                "id": "proj_123abc",
                "name": "Atlas Platform Migration",
                "description": "Migrate existing system to Atlas Platform",
                "status": "active",
                "urls": [{"title": "Requirements", "url": "https://example.com/requirements"}],
                "completionRequirements": "All migration tasks completed with validation",
                "outputFormat": "Functional system with documentation",
                "taskType": "integration",
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
            "total": 2,
            "page": 1,
            "limit": 5,
            "totalPages": 1
          }`,
          "List all projects with pagination"
        ),
        createToolExample(
          {
            mode: "details",
            id: "proj_123abc",
            includeTasks: true,
            includeKnowledge: true
          },
          `{
            "projects": [
              {
                "id": "proj_123abc",
                "name": "Atlas Platform Migration",
                "description": "Migrate existing system to Atlas Platform",
                "status": "active",
                "urls": [{"title": "Requirements", "url": "https://example.com/requirements"}],
                "completionRequirements": "All migration tasks completed with validation",
                "outputFormat": "Functional system with documentation",
                "taskType": "integration",
                "createdAt": "2025-03-23T10:11:24.123Z",
                "updatedAt": "2025-03-23T10:11:24.123Z",
                "tasks": [
                  {
                    "id": "task_123",
                    "title": "Database Schema Migration",
                    "status": "in_progress",
                    "priority": "high",
                    "createdAt": "2025-03-23T10:15:32.123Z"
                  }
                ],
                "knowledge": [
                  {
                    "id": "know_456",
                    "text": "Migration requires special handling for legacy data formats",
                    "tags": ["migration", "legacy"],
                    "domain": "technical",
                    "createdAt": "2025-03-23T11:22:14.789Z"
                  }
                ]
              }
            ],
            "total": 1,
            "page": 1,
            "limit": 20,
            "totalPages": 1
          }`,
          "Get detailed project information with associated tasks and knowledge"
        ),
        createToolExample(
          {
            mode: "all",
            status: "active",
            taskType: "integration"
          },
          `{
            "projects": [
              {
                "id": "proj_123abc",
                "name": "Atlas Platform Migration",
                "description": "Migrate existing system to Atlas Platform",
                "status": "active",
                "urls": [{"title": "Requirements", "url": "https://example.com/requirements"}],
                "completionRequirements": "All migration tasks completed with validation",
                "outputFormat": "Functional system with documentation",
                "taskType": "integration",
                "createdAt": "2025-03-23T10:11:24.123Z",
                "updatedAt": "2025-03-23T10:11:24.123Z"
              }
            ],
            "total": 1,
            "page": 1,
            "limit": 20,
            "totalPages": 1
          }`,
          "Filter projects by status and type"
        )
      ],
      requiredPermission: "project:read",
      entityType: 'project',
      returnSchema: z.object({
        projects: z.array(z.object({
          id: z.string().describe("Project ID"),
          name: z.string().describe("Project name"),
          description: z.string().describe("Project description"),
          status: z.string().describe("Project status"),
          urls: z.array(z.object({
            title: z.string(),
            url: z.string()
          })).describe("Reference materials"),
          completionRequirements: z.string().describe("Completion criteria"),
          outputFormat: z.string().describe("Deliverable format"),
          taskType: z.string().describe("Project classification"),
          createdAt: z.string().describe("Creation timestamp"),
          updatedAt: z.string().describe("Last update timestamp"),
          knowledge: z.array(z.object({
            id: z.string(),
            text: z.string(),
            tags: z.array(z.string()).optional(),
            domain: z.string(),
            createdAt: z.string()
          })).optional().describe("Associated knowledge items (if requested)"),
          tasks: z.array(z.object({
            id: z.string(),
            title: z.string(),
            status: z.string(),
            priority: z.string(),
            createdAt: z.string()
          })).optional().describe("Associated tasks (if requested)")
        })),
        total: z.number().describe("Total number of projects matching criteria"),
        page: z.number().describe("Current page number"),
        limit: z.number().describe("Number of items per page"),
        totalPages: z.number().describe("Total number of pages")
      }),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30 // 30 requests per minute
      }
    })
  );
}
