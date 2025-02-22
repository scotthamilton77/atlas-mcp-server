import { logger } from '../../../utils/logger.js';
import { updateProject as updateProjectDb, updateProjectsBulk } from '../../../neo4j/projectService.js';
import { UpdateProjectSchema, UpdateProjectInput } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, ProjectErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const updateProject = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = UpdateProjectSchema.parse(input) as UpdateProjectInput;
    
    if (validatedInput.mode === 'bulk') {
      // Bulk project updates
      logger.info("Updating multiple projects", { 
        count: validatedInput.projects.length,
        requestId: context.requestContext?.requestId 
      });

      try {
        const result = await updateProjectsBulk(validatedInput.projects);
        
        logger.info("Projects update completed", { 
          updatedCount: result.updated.length,
          notFoundCount: result.notFound.length,
          requestId: context.requestContext?.requestId 
        });

        if (result.notFound.length > 0) {
          logger.warn("Some projects were not found", {
            notFoundIds: result.notFound,
            requestId: context.requestContext?.requestId
          });
        }

        return createToolResponse(JSON.stringify({
          success: result.updated.length > 0,
          message: `Successfully updated ${result.updated.length} projects` + 
                  (result.notFound.length > 0 ? `. ${result.notFound.length} projects not found.` : ''),
          updated: result.updated,
          notFound: result.notFound
        }, null, 2));

      } catch (dbError: any) {
        // Handle duplicate name error
        if (dbError.message?.includes('duplicate')) {
          const duplicateName = validatedInput.projects.find(p => 
            p.updates.name && dbError.message.includes(p.updates.name)
          )?.updates.name;
          
          throw new McpError(
            ProjectErrorCode.DUPLICATE_NAME,
            `A project with this name already exists`,
            { name: duplicateName }
          );
        }

        throw dbError;
      }

    } else {
      // Single project update
      const { mode, id, updates } = validatedInput;
      
      logger.info("Updating project", { 
        id, 
        updates,
        requestId: context.requestContext?.requestId 
      });

      try {
        const project = await updateProjectDb(id, updates);
        
        if (!project) {
          logger.warn("Project not found for update", { 
            id,
            requestId: context.requestContext?.requestId 
          });
          throw new McpError(
            ProjectErrorCode.PROJECT_NOT_FOUND,
            `Project with ID ${id} not found`,
            { projectId: id }
          );
        }
        
        logger.info("Project updated successfully", { 
          id,
          requestId: context.requestContext?.requestId 
        });

        return createToolResponse(JSON.stringify(project, null, 2));
      } catch (dbError: any) {
        // Handle duplicate name error specifically
        if (dbError.message?.includes('duplicate') && updates.name) {
          throw new McpError(
            ProjectErrorCode.DUPLICATE_NAME,
            `A project with this name already exists`,
            { name: updates.name }
          );
        }

        // Handle invalid status error
        if (dbError.message?.includes('invalid status') && updates.status) {
          throw new McpError(
            ProjectErrorCode.INVALID_STATUS,
            `Invalid project status: ${updates.status}`,
            { status: updates.status }
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

    logger.error("Error updating project(s)", { 
      error, 
      input,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error updating project(s): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};