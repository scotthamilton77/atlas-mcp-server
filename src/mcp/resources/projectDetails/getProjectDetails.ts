import { logger } from '../../../utils/logger.js';
import { 
  getProjectById, 
  getProjectNotes, 
  getProjectLinks, 
  listProjectDependencies, 
  listProjectMembers 
} from '../../../neo4j/projectService.js';
import { 
  ProjectDetailsResourceResponse, 
  ProjectDetailsHandler,
  ProjectDetailsParamsSchema,
  ProjectDetailsQuerySchema,
  ProjectDetailsResourceData
} from './types.js';
import { McpError, BaseErrorCode, ProjectErrorCode } from '../../../types/errors.js';

export const getProjectDetails: ProjectDetailsHandler = async (
  uri: URL,
  variables: Record<string, unknown>
): Promise<ProjectDetailsResourceResponse> => {
  try {
    // Validate URI parameters
    const validatedParams = ProjectDetailsParamsSchema.parse(variables);
    
    // Parse and validate query parameters
    const queryParams: Record<string, string | string[]> = {};
    uri.searchParams.forEach((value, key) => {
      const existing = queryParams[key];
      if (key === 'include') {
        queryParams[key] = existing ? 
          (Array.isArray(existing) ? [...existing, value] : [existing, value]) :
          [value];
      } else {
        queryParams[key] = value;
      }
    });

    const validatedQuery = ProjectDetailsQuerySchema.parse(queryParams);

    logger.info("Getting project details", { 
      projectId: validatedParams.projectId,
      include: validatedQuery.include,
      version: validatedQuery.version,
      uri: uri.href
    });

    // Get core project data
    const project = await getProjectById(validatedParams.projectId);
    if (!project) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${validatedParams.projectId} not found`,
        { projectId: validatedParams.projectId }
      );
    }

    // Initialize response data
    const resourceData: ProjectDetailsResourceData = {
      project,
      fetchedAt: new Date().toISOString()
    };

    // Add version if specified
    if (validatedQuery.version) {
      resourceData.version = validatedQuery.version;
    }

    // Add included data if requested
    if (validatedQuery.include?.length) {
      const included: ProjectDetailsResourceData['included'] = {};

      // Process each included data type in parallel
      await Promise.all(validatedQuery.include.map(async (type) => {
        try {
          switch (type) {
            case 'notes':
              const notes = await getProjectNotes(validatedParams.projectId);
              included.notes = {
                count: notes.length,
                latest: notes.slice(0, 5).map(note => ({
                  id: note.id,
                  text: note.text,
                  createdAt: new Date().toISOString() // Use current time as fallback
                }))
              };
              break;

            case 'links':
              const links = await getProjectLinks(validatedParams.projectId);
              included.links = {
                count: links.length,
                items: links.map(link => ({
                  id: link.id,
                  title: link.title,
                  url: link.url
                }))
              };
              break;

            case 'dependencies':
              const deps = await listProjectDependencies(validatedParams.projectId);
              included.dependencies = {
                inbound: deps.dependents.length,
                outbound: deps.dependencies.length
              };
              break;

            case 'members':
              const members = await listProjectMembers(validatedParams.projectId);
              const roleCount = members.reduce((acc, member) => {
                acc[member.role] = (acc[member.role] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              included.members = {
                count: members.length,
                roles: roleCount
              };
              break;
          }
        } catch (error) {
          logger.warn(`Error fetching included data type '${type}'`, { 
            error: error instanceof Error ? error.message : 'Unknown error',
            projectId: validatedParams.projectId 
          });
          // Don't fail the whole request if included data fails
        }
      }));

      if (Object.keys(included).length > 0) {
        resourceData.included = included;
      }
    }

    logger.info("Project details retrieved successfully", { 
      projectId: validatedParams.projectId,
      includedData: validatedQuery.include
    });

    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(resourceData, null, 2),
        mimeType: "application/json"
      }],
      _type: "resource_response"
    };
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error getting project details", { 
      error: error instanceof Error ? error.message : 'Unknown error',
      projectId: variables.projectId,
      uri: uri.href
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error getting project details: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { projectId: variables.projectId }
    );
  }
};