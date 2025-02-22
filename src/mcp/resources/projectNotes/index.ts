import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProjectNotes } from './getProjectNotes.js';
import { ProjectNotesParamsSchema, ProjectNotesQuerySchema } from './types.js';
import { listProjects } from '../../../neo4j/projectService.js';
import { extractProjectIds } from '../../../utils/projectHelpers.js';

export const registerProjectNotesResource = (server: McpServer) => {
  // Create resource template with parameter completion
  const template = new ResourceTemplate(
    "project://{projectId}/notes",
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
    name: "Project Notes",
    description: "Fetches notes associated with a specific project. Supports filtering by tags, " +
                "time range, and sorting options. Returns both note data and metadata about " +
                "tags and timestamps.",
    mimeType: "application/json",
    uriParamsSchema: ProjectNotesParamsSchema,
    querySchema: ProjectNotesQuerySchema,
    examples: [
      {
        name: "All notes",
        uri: "project://proj_123/notes",
        description: "Get all notes for a project"
      },
      {
        name: "Filter by tag",
        uri: "project://proj_123/notes?tag=important",
        description: "Get only notes tagged as important"
      },
      {
        name: "Time range",
        uri: "project://proj_123/notes?from=2025-01-01&to=2025-12-31",
        description: "Get notes within a specific date range"
      },
      {
        name: "Sorted notes",
        uri: "project://proj_123/notes?sortBy=timestamp&sortOrder=desc",
        description: "Get notes sorted by timestamp in descending order"
      }
    ],
    permissions: {
      required: true,
      scope: "project:notes:read"
    },
    rateLimit: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 60      // 60 requests per minute
    },
    caching: {
      enabled: true,
      ttl: 300,           // Cache for 5 minutes
      vary: ['tag', 'from', 'to', 'sortBy', 'sortOrder'] // Vary cache by all query params
    }
  };

  // Register the resource
  server.resource(
    "project-notes",      // Resource name
    template,            // URI template
    metadata,            // Resource metadata
    getProjectNotes      // Handler function
  );
};