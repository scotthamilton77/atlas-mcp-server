import { logger } from '../../../utils/logger.js';
import { 
  removeDependency as removeDependencyDb, 
  removeDependenciesBulk,
  getDependencyDetails 
} from '../../../neo4j/projectService.js';
import { RemoveDependencySchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const removeDependency = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = RemoveDependencySchema.parse(input);
    
    if (validatedInput.mode === 'bulk') {
      // Bulk removal
      logger.info("Removing multiple dependencies", { 
        count: validatedInput.dependencyIds.length,
        dependencyIds: validatedInput.dependencyIds,
        requestId: context.requestContext?.requestId 
      });

      try {
        const result = await removeDependenciesBulk(validatedInput.dependencyIds);
        
        logger.info("Dependencies removal completed", { 
          deletedCount: result.deletedCount,
          notFoundCount: result.notFoundIds.length,
          requestId: context.requestContext?.requestId 
        });

        if (result.notFoundIds.length > 0) {
          logger.warn("Some dependencies were not found", {
            notFoundIds: result.notFoundIds,
            requestId: context.requestContext?.requestId
          });
        }

        return createToolResponse(JSON.stringify({
          success: result.success,
          message: `Successfully removed ${result.deletedCount} dependencies` + 
                  (result.notFoundIds.length > 0 ? `. ${result.notFoundIds.length} dependencies not found.` : ''),
          deletedCount: result.deletedCount,
          notFoundIds: result.notFoundIds
        }, null, 2));

      } catch (dbError) {
        if (dbError instanceof McpError) {
          throw dbError;
        }

        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Database error while removing dependencies: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
        );
      }

    } else {
      // Single removal
      const { dependencyId } = validatedInput;
      
      logger.info("Removing dependency", { 
        dependencyId,
        requestId: context.requestContext?.requestId 
      });

      try {
        // Get dependency details before removal
        const dependencyDetails = await getDependencyDetails(dependencyId);
        
        if (!dependencyDetails) {
          logger.info("Dependency not found", { 
            dependencyId,
            requestId: context.requestContext?.requestId 
          });
          
          return createToolResponse(JSON.stringify({
            success: true,
            message: `Dependency ${dependencyId} does not exist`,
            status: "not_found"
          }, null, 2));
        }

        const success = await removeDependencyDb(dependencyId);
        
        if (!success) {
          logger.warn("Dependency found but removal failed", { 
            dependencyId,
            details: dependencyDetails,
            requestId: context.requestContext?.requestId 
          });
          
          return createToolResponse(JSON.stringify({
            success: false,
            message: `Failed to remove dependency ${dependencyId}`,
            status: "error",
            details: dependencyDetails
          }, null, 2));
        }

        logger.info("Dependency removed successfully", { 
          dependencyId,
          requestId: context.requestContext?.requestId 
        });

        return createToolResponse(JSON.stringify({
          success: true,
          message: `Dependency ${dependencyId} removed successfully`,
          status: "removed",
          details: {
            id: dependencyDetails.id,
            type: dependencyDetails.type,
            sourceProject: dependencyDetails.sourceProject,
            targetProject: dependencyDetails.targetProject,
            description: dependencyDetails.description,
            createdAt: dependencyDetails.createdAt,
            removedAt: new Date().toISOString()
          }
        }, null, 2));
      } catch (dbError) {
        if (dbError instanceof McpError) {
          throw dbError;
        }

        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Error removing dependency: ${dbError instanceof Error ? dbError.message : 'Unknown error'} (This may indicate a database connection issue or transaction conflict)`,
          { dependencyId }
        );
      }
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error removing dependency/dependencies", { 
      error, 
      input,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Unexpected error while removing dependency/dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};