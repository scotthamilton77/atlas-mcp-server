import { TaskStatus } from '../../../types/task.js';
import { ToolFactory, ToolImplementation } from './shared/types.js';
import { formatResponse } from './shared/response-formatter.js';

/**
 * Task query tools implementation
 */

/**
 * Get tasks by status tool
 */
export const getTasksByStatusTool: ToolFactory = (context): ToolImplementation => ({
  definition: {
    name: 'get_tasks_by_status',
    description: `Find tasks with a specific execution status.

When to Use:
- Identifying work in progress
- Finding blocked tasks
- Verifying completed work
- Planning next actions

Best Practices:
- Check BLOCKED tasks for dependency issues
- Monitor IN_PROGRESS tasks for updates
- Review COMPLETED tasks for verification
- Use with path patterns for focused queries

Example:
{
  "status": "BLOCKED",
  "pathPattern": "project/backend/*",
  "reasoning": "Checking for blocked backend tasks to identify and resolve dependencies. This helps maintain project momentum by addressing bottlenecks early."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
          description: `Status to filter tasks by:
- PENDING: Not yet started tasks
- IN_PROGRESS: Active work items
- COMPLETED: Successfully finished tasks
- BLOCKED: Tasks waiting on dependencies
- CANCELLED: Discontinued tasks
Note: Returns all tasks in given status regardless of hierarchy`,
        },
        pathPattern: {
          type: 'string',
          description: `Optional glob pattern to focus search:
- Use * for single segment wildcard
- Use ** for recursive wildcard
- Examples:
  - project/* (direct children)
  - project/backend/** (all backend tasks)
  - */security/* (security tasks at any level)
Note: Combines with status filter for precise queries`,
        },
      },
      required: ['status'],
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const result = await context.taskManager.getTasksByStatus(args.status as TaskStatus);
    return formatResponse(result, context.logger);
  },
});

/**
 * Get tasks by path tool
 */
export const getTasksByPathTool: ToolFactory = (context): ToolImplementation => ({
  definition: {
    name: 'get_tasks_by_path',
    description: `Find tasks matching a path pattern.

When to Use:
- Analyzing specific project areas
- Reviewing component progress
- Planning related tasks
- Identifying gaps in coverage

Best Practices:
- Use specific patterns for focused results
- Include wildcards for broader searches
- Consider task hierarchy in patterns
- Combine with status checks for detailed analysis

Example:
{
  "pathPattern": "project/*/security/*",
  "reasoning": "Searching for all security-related tasks across project components to ensure comprehensive security coverage and identify any missing security considerations."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        pathPattern: {
          type: 'string',
          description: `Glob pattern for matching task paths:
- Use * for any segment
- Use ** for recursive matching
- Examples:
  - project/* (top-level tasks)
  - project/backend/** (all backend tasks)
  - */security/* (security tasks anywhere)`,
        },
      },
      required: ['pathPattern'],
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const result = await context.taskManager.listTasks(args.pathPattern as string);
    return formatResponse(result, context.logger);
  },
});

/**
 * Get child tasks tool
 */
export const getChildrenTool: ToolFactory = (context): ToolImplementation => ({
  definition: {
    name: 'get_children',
    description: `Get all immediate child tasks under a specific path.

When to Use:
- Understanding task breakdown
- Tracking milestone progress
- Planning next phase
- Identifying missing subtasks

Best Practices:
- Check milestone children for coverage
- Verify subtask relationships
- Monitor child task status
- Ensure logical task grouping

Example:
{
  "path": "project/backend",
  "reasoning": "Examining backend tasks to understand implementation progress, identify gaps in functionality, and ensure proper task decomposition."
}`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Parent task path to get children from',
        },
      },
      required: ['path'],
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const result = await context.taskManager.getChildren(args.path as string);
    return formatResponse(result, context.logger);
  },
});
