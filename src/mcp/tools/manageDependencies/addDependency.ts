import { logger } from '../../../utils/logger.js';
import { addDependency as addDependencyDb, addDependenciesBulk } from '../../../neo4j/projectService.js';
import { AddDependencySchema } from './types.js';
import { createToolResponse } from '../../../types/mcp.js';
import { McpError, BaseErrorCode, ProjectErrorCode } from '../../../types/errors.js';
import { ToolContext } from '../../../utils/security.js';
import { generateCustomId } from '../../../utils/idGenerator.js';

export const addDependency = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Validate input
    const validatedInput = AddDependencySchema.parse(input);
    
    if (validatedInput.mode === 'bulk') {
      // Bulk dependency creation
      logger.info("Adding multiple dependencies", { 
        count: validatedInput.dependencies.length,
        requestId: context.requestContext?.requestId 
      });

      try {
        const result = await addDependenciesBulk(
          validatedInput.dependencies.map(dep => ({
            ...dep,
            customId: generateCustomId('DEPENDENCY'),
            description: dep.description
          }))
        );

        logger.info("Dependencies creation completed", { 
          createdCount: result.created.length,
          errorCount: result.errors.length,
          requestId: context.requestContext?.requestId 
        });

        if (result.errors.length > 0) {
          logger.warn("Some dependencies could not be created", {
            errors: result.errors,
            requestId: context.requestContext?.requestId
          });
        }

        return createToolResponse(JSON.stringify({
          success: result.created.length > 0,
          message: `Successfully created ${result.created.length} dependencies` + 
                  (result.errors.length > 0 ? `. ${result.errors.length} dependencies failed.` : ''),
          created: result.created,
          errors: result.errors
        }, null, 2));

      } catch (dbError) {
        if (dbError instanceof McpError) {
          throw dbError;
        }

        throw new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Database error while creating dependencies: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
        );
      }

    } else {
      // Single dependency creation
      const { mode, ...dependencyData } = validatedInput;
      
      logger.info("Adding dependency between projects", { 
        sourceProjectId: dependencyData.sourceProjectId,
        targetProjectId: dependencyData.targetProjectId,
        type: dependencyData.type,
        requestId: context.requestContext?.requestId 
      });

      try {
        const { sourceProjectId, targetProjectId, type, description } = dependencyData;
        const dependency = await addDependencyDb(
          sourceProjectId,
          targetProjectId,
          {
            customId: generateCustomId('DEPENDENCY'),
            type,
            description
          }
        );

        logger.info("Dependency added successfully", { 
          dependencyId: dependency.id,
          sourceProjectId: dependency.sourceProjectId,
          targetProjectId: dependency.targetProjectId,
          requestId: context.requestContext?.requestId 
        });

        return createToolResponse(JSON.stringify(dependency, null, 2));
      } catch (dbError: any) {
        // Handle project not found errors
        if (dbError.message?.includes('source project not found')) {
          throw new McpError(
            ProjectErrorCode.PROJECT_NOT_FOUND,
            `Source project with ID ${dependencyData.sourceProjectId} not found`,
            { projectId: dependencyData.sourceProjectId }
          );
        }
        if (dbError.message?.includes('target project not found')) {
          throw new McpError(
            ProjectErrorCode.PROJECT_NOT_FOUND,
            `Target project with ID ${dependencyData.targetProjectId} not found`,
            { projectId: dependencyData.targetProjectId }
          );
        }

        // Handle dependency cycle error
        if (dbError.message?.includes('dependency cycle')) {
          throw new McpError(
            ProjectErrorCode.DEPENDENCY_CYCLE,
            `Adding this dependency would create a cycle`,
            { 
              sourceProjectId: dependencyData.sourceProjectId,
              targetProjectId: dependencyData.targetProjectId 
            }
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

    logger.error("Error adding dependency/dependencies", { 
      error, 
      input,
      requestId: context.requestContext?.requestId 
    });

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error adding dependency/dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};