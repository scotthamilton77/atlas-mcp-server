import { ProjectService } from "../../../services/neo4j/projectService.js";
import {
  BaseErrorCode,
  McpError,
  ProjectErrorCode,
} from "../../../types/errors.js";
import { ResponseFormat, createToolResponse } from "../../../types/mcp.js";
import { logger, requestContextService } from "../../../utils/index.js"; // Import requestContextService
import { ToolContext } from "../../../types/tool.js";
import { AtlasProjectDeleteInput, AtlasProjectDeleteSchema } from "./types.js";
import { formatProjectDeleteResponse } from "./responseFormat.js";

export const atlasDeleteProject = async (
  input: unknown,
  context: ToolContext,
) => {
  let validatedInput: AtlasProjectDeleteInput | undefined;
  const reqContext =
    context.requestContext ??
    requestContextService.createRequestContext({
      toolName: "atlasDeleteProject",
    });

  try {
    // Parse and validate input against schema definition
    validatedInput = AtlasProjectDeleteSchema.parse(input);

    // Select operation strategy based on request mode
    if (validatedInput.mode === "bulk") {
      // Process bulk removal operation
      const { projectIds } = validatedInput;

      logger.info("Initiating batch project removal", {
        ...reqContext,
        count: projectIds.length,
        projectIds,
      });

      const results = {
        success: true,
        message: `Successfully removed ${projectIds.length} projects`,
        deleted: [] as string[],
        errors: [] as {
          projectId: string;
          error: {
            code: string;
            message: string;
            details?: any;
          };
        }[],
      };

      // Process removal operations sequentially to maintain data integrity
      for (const projectId of projectIds) {
        try {
          const deleted = await ProjectService.deleteProject(projectId);

          if (deleted) {
            results.deleted.push(projectId);
          } else {
            // Project not found
            results.success = false;
            results.errors.push({
              projectId,
              error: {
                code: ProjectErrorCode.PROJECT_NOT_FOUND,
                message: `Project with ID ${projectId} not found`,
              },
            });
          }
        } catch (error) {
          results.success = false;
          results.errors.push({
            projectId,
            error: {
              code:
                error instanceof McpError
                  ? error.code
                  : BaseErrorCode.INTERNAL_ERROR,
              message: error instanceof Error ? error.message : "Unknown error",
              details: error instanceof McpError ? error.details : undefined,
            },
          });
        }
      }

      if (results.errors.length > 0) {
        results.message = `Removed ${results.deleted.length} of ${projectIds.length} projects with ${results.errors.length} errors`;
      }

      logger.info("Batch removal operation completed", {
        ...reqContext,
        successCount: results.deleted.length,
        errorCount: results.errors.length,
      });

      // Conditionally format response
      if (validatedInput.responseFormat === ResponseFormat.JSON) {
        return createToolResponse(JSON.stringify(results, null, 2));
      } else {
        return formatProjectDeleteResponse(results);
      }
    } else {
      // Process single entity removal
      const { id } = validatedInput;

      logger.info("Removing project entity", {
        ...reqContext,
        projectId: id,
      });

      const deleted = await ProjectService.deleteProject(id);

      if (!deleted) {
        logger.warning("Target project not found for removal operation", {
          ...reqContext,
          projectId: id,
        });

        throw new McpError(
          ProjectErrorCode.PROJECT_NOT_FOUND,
          `Project with identifier ${id} not found`,
          { projectId: id },
        );
      }

      logger.info("Project successfully removed", {
        ...reqContext,
        projectId: id,
      });

      const result = {
        id,
        success: true,
        message: `Project with ID ${id} removed successfully`,
      };

      // Conditionally format response
      if (validatedInput.responseFormat === ResponseFormat.JSON) {
        return createToolResponse(JSON.stringify(result, null, 2));
      } else {
        return formatProjectDeleteResponse(result);
      }
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Project removal operation failed", error as Error, {
      ...reqContext,
      inputReceived: validatedInput ?? input,
    });

    // Translate unknown errors to structured McpError format
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to remove project(s): ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};
