import { logger } from '../../../utils/logger.js';
import { getWhiteboard as getWhiteboardDb } from '../../../neo4j/whiteboardService.js';
import { GetWhiteboardSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const getWhiteboard = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = GetWhiteboardSchema.parse(input);
    
    logger.info("Retrieving whiteboard", { 
      id: validatedInput.id,
      version: validatedInput.version,
      requestId: context.requestContext?.requestId 
    });

    const whiteboard = await getWhiteboardDb(
      validatedInput.id,
      validatedInput.version
    );
    
    if (!whiteboard) {
      throw new McpError(
        BaseErrorCode.NOT_FOUND,
        `Whiteboard '${validatedInput.id}' not found${
          validatedInput.version ? ` at version ${validatedInput.version}` : ''
        }`
      );
    }

    logger.info("Whiteboard retrieved successfully", { 
      id: whiteboard.id,
      version: whiteboard.version,
      requestId: context.requestContext?.requestId 
    });

    return createToolResponse(JSON.stringify(whiteboard, null, 2));
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error retrieving whiteboard", { 
      error, 
      id: (input as any)?.id,
      requestId: context.requestContext?.requestId 
    });

    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error retrieving whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { id: (input as any)?.id }
    );
  }
};