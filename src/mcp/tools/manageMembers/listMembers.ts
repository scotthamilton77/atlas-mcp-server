import { logger } from '../../../utils/logger.js';
import { listProjectMembers } from '../../../neo4j/projectService.js';
import { ListMembersSchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, ProjectErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const listMembers = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = ListMembersSchema.parse(input);
    
    logger.info("Listing project members", { 
      projectId: validatedInput.projectId,
      requestId: context.requestContext?.requestId 
    });

    try {
      const members = await listProjectMembers(validatedInput.projectId);

      // If no members are found, the project might not exist
      if (!members) {
        throw new McpError(
          ProjectErrorCode.PROJECT_NOT_FOUND,
          `Project with ID ${validatedInput.projectId} not found`,
          { projectId: validatedInput.projectId }
        );
      }

      logger.info("Members listed successfully", { 
        projectId: validatedInput.projectId,
        memberCount: members.length,
        requestId: context.requestContext?.requestId 
      });

      // Sort members by role (owners first) and then by join date
      const sortedMembers = members.sort((a, b) => {
        if (a.role === 'owner' && b.role !== 'owner') return -1;
        if (a.role !== 'owner' && b.role === 'owner') return 1;
        return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
      });

      return createToolResponse(JSON.stringify(sortedMembers, null, 2));
    } catch (dbError) {
      // Convert database errors to McpError
      if (dbError instanceof Error) {
        if (dbError.message.includes('project not found')) {
          throw new McpError(
            ProjectErrorCode.PROJECT_NOT_FOUND,
            `Project with ID ${validatedInput.projectId} not found`,
            { projectId: validatedInput.projectId }
          );
        }
      }
      
      // If no specific error matched, throw a generic error
      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        `Database error while listing members: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
      );
    }
  } catch (error) {
    if (error instanceof McpError) {
      return error.toResponse();
    }
    
    // Convert any other errors to McpError response
    const mcpError = new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error listing project members: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return mcpError.toResponse();
  }
};