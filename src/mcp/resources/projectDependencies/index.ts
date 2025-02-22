import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectDependencies } from './getProjectDependencies.js';
import { ProjectDependenciesParamsSchema, ProjectDependenciesQuerySchema } from './types.js';
import { listProjects } from '../../../neo4j/projectService.js';
import { extractProjectIds } from '../../../utils/projectHelpers.js';

export const registerProjectDependenciesResource = (server: McpServer) => {
  // Create resource template with parameter completion
  const template = new ResourceTemplate(
    "project://{projectId}/dependencies",
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
    name: "Project Dependencies",
    description: "Lists all dependencies and dependents for a project. Dependencies are projects that " +
                "this project depends on, while dependents are projects that depend on this project. " +
                "Results are grouped by relationship type.",
    mimeType: "application/json",
    uriParamsSchema: ProjectDependenciesParamsSchema,
    querySchema: ProjectDependenciesQuerySchema,
    examples: [
      {
        name: "All dependencies",
        uri: "project://proj_123/dependencies",
        description: "Get all dependencies and dependents for a project"
      },
      {
        name: "Filter by type",
        uri: "project://proj_123/dependencies?type=requires",
        description: "Get only 'requires' type dependencies"
      },
      {
        name: "Outbound dependencies",
        uri: "project://proj_123/dependencies?direction=outbound",
        description: "Get only dependencies (projects this project depends on)"
      },
      {
        name: "Inbound dependencies",
        uri: "project://proj_123/dependencies?direction=inbound",
        description: "Get only dependents (projects that depend on this project)"
      },
      {
        name: "Deep dependencies",
        uri: "project://proj_123/dependencies?depth=3",
        description: "Get dependencies up to 3 levels deep"
      },
      {
        name: "Sorted dependencies",
        uri: "project://proj_123/dependencies?sortBy=createdAt&sortOrder=desc",
        description: "Get dependencies sorted by creation date in descending order"
      },
      {
        name: "Combined filters",
        uri: "project://proj_123/dependencies?type=implements&direction=outbound&depth=2",
        description: "Get implementation dependencies up to 2 levels deep"
      }
    ],
    permissions: {
      required: true,
      scope: "project:dependencies:read"
    },
    rateLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30      // 30 requests per minute (lower due to potential complexity)
    },
    caching: {
      enabled: true,
      ttl: 300,           // Cache for 5 minutes
      vary: ['type', 'direction', 'depth', 'sortBy', 'sortOrder'] // Vary cache by all query params
    }
  };

  // Register the resource
  server.resource(
    "project-dependencies",  // Resource name
    template,               // URI template
    metadata,               // Resource metadata
    getProjectDependencies  // Handler function
  );
};