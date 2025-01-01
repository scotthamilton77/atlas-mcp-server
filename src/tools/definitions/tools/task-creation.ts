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
    description: `Create a new task in the hierarchical task system.

Validation Constraints:
- Path: max length 1000 chars, max depth 10 levels, alphanumeric with -_/
- Name: max length 200 chars
- Description: max length 2000 chars
- Notes: max 100 notes per category, each max 1000 chars
- Dependencies: max 50 tasks
- Reasoning: max 2000 chars

Metadata Fields:
- Priority: low/medium/high
- Tags: max 100 tags, each max 100 chars
- Tools Used: max 100 entries
- Resources Accessed: max 100 entries
- Context Used: max 100 entries, each max 1000 chars
- Status Tracking: timestamps, block reasons
- Version Control: version numbers, previous states

Parent-Child Rules:
- Parent must exist if parentPath specified
- Parent status affects child task constraints
- Child tasks inherit certain parent properties`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Hierarchical path (e.g., "project/backend/auth"). Max length 1000 chars, max depth 10 levels. Must be alphanumeric with -_/ characters. Use forward slashes to indicate task hierarchy.',
        },
        title: {
          type: 'string',
          description:
            'Clear, action-oriented title describing the task objective. Max length 200 chars.',
        },
        description: {
          type: 'string',
          description:
            'Detailed explanation including context, requirements, and success criteria. Max length 2000 chars.',
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
            'Additional task context and tracking information:\n- priority: Task urgency (low/medium/high)\n- tags: Keywords for categorization (max 100 tags, each max 100 chars)\n- reasoning: Document decision rationale (max 2000 chars)\n- tools_used: Track tool usage (max 100 entries)\n- resources_accessed: Track resource access (max 100 entries)\n- context_used: Contextual information (max 100 entries, each max 1000 chars)\n- technical_requirements: Implementation needs\n- acceptance_criteria: Success validation points\n- status_tracking: Timestamps, block reasons\n- version_control: Version numbers, previous states',
        },
        planningNotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Initial planning notes for the task. Max 100 notes, each max 1000 chars.',
        },
        progressNotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Progress tracking notes. Max 100 notes, each max 1000 chars.',
        },
        completionNotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Task completion notes. Max 100 notes, each max 1000 chars.',
        },
        troubleshootingNotes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Notes about issues and their resolution. Max 100 notes, each max 1000 chars.',
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
