import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
  AddProjectLinkSchemaShape,
  UpdateProjectLinkSchemaShape,
  DeleteProjectLinkSchemaShape
} from './types.js';
import { addProjectLink } from './addProjectLink.js';
import { updateProjectLink } from './updateProjectLink.js';
import { deleteProjectLink } from './deleteProjectLink.js';
import { registerTool, createToolExample, createToolMetadata } from '../../../types/tool.js';
import { z } from 'zod';

export const registerProjectLinkTools = (server: McpServer) => {
  // Register add link tool
  registerTool(
    server,
    "project.link.add",
    "Add links to reference external resources like documentation or designs. Use 'single' mode for one link " +
    "or 'bulk' mode for multiple. Links can have optional categories and descriptions.",
    AddProjectLinkSchemaShape,
    addProjectLink,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            projectId: "proj_123",
            mode: "single",
            title: "API Documentation",
            url: "https://api.example.com/docs",
            description: "REST API documentation"
          },
          `{
  "id": "link_abc",
  "projectId": "proj_123",
  "title": "API Documentation",
  "url": "https://api.example.com/docs",
  "description": "REST API documentation",
  "category": null
}`,
          "Add a single link"
        ),
        createToolExample(
          {
            projectId: "proj_456",
            mode: "bulk",
            links: [
              {
                title: "API Documentation",
                url: "https://api.example.com/docs",
                description: "REST API documentation"
              },
              {
                title: "Design Mockups",
                url: "https://figma.com/file/xyz",
                description: "UI/UX design mockups",
                category: "design"
              }
            ]
          },
          `{
  "success": true,
  "message": "Successfully added 2 links",
  "links": [
    {
      "id": "link_abc",
      "projectId": "proj_456",
      "title": "API Documentation",
      "url": "https://api.example.com/docs",
      "description": "REST API documentation",
      "category": "general"
    },
    {
      "id": "link_def",
      "projectId": "proj_456",
      "title": "Design Mockups",
      "url": "https://figma.com/file/xyz",
      "description": "UI/UX design mockups",
      "category": "design"
    }
  ]
}`,
          "Add multiple links"
        )
      ],
      requiredPermission: "project:link:add",
      returnSchema: z.union([
        // Single link response
        z.object({
          id: z.string().describe("Link ID (link_ prefix)"),
          projectId: z.string().describe("Associated project ID"),
          title: z.string().describe("Link title"),
          url: z.string().describe("Resource URL"),
          description: z.string().nullable().describe("Optional description"),
          category: z.string().nullable().describe("Optional category")
        }),
        // Bulk creation response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message"),
          links: z.array(z.object({
            id: z.string().describe("Link ID"),
            projectId: z.string().describe("Project ID"),
            title: z.string().describe("Title"),
            url: z.string().describe("URL"),
            description: z.string().nullable().describe("Description"),
            category: z.string().nullable().describe("Category")
          })).describe("Created links")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30 // 30 link additions per minute (single or bulk)
      }
    })
  );

  // Register update link tool
  registerTool(
    server,
    "project.link.update",
    "Update link details like title, URL, description, or category. Use 'single' mode with linkId " +
    "or 'bulk' mode with links array. Only specified fields are modified.",
    UpdateProjectLinkSchemaShape,
    updateProjectLink,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            linkId: "link_abc",
            updates: {
              title: "Updated API Docs",
              description: "Updated documentation"
            }
          },
          `{
  "id": "link_abc",
  "title": "Updated API Docs",
  "description": "Updated documentation",
  "url": "https://api.example.com/docs",
  "category": null
}`,
          "Update a single link"
        ),
        createToolExample(
          {
            links: [
              {
                linkId: "link_abc",
                updates: {
                  title: "Updated API Docs"
                }
              },
              {
                linkId: "link_def",
                updates: {
                  category: "ui-design"
                }
              }
            ]
          },
          `{
  "success": true,
  "message": "Successfully updated 2 links",
  "updated": [
    {
      "id": "link_abc",
      "title": "Updated API Docs",
      "description": "REST API documentation",
      "url": "https://api.example.com/docs",
      "category": null
    },
    {
      "id": "link_def",
      "title": "Design Mockups",
      "url": "https://figma.com/file/xyz",
      "description": "UI/UX design mockups",
      "category": "ui-design"
    }
  ],
  "notFound": []
}`,
          "Update multiple links"
        )
      ],
      requiredPermission: "project:link:update",
      returnSchema: z.union([
        // Single update response
        z.object({
          id: z.string().describe("Link ID"),
          title: z.string().describe("Current title"),
          url: z.string().describe("Current URL"),
          description: z.string().nullable().describe("Current description"),
          category: z.string().nullable().describe("Current category")
        }),
        // Bulk update response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message"),
          updated: z.array(z.object({
            id: z.string().describe("Link ID"),
            title: z.string().describe("Title"),
            url: z.string().describe("URL"),
            description: z.string().nullable().describe("Description"),
            category: z.string().nullable().describe("Category")
          })).describe("Updated links"),
          notFound: z.array(z.string()).describe("Links not found")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30 // 30 link updates per minute (single or bulk)
      }
    })
  );

  // Register delete link tool
  registerTool(
    server,
    "project.link.delete",
    "Delete links from a project. Use 'single' mode with linkId or 'bulk' mode with linkIds array. " +
    "This action cannot be undone.",
    DeleteProjectLinkSchemaShape,
    deleteProjectLink,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            linkId: "link_abc"
          },
          `{
  "success": true,
  "message": "Link link_abc deleted successfully"
}`,
          "Delete a single link"
        ),
        createToolExample(
          {
            linkIds: ["link_abc", "link_def"]
          },
          `{
  "success": true,
  "message": "Successfully deleted 2 links",
  "deletedCount": 2,
  "notFoundIds": []
}`,
          "Delete multiple links"
        )
      ],
      requiredPermission: "project:link:delete",
      returnSchema: z.union([
        // Single deletion response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message")
        }),
        // Bulk deletion response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message"),
          deletedCount: z.number().describe("Links deleted"),
          notFoundIds: z.array(z.string()).describe("Links not found")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 20 // 20 link deletions per minute (single or bulk)
      }
    })
  );
};