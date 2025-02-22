import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listProjects } from './listProjects.js';
import { ProjectListQuerySchema } from './types.js';

export const registerProjectListResource = (server: McpServer) => {
  // Create resource template
  const template = new ResourceTemplate(
    "project-list://all",
    {
      list: async () => ({
        resources: [{ 
          uri: "project-list://all",
          name: "Project List",
          description: "Lists all projects with pagination support.\n" +
                      "Query Parameters:\n" +
                      "- page & limit: Control pagination (default: page=1, limit=10)",
          mimeType: "application/json"
        }]
      }),
      complete: {} // No completion needed for this resource
    }
  );

  const metadata = {
    name: "Project List",
    description: "Lists all projects with pagination support.\n\n" +
                "Features:\n" +
                "- Projects are ordered by creation date (newest first)\n" +
                "- Paginate results with customizable page size\n\n" +
                "Returns an array of projects along with total count, current page info, and applied filters.",
    mimeType: "application/json",
    querySchema: ProjectListQuerySchema,
    examples: [
      {
        name: "List all projects",
        uri: "project-list://all",
        description: "Get a list of all projects"
      },
      {
        name: "Paginated list",
        uri: "project-list://all?page=1&limit=10",
        description: "First page of results with 10 items per page (default behavior)"
      }
    ],
    permissions: {
      required: true,
      scope: "project:list"
    },
    rateLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30      // 30 requests per minute
    },
    caching: {
      enabled: true,
      ttl: 60,            // Cache for 1 minute
      vary: ['page', 'limit'] // Vary cache by pagination params
    }
  };

  server.resource(
    "project-list",      // Resource name
    template,            // Resource template
    metadata,            // Resource metadata
    listProjects         // Handler function
  );
};