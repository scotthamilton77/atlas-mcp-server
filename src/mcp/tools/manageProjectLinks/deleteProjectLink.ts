import { logger } from '../../../utils/logger.js';
import { deleteProjectLink as deleteProjectLinkDb, deleteProjectLinksBulk } from '../../../neo4j/projectService.js';
import { DeleteProjectLinkSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, LinkErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const deleteProjectLink = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = DeleteProjectLinkSchema.parse(input);
    
    if (validatedInput.mode === 'bulk') {
      // Bulk deletion
      logger.info("Deleting multiple project links", { 
        count: validatedInput.linkIds.length,
        linkIds: validatedInput.linkIds,
        requestId: context.requestContext?.requestId 
      });

      try {
        const result = await deleteProjectLinksBulk(validatedInput.linkIds);
        
        logger.info("Links deletion completed", { 
          deletedCount: result.deletedCount,
          notFoundCount: result.notFoundIds.length,
          requestId: context.requestContext?.requestId 
        });

        if (result.notFoundIds.length > 0) {
          logger.warn("Some links were not found", {
            notFoundIds: result.notFoundIds,
            requestId: context.requestContext?.requestId
          });
        }

        return createToolResponse(JSON.stringify({
          success: result.success,
          message: `Successfully deleted ${result.deletedCount} links` + 
                  (result.notFoundIds.length > 0 ? `. ${result.notFoundIds.length} links not found.` : ''),
          deletedCount: result.deletedCount,
          notFoundIds: result.notFoundIds
        }, null, 2));

      } catch (dbError) {
        if (dbError instanceof McpError) {
          throw dbError;
        }

        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Database error while deleting links: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
        );
      }

    } else {
      // Single deletion
      const { mode, linkId } = validatedInput;
      
      logger.info("Deleting project link", { 
        linkId,
        requestId: context.requestContext?.requestId 
      });

      try {
        const success = await deleteProjectLinkDb(linkId);
        
        if (!success) {
          logger.warn("Link not found for deletion", { 
            linkId,
            requestId: context.requestContext?.requestId 
          });
          throw new McpError(
            LinkErrorCode.LINK_NOT_FOUND,
            `Link with ID ${linkId} not found`,
            { linkId }
          );
        }

        logger.info("Link deleted successfully", { 
          linkId,
          requestId: context.requestContext?.requestId 
        });

        return createToolResponse(JSON.stringify({
          success: true,
          message: `Link ${linkId} deleted successfully`
        }, null, 2));
      } catch (dbError) {
        if (dbError instanceof McpError) {
          throw dbError;
        }

        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Database error while deleting link: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`,
          { linkId }
        );
      }
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error deleting project link(s)", { 
      error, 
      input,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error deleting project link(s): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};