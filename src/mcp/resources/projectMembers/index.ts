import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectMembers } from './getProjectMembers.js';
import { ProjectMembersParamsSchema, ProjectMembersQuerySchema } from './types.js';
import { listProjects } from '../../../neo4j/projectService.js';
import { extractProjectIds } from '../../../utils/projectHelpers.js';

export const registerProjectMembersResource = (server: McpServer) => {
  // Create resource template with parameter completion
  const template = new ResourceTemplate(
    "project://{projectId}/members",
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
    name: "Project Members",
    description: "Lists all members of a project along with their roles and join dates. " +
                "Results are ordered by join date, with project owners listed first. " +
                "Supports filtering by role and user ID.",
    mimeType: "application/json",
    uriParamsSchema: ProjectMembersParamsSchema,
    querySchema: ProjectMembersQuerySchema,
    examples: [
      {
        name: "All members",
        uri: "project://proj_123/members",
        description: "Get all members of a project"
      },
      {
        name: "Filter by role",
        uri: "project://proj_123/members?role=admin",
        description: "Get only admin members"
      },
      {
        name: "Filter by user",
        uri: "project://proj_123/members?userId=user_456",
        description: "Get membership details for a specific user"
      },
      {
        name: "Sorted members",
        uri: "project://proj_123/members?sortBy=joinedAt&sortOrder=desc",
        description: "Get members sorted by join date in descending order"
      }
    ],
    permissions: {
      required: true,
      scope: "project:members:read"
    },
    rateLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60      // 60 requests per minute
    },
    caching: {
      enabled: true,
      ttl: 300,           // Cache for 5 minutes
      vary: ['role', 'userId', 'sortBy', 'sortOrder'] // Vary cache by all query params
    }
  };

  // Register the resource
  server.resource(
    "project-members",    // Resource name
    template,            // URI template
    metadata,            // Resource metadata
    getProjectMembers    // Handler function
  );
};