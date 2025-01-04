import { TaskType, TaskStatus, Task, UpdateTaskInput } from '../../../types/task.js';
import { ToolFactory, ToolImplementation } from './shared/types.js';
import { formatResponse } from './shared/response-formatter.js';
import { ErrorCodes, createError } from '../../../errors/index.js';

/**
 * Update task tool implementation
 */
export const updateTaskTool: ToolFactory = (context): ToolImplementation => ({
  definition: {
    name: 'update_task',
    description: `Update an existing task's properties, status, or metadata. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Status Management
   - Transition task state based on progress
   - Handle blocking conditions
   - Manage task lifecycle
   - Track completion status

2. Content Updates
   - Refine task descriptions
   - Update technical requirements
   - Add implementation notes
   - Record progress details

3. Relationship Updates
   - Modify dependencies
   - Update parent-child links
   - Handle blocking conditions
   - Maintain task graph

AUTOMATIC BEHAVIORS:
1. Status Propagation
   - Parent completion requires all children complete
   - Blocked dependencies auto-block dependent tasks
   - Cancelled parent cancels non-completed children

2. Validation Rules
   - Dependencies checked before status changes
   - Parent-child status rules enforced
   - Schema constraints validated
   - Notes length limits enforced

EXAMPLE:

1. We have a task at path "project/backend/auth" that needs an update:
{
  "path": "project/backend/auth",
  "updates": {
    "status": "IN_PROGRESS",
    "progressNotes": [
      "Starting OAuth2 implementation",
      "Setting up authentication routes"
    ],
    "metadata": {
      "reasoning": "Dependencies completed, beginning implementation",
      "progress": {
        "percentage": 10,
        "currentFocus": "Route setup"
      }
    }
  }
}

OUTCOME REQUIREMENTS:
1. Status Updates
   - Valid transition verified
   - Dependencies checked
   - Parent-child rules enforced
   - Audit trail updated

2. Content Updates
   - Schema validated
   - Length limits checked
   - Required fields present
   - History maintained`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Path of task to update. VALIDATION: Must exist, must match task-path format.',
        },
        updates: {
          type: 'object',
          description: `Changes to apply to the task. Each field triggers specific validations:

STATUS UPDATES:
- status: Current execution state
  PENDING → Starting state
  IN_PROGRESS → Active development
  COMPLETED → Work finished
  BLOCKED → Dependencies blocking
  CANCELLED → Work stopped

CONTENT UPDATES:
- name: Task title (max 200 chars)
- description: Requirements (max 2000 chars)
- type: TASK or MILESTONE
- dependencies: Required tasks (max 50)

NOTES (max 100 each, 1000 chars per note):
- planningNotes: Requirements and approach
- progressNotes: Implementation updates
- completionNotes: Delivery details
- troubleshootingNotes: Issue resolutions

METADATA:
1. Required for Status Changes:
   - reasoning: Why the change is needed
   - blockInfo: For BLOCKED status
   - completionCriteria: For COMPLETED status

2. Progress Tracking:
   - percentage: 0-100
   - currentFocus: Active work
   - nextSteps: Planned work

3. Technical Details:
   - language: Programming language
   - framework: Framework used
   - dependencies: Required packages

4. Version Control:
   - branch: Working branch
   - commit: Current commit
   - tag: Version tag`,
          properties: {
            status: {
              type: 'string',
              enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
              description:
                'New task status. VALIDATION: Must be valid transition, dependencies checked.',
            },
            name: {
              type: 'string',
              description: 'New task name. VALIDATION: Max 200 chars, must be descriptive.',
            },
            description: {
              type: 'string',
              description:
                'Updated requirements. VALIDATION: Max 2000 chars, include success criteria.',
            },
            type: {
              type: 'string',
              enum: ['TASK', 'MILESTONE'],
              description: 'Task classification. VALIDATION: Cannot change if has children.',
            },
            dependencies: {
              type: 'array',
              items: { type: 'string' },
              description: 'Required tasks. VALIDATION: Max 50, must exist, no cycles.',
            },
            planningNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Requirements and approach. VALIDATION: Max 100 notes, 1000 chars each.',
            },
            progressNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Implementation updates. VALIDATION: Max 100 notes, 1000 chars each.',
            },
            completionNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Delivery details. VALIDATION: Max 100 notes, 1000 chars each.',
            },
            troubleshootingNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Issue resolutions. VALIDATION: Max 100 notes, 1000 chars each.',
            },
            metadata: {
              type: 'object',
              description: `Task metadata for tracking progress and requirements. Key sections:

1. Status Changes:
   reasoning: string        // Why the change is needed
   blockInfo?: {           // Required for BLOCKED status
     blockedBy: string[]   // Blocking task paths
     reason: string        // Block description
   }
   completionCriteria?: {  // Required for COMPLETED status
     met: string[]         // Met criteria
     verified: boolean     // Verification status
   }

2. Progress:
   percentage: number      // 0-100
   currentFocus: string    // Active work
   nextSteps: string[]     // Planned work
   blockers: string[]      // Current issues`,
              additionalProperties: true,
            },
          },
        },
      },
      required: ['path', 'updates'],
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const { path, updates } = args as { path: string; updates: Record<string, unknown> };

    // First fetch the existing task to preserve required fields
    const existingTask: Task | null = await context.taskManager.getTask(path);
    if (!existingTask) {
      throw createError(
        ErrorCodes.TASK_NOT_FOUND,
        `Task not found at path: ${path}`,
        'update_task'
      );
    }

    // Create update object starting with existing required fields
    const updateData: UpdateTaskInput = {
      name: existingTask.name,
      type: existingTask.type,
      description: existingTask.description,
      dependencies: existingTask.dependencies,
      metadata: { ...existingTask.metadata },
      statusMetadata: { ...existingTask.statusMetadata },
      planningNotes: [...existingTask.planningNotes],
      progressNotes: [...existingTask.progressNotes],
      completionNotes: [...existingTask.completionNotes],
      troubleshootingNotes: [...existingTask.troubleshootingNotes],
    };

    // Apply updates only if they are provided
    if (typeof updates.title === 'string') {
      updateData.name = updates.title;
    }
    if (typeof updates.name === 'string') {
      updateData.name = updates.name;
    }
    if (updates.type) {
      updateData.type = (updates.type as string).toUpperCase() as TaskType;
    }
    if (updates.description !== undefined) {
      updateData.description = updates.description as string;
    }
    if (updates.status !== undefined) {
      updateData.status = updates.status as TaskStatus;
    }
    if (Array.isArray(updates.dependencies)) {
      updateData.dependencies = updates.dependencies as string[];
    }
    if (Array.isArray(updates.planningNotes)) {
      updateData.planningNotes = updates.planningNotes as string[];
    }
    if (Array.isArray(updates.progressNotes)) {
      updateData.progressNotes = updates.progressNotes as string[];
    }
    if (Array.isArray(updates.completionNotes)) {
      updateData.completionNotes = updates.completionNotes as string[];
    }
    if (Array.isArray(updates.troubleshootingNotes)) {
      updateData.troubleshootingNotes = updates.troubleshootingNotes as string[];
    }
    if (updates.metadata) {
      updateData.metadata = {
        ...updateData.metadata,
        ...(updates.metadata as Record<string, unknown>),
      };
    }
    if (updates.statusMetadata) {
      updateData.statusMetadata = {
        ...updateData.statusMetadata,
        ...(updates.statusMetadata as Record<string, unknown>),
      };
    }

    // Update the task with merged data
    const result: Task = await context.taskManager.updateTask(path, updateData);
    return formatResponse(result, context.logger);
  },
});
