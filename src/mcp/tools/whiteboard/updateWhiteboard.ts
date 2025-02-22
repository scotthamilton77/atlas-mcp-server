import { logger } from '../../../utils/logger.js';
import { updateWhiteboard as updateWhiteboardDb } from '../../../neo4j/whiteboardService.js';
import { UpdateWhiteboardSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const updateWhiteboard = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = UpdateWhiteboardSchema.parse(input);
    
    logger.info("Updating whiteboard", { 
      id: validatedInput.id,
      merge: validatedInput.merge,
      requestId: context.requestContext?.requestId 
    });

    const whiteboard = await updateWhiteboardDb(
      validatedInput.id,
      validatedInput.data,
      validatedInput.merge
    );
    
    logger.info("Whiteboard updated successfully", { 
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

    logger.error("Error updating whiteboard", { 
      error, 
      id: (input as any)?.id,
      requestId: context.requestContext?.requestId 
    });

    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error updating whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { id: (input as any)?.id }
    );
  }
};