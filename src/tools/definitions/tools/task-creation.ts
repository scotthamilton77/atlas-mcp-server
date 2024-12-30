import { TaskType } from '../../../types/task.js';
import { ToolFactory, ToolImplementation } from './shared/types.js';
import { formatResponse } from './shared/response-formatter.js';

/**
 * Create task tool implementation
 */
export const createTaskTool: ToolFactory = (context): ToolImplementation => ({
  definition: {
    name: 'create_task',
    description: `Create a new task in the hierarchical task system.

When to Use:
- Starting a new work item or project phase
- Breaking down complex tasks into subtasks
- Creating milestones for project organization

Best Practices:
- Use clear, descriptive paths that reflect task hierarchy
- Set appropriate task type (TASK for work items, MILESTONE for organization)
- Define dependencies to ensure proper execution order
- Include detailed metadata for better organization
- Document reasoning in metadata for decision tracking

Example:
{
  "path": "project/backend/auth",
  "title": "Implement JWT Authentication",
  "type": "TASK",
  "description": "Add JWT-based authentication system for API security",
  "dependencies": ["project/backend/database"],
  "metadata": {
    "priority": "high",
    "tags": ["security", "api"],
    "reasoning": "JWT authentication is required to secure API endpoints and enable user-specific functionality. This task depends on database setup to store user credentials and token information.",
    "technical_requirements": [
      "Use industry-standard JWT library",
      "Implement token refresh mechanism",
      "Add rate limiting for auth endpoints"
    ]
  }
}`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Hierarchical path (e.g., "project/backend/auth"). Use forward slashes to indicate task hierarchy.',
        },
        title: {
          type: 'string',
          description: 'Clear, action-oriented title describing the task objective.',
        },
        description: {
          type: 'string',
          description:
            'Detailed explanation including context, requirements, and success criteria.',
        },
        type: {
          type: 'string',
          enum: ['TASK', 'MILESTONE'],
          description: 'TASK for concrete work items, MILESTONE for organizing related tasks.',
          default: 'TASK',
        },
        parentPath: {
          type: 'string',
          description: 'Path of parent task. Use for organizing subtasks under a milestone.',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Paths of tasks that must be completed first. Tasks will be blocked until dependencies are met.',
        },
        metadata: {
          type: 'object',
          description: `Additional task context and tracking information:
- priority: Task urgency (low/medium/high)
- tags: Keywords for categorization
- reasoning: Document decision rationale
- technical_requirements: Specific implementation needs
- acceptance_criteria: Success validation points`,
        },
      },
      required: ['path', 'title'],
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const result = await context.taskManager.createTask({
      path: args.path as string,
      name: args.title as string,
      type: args.type ? ((args.type as string).toUpperCase() as TaskType) : TaskType.TASK,
      description: args.description as string | undefined,
      dependencies: Array.isArray(args.dependencies) ? (args.dependencies as string[]) : [],
      metadata: (args.metadata as Record<string, unknown>) || {},
      statusMetadata: {},
      notes: [],
    });
    return formatResponse(result, context.logger);
  },
});
