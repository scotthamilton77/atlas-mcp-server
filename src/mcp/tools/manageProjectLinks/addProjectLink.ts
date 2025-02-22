import { logger } from '../../../utils/logger.js';
import { addProjectLink as addProjectLinkDb, addProjectLinksBulk } from '../../../neo4j/projectService.js';
import { AddProjectLinkSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, ProjectErrorCode, LinkErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';
import { generateCustomId } from '../../../utils/idGenerator.js';

export const addProjectLink = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = AddProjectLinkSchema.parse(input);
    
    if (validatedInput.mode === 'bulk') {
      // Bulk link creation
      logger.info("Adding multiple links to project", { 
        projectId: validatedInput.projectId,
        count: validatedInput.links.length,
        requestId: context.requestContext?.requestId 
      });

      try {
        const links = await addProjectLinksBulk(
          validatedInput.projectId,
          validatedInput.links.map(link => ({
            ...link,
            customId: generateCustomId('LINK')
          }))
        );

        logger.info("Links added successfully", { 
          projectId: validatedInput.projectId,
          count: links.length,
          linkIds: links.map(l => l.id),
          requestId: context.requestContext?.requestId 
        });

        return createToolResponse(JSON.stringify({
          success: true,
          message: `Successfully added ${links.length} links`,
          links
        }, null, 2));
      } catch (dbError: any) {
        // Handle project not found error
        if (dbError.message?.includes('not found')) {
          throw new McpError(
            ProjectErrorCode.PROJECT_NOT_FOUND,
            `Project with ID ${validatedInput.projectId} not found`,
            { projectId: validatedInput.projectId }
          );
        }

        // Handle invalid URL error
        if (dbError.message?.includes('invalid url')) {
          throw new McpError(
            LinkErrorCode.INVALID_URL,
            `One or more URLs are invalid`,
            { projectId: validatedInput.projectId }
          );
        }

        throw dbError;
      }
    } else {
      // Single link creation
      const { mode, ...linkData } = validatedInput;
      logger.info("Adding link to project", { 
        projectId: validatedInput.projectId,
        title: validatedInput.title,
        url: validatedInput.url,
        requestId: context.requestContext?.requestId 
      });

      try {
        const link = await addProjectLinkDb(linkData.projectId, {
          ...linkData,
          customId: generateCustomId('LINK')
        });

        logger.info("Link added successfully", { 
          projectId: validatedInput.projectId,
          linkId: link.id,
          requestId: context.requestContext?.requestId 
        });

        return createToolResponse(JSON.stringify(link, null, 2));
      } catch (dbError: any) {
        // Handle project not found error
        if (dbError.message?.includes('not found')) {
          throw new McpError(
            ProjectErrorCode.PROJECT_NOT_FOUND,
            `Project with ID ${validatedInput.projectId} not found`,
            { projectId: validatedInput.projectId }
          );
        }

        // Handle invalid URL error
        if (dbError.message?.includes('invalid url')) {
          throw new McpError(
            LinkErrorCode.INVALID_URL,
            `Invalid URL format: ${validatedInput.url}`,
            { url: validatedInput.url }
          );
        }

        throw dbError;
      }
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error adding link(s) to project", { 
      error, 
      input,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error adding link(s) to project: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};