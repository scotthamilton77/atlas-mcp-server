import { TaskService } from "../../../services/neo4j/taskService.js";
import { BaseErrorCode, McpError } from "../../../types/errors.js";
import { ResponseFormat, createToolResponse } from "../../../types/mcp.js";
import { logger, requestContextService } from "../../../utils/index.js"; // Import requestContextService
import { ToolContext } from "../../../types/tool.js";
import { AtlasTaskUpdateInput, AtlasTaskUpdateSchema } from "./types.js";
import { formatTaskUpdateResponse } from "./responseFormat.js";

export const atlasUpdateTask = async (input: unknown, context: ToolContext) => {
  let validatedInput: AtlasTaskUpdateInput | undefined;
  const reqContext =
    context.requestContext ??
    requestContextService.createRequestContext({ toolName: "atlasUpdateTask" });

  try {
    // Parse and validate the input against schema
    validatedInput = AtlasTaskUpdateSchema.parse(input);

    // Process according to operation mode (single or bulk)
    if (validatedInput.mode === "bulk") {
      // Execute bulk update operation
      logger.info("Applying updates to multiple tasks", {
        ...reqContext,
        count: validatedInput.tasks.length,
      });

      const results = {
        success: true,
        message: `Successfully updated ${validatedInput.tasks.length} tasks`,
        updated: [] as any[],
        errors: [] as any[],
      };

      // Process each task update sequentially to maintain data consistency
      for (let i = 0; i < validatedInput.tasks.length; i++) {
        const taskUpdate = validatedInput.tasks[i];
        try {
          // First check if task exists
          const taskExists = await TaskService.getTaskById(taskUpdate.id);

          if (!taskExists) {
            throw new McpError(
              BaseErrorCode.NOT_FOUND,
              `Task with ID ${taskUpdate.id} not found`,
            );
          }

          // Update the task
          const updatedTask = await TaskService.updateTask(
            taskUpdate.id,
            taskUpdate.updates,
          );

          results.updated.push(updatedTask);
        } catch (error) {
          results.success = false;
          results.errors.push({
            index: i,
            task: taskUpdate,
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
        results.message = `Updated ${results.updated.length} of ${validatedInput.tasks.length} tasks with ${results.errors.length} errors`;
      }

      logger.info("Bulk task modification completed", {
        ...reqContext,
        successCount: results.updated.length,
        errorCount: results.errors.length,
        taskIds: results.updated.map((t) => t.id),
      });

      // Conditionally format response
      if (validatedInput.responseFormat === ResponseFormat.JSON) {
        return createToolResponse(JSON.stringify(results, null, 2));
      } else {
        return formatTaskUpdateResponse(results);
      }
    } else {
      // Process single task modification
      const { mode, id, updates } = validatedInput;

      logger.info("Modifying task attributes", {
        ...reqContext,
        id,
        fields: Object.keys(updates),
      });

      // First check if task exists
      const taskExists = await TaskService.getTaskById(id);

      if (!taskExists) {
        throw new McpError(
          BaseErrorCode.NOT_FOUND,
          `Task with ID ${id} not found`,
        );
      }

      // Update the task
      const updatedTask = await TaskService.updateTask(id, updates);

      logger.info("Task modifications applied successfully", {
        ...reqContext,
        taskId: id,
      });

      // Conditionally format response
      if (validatedInput.responseFormat === ResponseFormat.JSON) {
        return createToolResponse(JSON.stringify(updatedTask, null, 2));
      } else {
        return formatTaskUpdateResponse(updatedTask);
      }
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Failed to modify task(s)", error as Error, {
      ...reqContext,
      inputReceived: validatedInput ?? input,
    });

    // Handle not found error specifically
    if (error instanceof Error && error.message.includes("not found")) {
      throw new McpError(
        BaseErrorCode.NOT_FOUND,
        `Task not found: ${error.message}`,
      );
    }

    // Convert generic errors to properly formatted McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to modify task(s): ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};
