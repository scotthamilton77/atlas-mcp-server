import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProjectListSchema } from './types.js';
import { projectList } from './projectList.js';
import { registerTool, createToolExample, createToolMetadata } from '../../../types/tool.js';
import { z } from 'zod';

/**
 * Register the project_list tool with the MCP server
 * This tool serves as an all-in-one interface for retrieving project information
 */
export const registerProjectListTool = (server: McpServer) => {
  registerTool(
    server,
    "project_list",
    "Unified tool for retrieving project information in various formats. Consolidates all project resource endpoints into a single tool.",
    {
      // Input schema
      ...ProjectListSchema
    },
    projectList,
    createToolMetadata({
      examples: [
        // Example 1: List all projects
        createToolExample(
          {
            mode: "all",
            page: 1,
            limit: 10
          },
          `{
  "items": [
    {
      "id": "proj_1",
      "name": "Project A",
      "description": "Description for Project A",
      "status": "active",
      "createdAt": "2025-03-07T12:00:00Z"
    },
    {
      "id": "proj_2",
      "name": "Project B",
      "description": "Description for Project B",
      "status": "pending",
      "createdAt": "2025-03-06T10:30:00Z"
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 10
}`,
          "List all projects with pagination"
        ),
        
        // Example 2: Get project details
        createToolExample(
          {
            mode: "details",
            projectId: "proj_1",
            includeLinks: true,
            includeNotes: true
          },
          `{
  "id": "proj_1",
  "name": "Project A",
  "description": "Description for Project A",
  "status": "active",
  "createdAt": "2025-03-07T12:00:00Z",
  "notes": [
    {
      "id": "note_1",
      "text": "This is a note for Project A",
      "createdAt": "2025-03-07T14:30:00Z",
      "tags": ["important", "meeting"]
    }
  ],
  "links": [
    {
      "id": "link_1",
      "title": "Project Documentation",
      "url": "https://example.com/docs",
      "category": "documentation",
      "createdAt": "2025-03-07T13:15:00Z"
    }
  ]
}`,
          "Get detailed project information with related notes and links"
        ),
        
        // Example 3: Get project notes with tag filtering
        createToolExample(
          {
            mode: "notes",
            projectId: "proj_1",
            tags: ["important"]
          },
          `{
  "items": [
    {
      "id": "note_1",
      "text": "This is an important note",
      "createdAt": "2025-03-07T14:30:00Z",
      "tags": ["important", "meeting"]
    }
  ],
  "projectId": "proj_1",
  "filteredByTags": ["important"],
  "totalItems": 1
}`,
          "Get project notes filtered by tags"
        ),
        
        // Example 4: Get project dependencies
        createToolExample(
          {
            mode: "dependencies",
            projectId: "proj_1"
          },
          `{
  "projectId": "proj_1",
  "dependencies": [
    {
      "id": "dep_1",
      "sourceProject": "proj_1",
      "targetProject": "proj_2",
      "type": "requires",
      "description": "Project A requires Project B"
    }
  ],
  "dependents": []
}`,
          "Get project dependencies and dependents"
        )
      ],
      requiredPermission: "project:read",
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30      // 30 requests per minute
      }
    })
  );
};