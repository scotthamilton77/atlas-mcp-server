import { TaskType } from '../../../types/task.js';
import { TaskManager } from '../../../task/manager/task-manager.js';
import { Logger } from '../../../logging/index.js';
import { Tool, ToolResponse } from '../../../types/tool.js';
import { ToolImplementation } from './index.js';

interface ToolContext {
  taskManager: TaskManager;
  logger: Logger;
}

/**
 * Create task tool implementation
 */
export function createTaskTool(context: ToolContext): ToolImplementation {
  const definition: Tool = {
    name: 'create_task',
    description: 'Create a new task in the hierarchical task system.',
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
          items: {
            type: 'string',
          },
          description:
            'Paths of tasks that must be completed first. Tasks will be blocked until dependencies are met.',
        },
        metadata: {
          type: 'object',
          description:
            'Additional task context and tracking information:\n- priority: Task urgency (low/medium/high)\n- tags: Keywords for categorization\n- reasoning: Document decision rationale\n- technical_requirements: Specific implementation needs\n- acceptance_criteria: Success validation points',
        },
        planningNotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Initial planning notes for the task',
        },
        progressNotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Progress tracking notes',
        },
        completionNotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Task completion notes',
        },
        troubleshootingNotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Notes about issues and their resolution',
        },
      },
      required: ['path', 'title'],
    },
  };

  const handler = async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { taskManager } = context;

    const task = await taskManager.createTask({
      // Required fields
      path: String(args.path),
      name: String(args.title),
      type: (args.type as TaskType) || TaskType.TASK,

      // Optional fields
      description: args.description ? String(args.description) : undefined,
      parentPath: args.parentPath ? String(args.parentPath) : undefined,
      dependencies: Array.isArray(args.dependencies) ? args.dependencies.map(String) : [],

      // Note categories
      planningNotes: Array.isArray(args.planningNotes) ? args.planningNotes.map(String) : [],
      progressNotes: Array.isArray(args.progressNotes) ? args.progressNotes.map(String) : [],
      completionNotes: Array.isArray(args.completionNotes) ? args.completionNotes.map(String) : [],
      troubleshootingNotes: Array.isArray(args.troubleshootingNotes)
        ? args.troubleshootingNotes.map(String)
        : [],

      // Metadata
      metadata: args.metadata || {},
      statusMetadata: {},
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(task, null, 2),
        },
      ],
    };
  };

  return {
    definition,
    handler,
  };
}
