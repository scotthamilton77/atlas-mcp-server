import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectLinks } from './getProjectLinks.js';
import { ProjectLinksParamsSchema, ProjectLinksQuerySchema } from './types.js';
import { listProjects } from '../../../neo4j/projectService.js';
import { extractProjectIds } from '../../../utils/projectHelpers.js';

export const registerProjectLinksResource = (server: McpServer) => {
  // Create resource template with parameter completion
  const template = new ResourceTemplate(
    "project://{projectId}/links",
    {
      list: undefined, // No list completion needed
      complete: {
        projectId: async () => {
          // Provide project ID completion from existing projects
          try {
            const projects = await listProjects();
            return extractProjectIds(projects);
          } catch (error) {
            return []; // Return empty list if projects can't be fetched
          }
        }
      }
    }
  );

  // Define resource metadata
  const metadata = {
    name: "Project Links",
    description: "Fetches links associated with a specific project. Supports filtering by category, " +
                "search terms, and sorting options. Returns both link data and metadata about " +
                "categories and domains.",
    mimeType: "application/json",
    uriParamsSchema: ProjectLinksParamsSchema,
    querySchema: ProjectLinksQuerySchema,
    examples: [
      {
        name: "All links",
        uri: "project://proj_123/links",
        description: "Get all links for a project"
      },
      {
        name: "Filter by category",
        uri: "project://proj_123/links?category=documentation",
        description: "Get only documentation links"
      },
      {
        name: "Search links",
        uri: "project://proj_123/links?search=api",
        description: "Search for links containing 'api' in title or description"
      },
      {
        name: "Sorted links",
        uri: "project://proj_123/links?sortBy=createdAt&sortOrder=desc",
        description: "Get links sorted by creation date in descending order"
      }
    ],
    permissions: {
      required: true,
      scope: "project:links:read"
    },
    rateLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60      // 60 requests per minute
    },
    caching: {
      enabled: true,
      ttl: 300,           // Cache for 5 minutes
      vary: ['category', 'search', 'sortBy', 'sortOrder'] // Vary cache by all query params
    }
  };

  // Register the resource
  server.resource(
    "project-links",      // Resource name
    template,            // URI template
    metadata,            // Resource metadata
    getProjectLinks      // Handler function
  );
};