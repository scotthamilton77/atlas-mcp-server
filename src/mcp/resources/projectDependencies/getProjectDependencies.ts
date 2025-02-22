import { logger } from '../../../utils/logger.js';
import { listProjectDependencies, getProjectById } from '../../../neo4j/projectService.js';
import { 
  ProjectDependenciesResourceResponse, 
  ProjectDependenciesParamsSchema,
  ProjectDependenciesQuerySchema,
  ProjectDependenciesResourceData
} from './types.js';
import { McpError, BaseErrorCode, ProjectErrorCode } from '../../../types/errors.js';

export const getProjectDependencies = async (
  uri: URL,
  variables: Record<string, unknown>
): Promise<ProjectDependenciesResourceResponse> => {
  try {
    // Validate URI parameters
    const validatedParams = ProjectDependenciesParamsSchema.parse(variables);
    
    // Parse and validate query parameters
    const queryParams: Record<string, string | number> = {};
    uri.searchParams.forEach((value, key) => {
      if (key === 'depth') {
        queryParams[key] = parseInt(value, 10);
      } else {
        queryParams[key] = value;
      }
    });

    const validatedQuery = ProjectDependenciesQuerySchema.parse(queryParams);

    logger.info("Getting project dependencies", { 
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

    // Get all dependencies for the project
    const { dependencies: allDependencies, dependents: allDependents } = 
      await listProjectDependencies(validatedParams.projectId);

    // Apply filtering
    let filteredDependencies = allDependencies;
    let filteredDependents = allDependents;
    
    if (validatedQuery.type) {
      filteredDependencies = filteredDependencies.filter(dep => 
        dep.type === validatedQuery.type
      );
      filteredDependents = filteredDependents.filter(dep => 
        dep.type === validatedQuery.type
      );
    }

    if (validatedQuery.direction === 'outbound') {
      filteredDependents = [];
    } else if (validatedQuery.direction === 'inbound') {
      filteredDependencies = [];
    }

    // Apply sorting
    const sortOrder = validatedQuery.sortOrder === 'desc' ? -1 : 1;
    const sortDependencies = (a: typeof allDependencies[0], b: typeof allDependencies[0]) => {
      switch (validatedQuery.sortBy) {
        case 'type':
          return sortOrder * a.type.localeCompare(b.type);
        case 'createdAt':
          return sortOrder * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        case 'updatedAt':
          return sortOrder * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
        default:
          return 0;
      }
    };

    filteredDependencies.sort(sortDependencies);
    filteredDependents.sort(sortDependencies);

    // Collect metadata
    const allTypes = Array.from(new Set([
      ...allDependencies.map(dep => dep.type),
      ...allDependents.map(dep => dep.type)
    ])).sort();

    const dependenciesByType = allDependencies.reduce((acc, dep) => {
      acc[dep.type] = (acc[dep.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const dependentsByType = allDependents.reduce((acc, dep) => {
      acc[dep.type] = (acc[dep.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const allTimestamps = [
      ...allDependencies.map(dep => new Date(dep.createdAt).getTime()),
      ...allDependents.map(dep => new Date(dep.createdAt).getTime())
    ];
    const oldestDependency = allTimestamps.length ? new Date(Math.min(...allTimestamps)).toISOString() : undefined;
    const newestDependency = allTimestamps.length ? new Date(Math.max(...allTimestamps)).toISOString() : undefined;

    // Check for cycles (simple check - could be more sophisticated)
    const cyclesDetected = allDependencies.some(dep => 
      allDependents.some(dependent => 
        dependent.sourceProjectId === dep.targetProjectId
      )
    );

    // Format the resource data
    const resourceData: ProjectDependenciesResourceData = {
      dependencies: {
        items: filteredDependencies,
        total: allDependencies.length,
        byType: Object.keys(dependenciesByType).length > 0 ? dependenciesByType : undefined
      },
      dependents: {
        items: filteredDependents,
        total: allDependents.length,
        byType: Object.keys(dependentsByType).length > 0 ? dependentsByType : undefined
      },
      metadata: {
        projectId: validatedParams.projectId,
        types: allTypes.length > 0 ? allTypes : undefined,
        cyclesDetected: cyclesDetected || undefined,
        maxDepth: validatedQuery.depth,
        oldestDependency,
        newestDependency
      },
      query: {
        type: validatedQuery.type,
        direction: validatedQuery.direction,
        depth: validatedQuery.depth,
        sortBy: validatedQuery.sortBy,
        sortOrder: validatedQuery.sortOrder
      },
      fetchedAt: new Date().toISOString()
    };

    logger.info("Project dependencies retrieved successfully", { 
      projectId: validatedParams.projectId,
      dependencies: allDependencies.length,
      dependents: allDependents.length,
      filtered: filteredDependencies.length + filteredDependents.length
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

    logger.error("Error getting project dependencies", { 
      error: error instanceof Error ? error.message : 'Unknown error',
      projectId: variables.projectId,
      uri: uri.href
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error getting project dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { projectId: variables.projectId }
    );
  }
};