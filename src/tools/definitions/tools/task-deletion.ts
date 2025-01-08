import { ToolFactory, ToolImplementation } from './shared/types.js';
import { formatResponse } from './shared/response-formatter.js';

/**
 * Delete task tool implementation
 */
export const deleteTaskTool: ToolFactory = (context): ToolImplementation => ({
  definition: {
    name: 'delete_task',
    description: `Remove a task and its children from the system. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Task Removal
   - Delete specified task
   - Remove child tasks
   - Update dependencies
   - Clean up relationships

VALIDATION RULES:
1. Path Requirements
   - Must exist in system
   - Must be deletable
   - Cannot have blockers
   - Parent must allow deletion

2. Dependency Rules
   - All dependents updated
   - References removed
   - Cycles prevented
   - Graph maintained

EXAMPLE:

We have a deprecated authentication implementation at "project/backend/deprecated-auth" that needs to be removed:
{
  "path": "project/backend/deprecated-auth",
  "reasoning": "Removing deprecated JWT authentication implementation. New OAuth2 implementation is now active at project/backend/oauth2. All dependent tasks have been updated to reference the new implementation path."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: `Task path to delete. VALIDATION:
- Must exist in system
- Will remove all child tasks
- Updates dependent tasks
- Operation cannot be undone`,
        },
        strategy: {
          type: 'string',
          enum: ['cascade', 'orphan', 'block'],
          default: 'block',
          description: `Strategy for handling child tasks:
- cascade: Delete all child tasks recursively
- orphan: Remove parent reference from child tasks
- block: Prevent deletion if task has children`,
        },
        reasoning: {
          type: 'string',
          description: `Deletion justification. REQUIRED INFORMATION:
- Why task is obsolete
- Impact on dependencies
- Replacement references
- Migration details`,
        },
      },
      required: ['path'],
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const { path, strategy = 'block' } = args;
    const result = await context.taskManager.deleteTask(
      path as string,
      strategy as 'cascade' | 'orphan' | 'block'
    );
    return formatResponse(
      {
        success: true,
        data: {
          path,
          strategy,
          deleted: result.deleted,
          orphaned: result.orphaned,
          blocked: result.blocked,
          message: `Task deletion completed. ${result.deleted.length} tasks deleted, ${result.orphaned.length} tasks orphaned, ${result.blocked.length} tasks blocked.`,
        },
      },
      context.logger
    );
  },
});
