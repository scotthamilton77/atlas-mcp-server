import { logger } from '../../../utils/logger.js';
import { createProject as createProjectDb, createProjectsBulk } from '../../../neo4j/projectService.js';
import { CreateProjectInput, CreateProjectSchema, ProjectInput } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, ProjectErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';

export const createProject = async (
  input: unknown,
  context: ToolContext
) => {
  let validatedInput: CreateProjectInput | undefined;
  
  try {
    // Validate and store input
    validatedInput = CreateProjectSchema.parse(input);
    
    // Handle single vs bulk project creation based on mode
    if (validatedInput.mode === 'bulk') {
      // Bulk creation
      logger.info("Creating multiple projects", { 
        count: validatedInput.projects.length,
        requestId: context.requestContext?.requestId 
      });

      const result = await createProjectsBulk(validatedInput.projects);
      
      logger.info("Bulk project creation completed", { 
        successCount: result.successes.length,
        errorCount: result.errors.length,
        projectIds: result.successes.map(p => p.id),
        requestId: context.requestContext?.requestId 
      });

      if (result.errors.length > 0) {
        logger.warn("Some projects failed to create", {
          errors: result.errors,
          requestId: context.requestContext?.requestId
        });
      }

      return createToolResponse(JSON.stringify({
        success: result.success,
        message: result.message,
        created: result.successes,
        errors: result.errors.map(error => ({
          index: error.index,
          project: error.item,
          error: {
            code: error.error.code,
            message: error.error.message,
            details: error.error.details
          }
        }))
      }, null, 2));

    } else {
      // Single project creation
      const { mode, ...projectInput } = validatedInput;
      
      logger.info("Creating new project", { 
        name: projectInput.name, 
        status: projectInput.status,
        requestId: context.requestContext?.requestId 
      });

      const project = await createProjectDb({
        name: projectInput.name,
        description: projectInput.description || "",
        status: projectInput.status
      });
      
      logger.info("Project created successfully", { 
        projectId: project.id,
        requestId: context.requestContext?.requestId 
      });

      return createToolResponse(JSON.stringify(project, null, 2));
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Error creating project(s)", { 
      error,
      requestId: context.requestContext?.requestId 
    });

    // Handle duplicate name error specifically
    if (error instanceof Error && error.message.includes('duplicate')) {
      throw new McpError(
        ProjectErrorCode.DUPLICATE_NAME,
        `A project with this name already exists`,
        { name: validatedInput?.mode === 'single' ? validatedInput?.name : validatedInput?.projects?.[0]?.name }
      );
    }

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error creating project(s): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};