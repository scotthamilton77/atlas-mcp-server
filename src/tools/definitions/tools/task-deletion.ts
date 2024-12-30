import { ToolFactory, ToolImplementation } from './shared/types.js';
import { formatResponse } from './shared/response-formatter.js';

/**
 * Delete task tool implementation
 */
export const deleteTaskTool: ToolFactory = (context): ToolImplementation => ({
  definition: {
    name: 'delete_task',
    description: `Remove a task and all its children from the system.

When to Use:
- Removing obsolete tasks
- Cleaning up completed work
- Restructuring project organization
- Handling cancelled features

Best Practices:
- Verify task is truly obsolete
- Check for dependent tasks
- Document deletion reasoning
- Consider archiving instead
- Handle child tasks appropriately

Example:
{
  "path": "project/backend/deprecated-auth",
  "reasoning": "Removing deprecated authentication implementation as we've switched to OAuth2. All dependent tasks have been updated to reference the new OAuth2 implementation path."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: `Path of task to delete. Will also remove all child tasks.
Note: This operation:
- Removes the specified task
- Removes all child tasks recursively
- Updates dependencies in related tasks
- Cannot be undone`,
        },
        reasoning: {
          type: 'string',
          description: `Explanation for task deletion. Best practices:
- Document why the task is no longer needed
- Explain impact on dependent tasks
- Note any replacement tasks
- Record archival location if applicable`,
        },
      },
      required: ['path'],
    },
  },
  handler: async (args: Record<string, unknown>) => {
    await context.taskManager.deleteTask(args.path as string);
    return formatResponse({ success: true }, context.logger);
  },
});
