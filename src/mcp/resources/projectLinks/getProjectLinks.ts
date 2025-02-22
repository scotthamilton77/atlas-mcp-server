import { logger } from '../../../utils/logger.js';
import { getProjectLinks as getProjectLinksDb, getProjectById } from '../../../neo4j/projectService.js';
import { 
  ProjectLinksResourceResponse, 
  ProjectLinksParamsSchema,
  ProjectLinksQuerySchema,
  ProjectLinksResourceData
} from './types.js';
import { McpError, BaseErrorCode, ProjectErrorCode } from '../../../types/errors.js';

export const getProjectLinks = async (
  uri: URL,
  variables: Record<string, unknown>
): Promise<ProjectLinksResourceResponse> => {
  try {
    // Validate URI parameters
    const validatedParams = ProjectLinksParamsSchema.parse(variables);
    
    // Parse and validate query parameters
    const queryParams: Record<string, string | number> = {};
    uri.searchParams.forEach((value, key) => {
      if (key === 'limit') {
        queryParams[key] = parseInt(value, 10);
      } else {
        queryParams[key] = value;
      }
    });

    const validatedQuery = ProjectLinksQuerySchema.parse(queryParams);

    logger.info("Getting project links", { 
      projectId: validatedParams.projectId,
      query: validatedQuery,
      uri: uri.href
    });

    // First verify the project exists
    const project = await getProjectById(validatedParams.projectId);
    if (!project) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project with ID ${validatedParams.projectId} not found`,
        { projectId: validatedParams.projectId }
      );
    }

    // Get all links for the project
    const allLinks = await getProjectLinksDb(validatedParams.projectId);

    // Apply filtering
    let filteredLinks = allLinks;
    
    if (validatedQuery.category) {
      filteredLinks = filteredLinks.filter(link => 
        link.category === validatedQuery.category
      );
    }

    if (validatedQuery.search) {
      const searchTerm = validatedQuery.search.toLowerCase();
      filteredLinks = filteredLinks.filter(link => 
        link.title.toLowerCase().includes(searchTerm) ||
        link.description?.toLowerCase().includes(searchTerm)
      );
    }

    // Apply sorting
    const sortOrder = validatedQuery.sortOrder === 'desc' ? -1 : 1;
    filteredLinks.sort((a, b) => {
      switch (validatedQuery.sortBy) {
        case 'title':
          return sortOrder * a.title.localeCompare(b.title);
        case 'createdAt':
          return sortOrder * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        case 'updatedAt':
          return sortOrder * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
        default:
          return 0;
      }
    });

    // Apply limit
    const limitedLinks = filteredLinks.slice(0, validatedQuery.limit);

    // Collect metadata
    const allCategories = Array.from(new Set(
      allLinks
        .map(link => link.category)
        .filter((category): category is string => category !== undefined && category !== null)
    )).sort();

    const allDomains = Array.from(new Set(
      allLinks
        .map(link => {
          try {
            return new URL(link.url).hostname;
          } catch {
            return null;
          }
        })
        .filter((domain): domain is string => domain !== null)
    )).sort();

    const timestamps = allLinks.map(link => new Date(link.createdAt).getTime());
    const oldestLink = timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : undefined;
    const newestLink = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : undefined;

    // Format the resource data
    const resourceData: ProjectLinksResourceData = {
      links: {
        items: limitedLinks,
        total: allLinks.length,
        filtered: filteredLinks.length
      },
      metadata: {
        projectId: validatedParams.projectId,
        categories: allCategories.length > 0 ? allCategories : undefined,
        domains: allDomains.length > 0 ? allDomains : undefined,
        oldestLink,
        newestLink
      },
      query: {
        category: validatedQuery.category,
        search: validatedQuery.search,
        sortBy: validatedQuery.sortBy,
        sortOrder: validatedQuery.sortOrder,
        limit: validatedQuery.limit
      },
      fetchedAt: new Date().toISOString()
    };

    logger.info("Project links retrieved successfully", { 
      projectId: validatedParams.projectId,
      total: allLinks.length,
      filtered: filteredLinks.length,
      returned: limitedLinks.length
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

    logger.error("Error getting project links", { 
      error: error instanceof Error ? error.message : 'Unknown error',
      projectId: variables.projectId,
      uri: uri.href
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error getting project links: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { projectId: variables.projectId }
    );
  }
};