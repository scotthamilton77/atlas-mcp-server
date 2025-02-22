import { logger } from '../../../utils/logger.js';
import { createWhiteboard as createWhiteboardDb } from '../../../neo4j/whiteboardService.js';
import { CreateWhiteboardSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const createWhiteboard = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = CreateWhiteboardSchema.parse(input);
    
    logger.info("Creating new whiteboard", { 
      id: validatedInput.id,
      requestId: context.requestContext?.requestId 
    });

    const whiteboard = await createWhiteboardDb(
      validatedInput.id,
      validatedInput.data,
      validatedInput.projectId
    );
    
    logger.info("Whiteboard created successfully", { 
      id: whiteboard.id,
      requestId: context.requestContext?.requestId 
    });

    return createToolResponse(JSON.stringify(whiteboard, null, 2));
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error creating whiteboard", { 
      error, 
      id: (input as any)?.id,
      requestId: context.requestContext?.requestId 
    });

    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error creating whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { id: (input as any)?.id }
    );
  }
};