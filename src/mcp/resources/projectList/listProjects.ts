import { logger } from '../../../utils/logger.js';
import { listProjects as listProjectsDb, ListProjectsOptions } from '../../../neo4j/projectService.js';
import { ProjectListResponse, ProjectListQuery, ProjectListQuerySchema } from './types.js';
import { McpError, BaseErrorCode } from '../../../types/errors.js';

export const listProjects = async (uri: URL): Promise<ProjectListResponse> => {
  try {
    // Parse and validate query parameters
    const queryParams: Record<string, string> = {};
    uri.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    logger.info("Raw query parameters", { 
      queryParams,
      uri: uri.href
    });

    let validatedQuery: ProjectListQuery;
    try {
      validatedQuery = ProjectListQuerySchema.parse(queryParams);
    } catch (validationError) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        'Invalid query parameters',
        { error: validationError instanceof Error ? validationError.message : 'Unknown validation error' }
      );
    }

    logger.info("Validated query parameters", { 
      validatedQuery,
      uri: uri.href
    });

    // Prepare database query options
    const options: ListProjectsOptions = {
      page: validatedQuery.page || 1,
      limit: Math.min(validatedQuery.limit || 10, 100)
    };

    logger.info("Database query options", { 
      page: options.page,
      limit: options.limit
    });

    // Get projects from database with pagination
    const result = await listProjectsDb(options);

    logger.info("Database query result", { 
      resultItems: result.items,
      resultTotal: result.total,
      resultPage: result.page,
      resultLimit: result.limit,
      itemCount: result.items.length
    });

    // Prepare response data
    const data = {
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit
    };

    logger.info("Final response data", { 
      data,
      itemCount: data.items.length,
      total: data.total
    });

    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(data, null, 2),
        mimeType: "application/json"
      }],
      _type: "resource_response"
    };
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error listing projects", { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      uri: uri.href
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error listing projects: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};