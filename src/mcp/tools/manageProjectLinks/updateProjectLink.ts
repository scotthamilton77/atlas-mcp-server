import { logger } from '../../../utils/logger.js';
import { updateProjectLink as updateProjectLinkDb, updateProjectLinksBulk } from '../../../neo4j/projectService.js';
import { UpdateProjectLinkSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, LinkErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

const validateUrl = (url: string): void => {
  try {
    new URL(url);
  } catch {
    throw new McpError(
      LinkErrorCode.INVALID_URL,
      `Invalid URL format: ${url}`,
      { url }
    );
  }
};

export const updateProjectLink = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = UpdateProjectLinkSchema.parse(input);
    
    if (validatedInput.mode === 'bulk') {
      // Bulk update
      logger.info("Updating multiple project links", { 
        count: validatedInput.links.length,
        linkIds: validatedInput.links.map(l => l.linkId),
        requestId: context.requestContext?.requestId 
      });

      try {
        // Validate URLs if provided in updates
        validatedInput.links.forEach(link => {
          if (link.updates.url) {
            validateUrl(link.updates.url);
          }
        });

        const result = await updateProjectLinksBulk(validatedInput.links);
        
        logger.info("Links updated successfully", { 
          updatedCount: result.updated.length,
          notFoundCount: result.notFound.length,
          requestId: context.requestContext?.requestId 
        });

        if (result.notFound.length > 0) {
          logger.warn("Some links were not found", {
            notFoundIds: result.notFound,
            requestId: context.requestContext?.requestId
          });
        }

        return createToolResponse(JSON.stringify({
          success: true,
          message: `Successfully updated ${result.updated.length} links` + 
                  (result.notFound.length > 0 ? `. ${result.notFound.length} links not found.` : ''),
          updated: result.updated,
          notFound: result.notFound
        }, null, 2));

      } catch (dbError) {
        if (dbError instanceof McpError) {
          throw dbError;
        }

        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Database error while updating links: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
        );
      }

    } else {
      // Single update
      const { mode, linkId, updates } = validatedInput;
      
      logger.info("Updating project link", { 
        linkId,
        updates,
        requestId: context.requestContext?.requestId 
      });

      try {
        // Validate URL if provided in updates
        if (updates.url) {
          validateUrl(updates.url);
        }

        const link = await updateProjectLinkDb(linkId, updates);
        
        if (!link) {
          logger.warn("Link not found for update", { 
            linkId,
            requestId: context.requestContext?.requestId 
          });
          throw new McpError(
            LinkErrorCode.LINK_NOT_FOUND,
            `Link with ID ${linkId} not found`,
            { linkId }
          );
        }

        logger.info("Link updated successfully", { 
          linkId,
          requestId: context.requestContext?.requestId 
        });

        return createToolResponse(JSON.stringify(link, null, 2));
      } catch (dbError) {
        if (dbError instanceof McpError) {
          throw dbError;
        }

        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Database error while updating link: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`,
          { linkId }
        );
      }
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error updating project link(s)", { 
      error, 
      input,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error updating project link(s): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};