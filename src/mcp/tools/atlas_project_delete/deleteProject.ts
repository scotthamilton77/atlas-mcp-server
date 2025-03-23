import { ProjectService } from '../../../services/neo4j/projectService.js';
import { BaseErrorCode, McpError, ProjectErrorCode } from '../../../types/errors.js';
import { logger } from '../../../utils/logger.js';
import { ToolContext } from '../../../utils/security.js';
import { AtlasProjectDeleteInput, AtlasProjectDeleteSchema } from './types.js';
import { formatProjectDeleteResponse } from './responseFormat.js';

export const atlasDeleteProject = async (
  input: unknown,
  context: ToolContext
) => {
  let validatedInput: AtlasProjectDeleteInput | undefined;
  
  try {
    // Validate and store input
    validatedInput = AtlasProjectDeleteSchema.parse(input);
    
    // Handle single vs bulk project deletion based on mode
    if (validatedInput.mode === 'bulk') {
      // Bulk deletion
      const { projectIds } = validatedInput;
      
      logger.info("Deleting multiple projects", { 
        count: projectIds.length,
        projectIds,
        requestId: context.requestContext?.requestId 
      });

      const results = {
        success: true,
        message: `Successfully deleted ${projectIds.length} projects`,
        deleted: [] as string[],
        errors: [] as { 
          projectId: string;
          error: {
            code: string;
            message: string;
            details?: any;
          };
        }[]
      };

      // Process each project deletion sequentially
      for (const projectId of projectIds) {
        try {
          const deleted = await ProjectService.deleteProject(projectId);
          
          if (deleted) {
            results.deleted.push(projectId);
          } else {
            // Project not found
            results.success = false;
            results.errors.push({
              projectId,
              error: {
                code: ProjectErrorCode.PROJECT_NOT_FOUND,
                message: `Project with ID ${projectId} not found`
              }
            });
          }
        } catch (error) {
          results.success = false;
          results.errors.push({
            projectId,
            error: {
              code: error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
              message: error instanceof Error ? error.message : 'Unknown error',
              details: error instanceof McpError ? error.details : undefined
            }
          });
        }
      }
      
      if (results.errors.length > 0) {
        results.message = `Deleted ${results.deleted.length} of ${projectIds.length} projects with ${results.errors.length} errors`;
      }
      
      logger.info("Bulk project deletion completed", { 
        successCount: results.deleted.length,
        errorCount: results.errors.length,
        requestId: context.requestContext?.requestId 
      });

      // Use the formatter to format the response
      return formatProjectDeleteResponse(results);

    } else {
      // Single project deletion
      const { id } = validatedInput;
      
      logger.info("Deleting project", { 
        projectId: id,
        requestId: context.requestContext?.requestId 
      });

      const deleted = await ProjectService.deleteProject(id);
      
      if (!deleted) {
        logger.warn("Project not found for deletion", { 
          projectId: id,
          requestId: context.requestContext?.requestId 
        });
        
        throw new McpError(
          ProjectErrorCode.PROJECT_NOT_FOUND,
          `Project with ID ${id} not found`,
          { projectId: id }
        );
      }
      
      logger.info("Project deleted successfully", { 
        projectId: id,
        requestId: context.requestContext?.requestId 
      });

      // Use the formatter to format the response
      return formatProjectDeleteResponse({
        id,
        success: true,
        message: `Project with ID ${id} deleted successfully`
      });
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error deleting project(s)", { 
      error,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error deleting project(s): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};
