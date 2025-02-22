import { logger } from '../../../utils/logger.js';
import { listProjectDependencies } from '../../../neo4j/projectService.js';
import { ListDependenciesSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, ProjectErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const listDependencies = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = ListDependenciesSchema.parse(input);
    
    logger.info("Listing project dependencies", { 
      projectId: validatedInput.projectId,
      requestId: context.requestContext?.requestId 
    });

    try {
      const result = await listProjectDependencies(validatedInput.projectId);

      // If null is returned, the project doesn't exist
      if (!result) {
        throw new McpError(
          ProjectErrorCode.PROJECT_NOT_FOUND,
          `Project with ID ${validatedInput.projectId} not found`,
          { projectId: validatedInput.projectId }
        );
      }

      // Sort dependencies and dependents by type and creation date
      const sortedResult = {
        dependencies: result.dependencies.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type.localeCompare(b.type);
          }
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }),
        dependents: result.dependents.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type.localeCompare(b.type);
          }
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        })
      };

      logger.info("Dependencies listed successfully", { 
        projectId: validatedInput.projectId,
        dependencyCount: sortedResult.dependencies.length,
        dependentCount: sortedResult.dependents.length,
        requestId: context.requestContext?.requestId 
      });

      return createToolResponse(JSON.stringify(sortedResult, null, 2));
    } catch (dbError) {
      // If it's already an McpError, rethrow it
      if (dbError instanceof McpError) {
        throw dbError;
      }

      // Handle database-specific errors
      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        `Database error while listing dependencies: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`,
        { projectId: validatedInput.projectId }
      );
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error listing dependencies", { 
      error, 
      projectId: (input as any)?.projectId,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error listing dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { projectId: (input as any)?.projectId }
    );
  }
};