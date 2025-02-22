import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectDetails } from './getProjectDetails.js';
import { ProjectDetailsParamsSchema, ProjectDetailsQuerySchema } from './types.js';

export const registerProjectDetailsResource = (server: McpServer) => {
  // Create resource template with parameter completion
  const template = new ResourceTemplate(
    "project://{projectId}",
    {
      list: undefined, // No list completion for project IDs
      complete: {
        projectId: async () => {
          // Could implement project ID completion here if needed
          return [];
        }
      }
    }
  );

  // Define resource metadata
  const metadata = {
    name: "Project Details",
    description: "Fetches detailed information about a specific project. " +
                "Supports including related data like notes, links, dependencies, and members.",
    mimeType: "application/json",
    uriParamsSchema: ProjectDetailsParamsSchema,
    querySchema: ProjectDetailsQuerySchema,
    examples: [
      {
        name: "Basic project details",
        uri: "project://proj_123",
        description: "Get basic details for a project"
      },
      {
        name: "Project with notes and links",
        uri: "project://proj_123?include=notes&include=links",
        description: "Get project details including recent notes and links"
      },
      {
        name: "Project with all related data",
        uri: "project://proj_123?include=notes&include=links&include=dependencies&include=members",
        description: "Get project details with all related information"
      },
      {
        name: "Specific version",
        uri: "project://proj_123?version=2024-02",
        description: "Get project details for a specific version"
      }
    ],
    permissions: {
      required: true,
      scope: "project:read"
    },
    rateLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60      // 60 requests per minute
    },
    caching: {
      enabled: true,
      ttl: 300,           // Cache for 5 minutes
      vary: ['include']   // Vary cache by include parameter
    }
  };

  // Register the resource
  server.resource(
    "project-details",    // Resource name
    template,            // URI template
    metadata,            // Resource metadata
    getProjectDetails    // Handler function
  );
};