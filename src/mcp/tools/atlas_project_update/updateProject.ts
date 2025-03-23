import { ProjectService } from '../../../services/neo4j/projectService.js';
import { BaseErrorCode, McpError, ProjectErrorCode } from '../../../types/errors.js';
import { logger } from '../../../utils/logger.js';
import { ToolContext } from '../../../utils/security.js';
import { AtlasProjectUpdateInput, AtlasProjectUpdateSchema } from './types.js';
import { formatProjectUpdateResponse } from './responseFormat.js';

export const atlasUpdateProject = async (
  input: unknown,
  context: ToolContext
) => {
  let validatedInput: AtlasProjectUpdateInput | undefined;
  
  try {
    // Validate and store input
    validatedInput = AtlasProjectUpdateSchema.parse(input);
    
    // Handle single vs bulk project updates based on mode
    if (validatedInput.mode === 'bulk') {
      // Bulk updates
      logger.info("Updating multiple projects", { 
        count: validatedInput.projects.length,
        requestId: context.requestContext?.requestId 
      });

      const results = {
        success: true,
        message: `Successfully updated ${validatedInput.projects.length} projects`,
        updated: [] as any[],
        errors: [] as any[]
      };

      // Process each project update sequentially
      for (let i = 0; i < validatedInput.projects.length; i++) {
        const projectUpdate = validatedInput.projects[i];
        try {
          // First check if project exists
          const projectExists = await ProjectService.getProjectById(projectUpdate.id);
          
          if (!projectExists) {
            throw new McpError(
              ProjectErrorCode.PROJECT_NOT_FOUND,
              `Project with ID ${projectUpdate.id} not found`
            );
          }
          
          // Update the project
          const updatedProject = await ProjectService.updateProject(
            projectUpdate.id,
            projectUpdate.updates
          );
          
          results.updated.push(updatedProject);
        } catch (error) {
          results.success = false;
          results.errors.push({
            index: i,
            project: projectUpdate,
            error: {
              code: error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
              message: error instanceof Error ? error.message : 'Unknown error',
              details: error instanceof McpError ? error.details : undefined
            }
          });
        }
      }
      
      if (results.errors.length > 0) {
        results.message = `Updated ${results.updated.length} of ${validatedInput.projects.length} projects with ${results.errors.length} errors`;
      }
      
      logger.info("Bulk project update completed", { 
        successCount: results.updated.length,
        errorCount: results.errors.length,
        projectIds: results.updated.map(p => p.id),
        requestId: context.requestContext?.requestId 
      });

      // Use the formatter to create the response
      return formatProjectUpdateResponse(results);

    } else {
      // Single project update
      const { mode, id, updates } = validatedInput;
      
      logger.info("Updating project", { 
        id, 
        fields: Object.keys(updates),
        requestId: context.requestContext?.requestId 
      });

      // First check if project exists
      const projectExists = await ProjectService.getProjectById(id);
      
      if (!projectExists) {
        throw new McpError(
          ProjectErrorCode.PROJECT_NOT_FOUND,
          `Project with ID ${id} not found`
        );
      }
      
      // Update the project
      const updatedProject = await ProjectService.updateProject(id, updates);
      
      logger.info("Project updated successfully", { 
        projectId: id,
        requestId: context.requestContext?.requestId 
      });

      // Use the formatter to create the response
      return formatProjectUpdateResponse(updatedProject);
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error updating project(s)", { 
      error,
      requestId: context.requestContext?.requestId 
    });

    // Handle not found error specifically
    if (error instanceof Error && error.message.includes('not found')) {
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project not found: ${error.message}`
      );
    }

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error updating project(s): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};
