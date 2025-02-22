import { logger } from '../../../utils/logger.js';
import { deleteProject as deleteProjectDb, deleteProjectsBulk } from '../../../neo4j/projectService.js';
import { DeleteProjectSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, ProjectErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const deleteProject = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = DeleteProjectSchema.parse(input);
    
    if (validatedInput.mode === 'bulk') {
      // Bulk deletion
      logger.info("Deleting multiple projects", { 
        count: validatedInput.projectIds.length,
        projectIds: validatedInput.projectIds,
        requestId: context.requestContext?.requestId 
      });

      const result = await deleteProjectsBulk(validatedInput.projectIds);
      
      logger.info("Projects deletion completed", { 
        deletedCount: result.deletedCount,
        notFoundCount: result.notFoundIds.length,
        requestId: context.requestContext?.requestId 
      });

      if (result.notFoundIds.length > 0) {
        logger.warn("Some projects were not found", {
          notFoundIds: result.notFoundIds,
          requestId: context.requestContext?.requestId
        });
      }

      return createToolResponse(JSON.stringify({
        success: result.success,
        message: `Successfully deleted ${result.deletedCount} projects` + 
                (result.notFoundIds.length > 0 ? `. ${result.notFoundIds.length} projects not found.` : ''),
        deletedCount: result.deletedCount,
        notFoundIds: result.notFoundIds
      }, null, 2));

    } else {
      // Single project deletion
      const { mode, projectId } = validatedInput;
      
      logger.info("Deleting project", { 
        projectId,
        requestId: context.requestContext?.requestId 
      });

      const result = await deleteProjectDb(projectId);
      
      if (!result.success) {
        logger.warn("Project not found for deletion", { 
          projectId,
          requestId: context.requestContext?.requestId 
        });
        throw new McpError(
          ProjectErrorCode.PROJECT_NOT_FOUND,
          `Project with ID ${projectId} not found`,
          { projectId }
        );
      }
      
      logger.info("Project deleted successfully", { 
        projectId,
        requestId: context.requestContext?.requestId 
      });

      return createToolResponse(JSON.stringify({
        success: result.success,
        message: `Project ${projectId} deleted successfully` + 
                (result.relatedNodes ? 
                  `. Cleaned up: ${result.relatedNodes.noteCount} notes, ` +
                  `${result.relatedNodes.linkCount} links, ` +
                  `${result.relatedNodes.memberCount} members, ` +
                  `${result.relatedNodes.outgoingDepsCount} outgoing dependencies, ` +
                  `${result.relatedNodes.incomingDepsCount} incoming dependencies` : '')
      }, null, 2));
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error deleting project(s)", { 
      error, 
      input,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error deleting project(s): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};