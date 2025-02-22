import { logger } from '../../../utils/logger.js';
import { removeProjectMember, removeProjectMembersBulk } from '../../../neo4j/projectService.js';
import { RemoveMemberSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, MemberErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const removeMember = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = RemoveMemberSchema.parse(input);
    
    if (validatedInput.mode === 'bulk') {
      // Bulk removal
      logger.info("Removing multiple project members", { 
        count: validatedInput.memberIds.length,
        memberIds: validatedInput.memberIds,
        requestId: context.requestContext?.requestId 
      });

      try {
        const result = await removeProjectMembersBulk(validatedInput.memberIds);
        
        logger.info("Members removal completed", { 
          deletedCount: result.deletedCount,
          notFoundCount: result.notFoundIds.length,
          requestId: context.requestContext?.requestId 
        });

        if (result.notFoundIds.length > 0) {
          logger.warn("Some members were not found", {
            notFoundIds: result.notFoundIds,
            requestId: context.requestContext?.requestId
          });
        }

        return createToolResponse(JSON.stringify({
          success: result.success,
          message: `Successfully removed ${result.deletedCount} members` + 
                  (result.notFoundIds.length > 0 ? `. ${result.notFoundIds.length} members not found.` : ''),
          deletedCount: result.deletedCount,
          notFoundIds: result.notFoundIds
        }, null, 2));

      } catch (dbError) {
        if (dbError instanceof McpError) {
          throw dbError;
        }

        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Database error while removing members: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
        );
      }

    } else {
      // Single removal
      const { mode, memberId } = validatedInput;
      
      logger.info("Removing project member", { 
        memberId,
        requestId: context.requestContext?.requestId 
      });

      try {
        const success = await removeProjectMember(memberId);
        
        if (!success) {
          logger.warn("Member not found for removal", { 
            memberId,
            requestId: context.requestContext?.requestId 
          });
          throw new McpError(
            MemberErrorCode.MEMBER_NOT_FOUND,
            `Member with ID ${memberId} not found`,
            { memberId }
          );
        }

        logger.info("Member removed successfully", { 
          memberId,
          requestId: context.requestContext?.requestId 
        });

        return createToolResponse(JSON.stringify({
          success: true,
          message: `Member ${memberId} removed successfully`
        }, null, 2));
      } catch (dbError) {
        if (dbError instanceof McpError) {
          throw dbError;
        }

        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Database error while removing member: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`,
          { memberId }
        );
      }
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error removing project member(s)", { 
      error, 
      input,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error removing project member(s): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};