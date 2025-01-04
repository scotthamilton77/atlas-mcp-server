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
    description: `Find all tasks in a specific execution state. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Status Filtering
   - Find tasks by current state
   - Filter by project area
   - Check progress status
   - Identify blockers

VALIDATION RULES:
1. Status Requirements
   - Must be valid status
   - Case sensitive
   - No partial matches
   - Returns empty if none found

2. Pattern Rules (Optional)
   - Valid glob syntax
   - Max depth respected
   - Case sensitive
   - Path format validated

EXAMPLE:

We need to find blocked tasks in the backend to resolve dependencies:
{
  "status": "BLOCKED",
  "pathPattern": "project/backend/*",
  "reasoning": "Identifying blocked backend tasks to unblock development progress"
}`,
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
          description: `Task status to find. VALIDATION:
PENDING: Not started, ready to begin
IN_PROGRESS: Currently being worked on
COMPLETED: Successfully finished
BLOCKED: Waiting on dependencies
CANCELLED: Work discontinued`,
        },
        pathPattern: {
          type: 'string',
          description: `Optional path filter. VALIDATION:
- * matches single segment
- ** matches multiple segments
- Must be valid path format
- Case sensitive matching`,
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
    description: `Find tasks matching a path pattern. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Path Matching
   - Find tasks by location
   - Use wildcards for patterns
   - Search project areas
   - Discover related tasks

VALIDATION RULES:
1. Pattern Requirements
   - Valid glob syntax
   - Max depth respected
   - Case sensitive
   - Path format validated

EXAMPLE:

We need to find all security-related tasks across components:
{
  "pathPattern": "project/*/security/*",
  "reasoning": "Locating security tasks to ensure consistent implementation"
}`,
    inputSchema: {
      type: 'object',
      properties: {
        pathPattern: {
          type: 'string',
          description: `Path pattern to match. VALIDATION:
- * for single segment
- ** for multiple segments
- Must be valid path format
- Case sensitive matching`,
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
    description: `Find all immediate child tasks under a path. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Child Discovery
   - Find subtasks
   - Check milestone progress
   - Verify task breakdown
   - Identify gaps

VALIDATION RULES:
1. Path Requirements
   - Must exist in system
   - Must be valid format
   - Case sensitive
   - Returns empty if none

EXAMPLE:

We need to check the backend implementation progress:
{
  "path": "project/backend",
  "reasoning": "Reviewing backend task progress to track milestone completion"
}`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: `Parent path to check. VALIDATION:
- Must exist in system
- Must be valid path format
- Case sensitive matching
- Returns immediate children only`,
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
