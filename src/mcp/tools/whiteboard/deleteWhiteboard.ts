import { logger } from '../../../utils/logger.js';
import { deleteWhiteboard as deleteWhiteboardDb } from '../../../neo4j/whiteboardService.js';
import { DeleteWhiteboardSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const deleteWhiteboard = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = DeleteWhiteboardSchema.parse(input);
    
    logger.info("Deleting whiteboard", { 
      id: validatedInput.id,
      requestId: context.requestContext?.requestId 
    });

    await deleteWhiteboardDb(validatedInput.id);
    
    logger.info("Whiteboard deleted successfully", { 
      id: validatedInput.id,
      requestId: context.requestContext?.requestId 
    });

    return createToolResponse(
      JSON.stringify({ 
        success: true, 
        message: `Whiteboard '${validatedInput.id}' deleted successfully` 
      }, null, 2)
    );
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error deleting whiteboard", { 
      error, 
      id: (input as any)?.id,
      requestId: context.requestContext?.requestId 
    });

    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error deleting whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { id: (input as any)?.id }
    );
  }
};