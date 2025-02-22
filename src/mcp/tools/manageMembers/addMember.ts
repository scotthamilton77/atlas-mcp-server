import { logger } from '../../../utils/logger.js';
import { addProjectMember, addProjectMembersBulk } from '../../../neo4j/projectService.js';
import { AddMemberSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, ProjectErrorCode, MemberErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';
import { handleOperationError, handleDatabaseError } from '../../../utils/errorHandler.js';
import { generateCustomId } from '../../../utils/idGenerator.js';

export const addMember = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = AddMemberSchema.parse(input);
    
    if (validatedInput.mode === 'bulk') {
      // Bulk member addition
      logger.info("Adding multiple members to project", { 
        projectId: validatedInput.projectId,
        count: validatedInput.members.length,
        requestId: context.requestContext?.requestId 
      });

      try {
        const result = await addProjectMembersBulk(
          validatedInput.projectId,
          validatedInput.members.map(member => ({
            ...member,
            customId: generateCustomId('MEMBER')
          }))
        );

        logger.info("Members added successfully", { 
          projectId: validatedInput.projectId,
          count: result.created.length,
          memberIds: result.created.map(m => m.id),
          requestId: context.requestContext?.requestId 
        });

        if (result.errors.length > 0) {
          logger.warn("Some members could not be added", {
            errors: result.errors,
            requestId: context.requestContext?.requestId
          });
        }

        return createToolResponse(JSON.stringify({
          success: result.created.length > 0,
          message: `Successfully added ${result.created.length} members` + 
                  (result.errors.length > 0 ? `. ${result.errors.length} members failed.` : ''),
          created: result.created,
          errors: result.errors
        }, null, 2));

      } catch (dbError) {
        if (dbError instanceof Error) {
          if (dbError.message.includes('project not found')) {
            throw new McpError(
              ProjectErrorCode.PROJECT_NOT_FOUND,
              `Project with ID ${validatedInput.projectId} not found`,
              { projectId: validatedInput.projectId }
            );
          }
        }
        
        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Database error while adding members: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
        );
      }

    } else {
      // Single member addition
      const { mode, projectId, userId, role } = validatedInput;
      
      logger.info("Adding member to project", { 
        projectId,
        userId,
        role,
        requestId: context.requestContext?.requestId 
      });

      try {
        const member = await addProjectMember(projectId, {
          customId: generateCustomId('MEMBER'),
          userId,
          role
        });

        logger.info("Member added successfully", { 
          projectId,
          memberId: member.id,
          userId,
          requestId: context.requestContext?.requestId 
        });

        return createToolResponse(JSON.stringify(member, null, 2));
      } catch (dbError) {
        // Convert database errors to McpError
        if (dbError instanceof Error) {
          if (dbError.message.includes('project not found')) {
            throw new McpError(
              ProjectErrorCode.PROJECT_NOT_FOUND,
              `Project with ID ${projectId} not found`,
              { projectId }
            );
          }
          if (dbError.message.includes('already a member')) {
            throw new McpError(
              MemberErrorCode.DUPLICATE_MEMBER,
              `User ${userId} is already a member of this project`,
              { projectId, userId }
            );
          }
          if (dbError.message.includes('invalid role')) {
            throw new McpError(
              MemberErrorCode.INVALID_ROLE,
              `Invalid role: ${role}`,
              { role }
            );
          }
        }
        
        // If no specific error matched, throw a generic error
        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Database error while adding member: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
        );
      }
    }
  } catch (error) {
    if (error instanceof McpError) {
      return error.toResponse();
    }
    
    // Convert any other errors to McpError response
    const mcpError = new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error adding member(s) to project: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return mcpError.toResponse();
  }
};