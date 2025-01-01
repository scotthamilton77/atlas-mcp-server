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
    description: `Update task properties and status.

Status Transitions:
- PENDING → IN_PROGRESS, BLOCKED, CANCELLED
- IN_PROGRESS → COMPLETED, CANCELLED, BLOCKED
- COMPLETED → No transitions allowed
- CANCELLED → PENDING (for retry)
- BLOCKED → PENDING, IN_PROGRESS

Automatic Behaviors:
- Auto-transition to BLOCKED if dependencies block
- Parent completion requires all children complete
- Cancelled parent cancels non-completed children
- Blocked siblings prevent task completion
- Failed siblings prevent task start

Validation Rules:
- Same constraints as create_task
- Dependencies checked before status changes
- Parent-child status rules enforced
- Metadata schema validated
- Notes length and count limits applied

Best Practices:
- Document status change reasoning
- Update progress indicators
- Track technical implementation details
- Record blockers and resolutions
- Maintain dependency accuracy

Example:
{
  "path": "project/backend/auth",
  "updates": {
    "status": "IN_PROGRESS",
    "progressNotes": [
      "Database schema updated",
      "JWT library integrated",
      "Basic token generation implemented"
    ],
    "metadata": {
      "reasoning": "Moving to IN_PROGRESS as database dependencies are completed and core JWT implementation has begun. Token refresh mechanism still pending.",
      "technical_notes": [
        "Using jsonwebtoken library for JWT operations",
        "Token expiry set to 1 hour with refresh window"
      ]
    }
  }
}`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path of task to update',
        },
        updates: {
          type: 'object',
          description: `Changes to apply to the task. Field constraints:
- title: Task name (max 200 chars)
- description: Task details (max 2000 chars)
- type: TASK/MILESTONE classification
- status: Task state with validation rules
- parentPath: Parent task path (max 1000 chars, 10 levels)
- dependencies: Required tasks (max 50)
- metadata: Task tracking fields:
  - priority: low/medium/high
  - tags: max 100 tags, each max 100 chars
  - reasoning: max 2000 chars
  - tools_used: max 100 entries
  - resources_accessed: max 100 entries
  - context_used: max 100 entries, each max 1000 chars
  - technical_requirements: implementation details
  - acceptance_criteria: validation points
  - status_tracking: timestamps, block reasons
  - version_control: version numbers, states
- notes: Each category max 100 notes, each note max 1000 chars
  - planningNotes: Planning and preparation
  - progressNotes: Implementation progress
  - completionNotes: Completion details
  - troubleshootingNotes: Issue resolution

Status changes trigger:
- Automatic dependency validation
- Status propagation to parent tasks
- Dependent task blocking
- Child task status updates
- Validation of all constraints`,
          properties: {
            title: {
              type: 'string',
              description: 'New task title reflecting current focus',
            },
            description: {
              type: 'string',
              description: 'Updated task details including progress and findings',
            },
            type: {
              type: 'string',
              enum: ['TASK', 'MILESTONE'],
              description: 'Task classification (TASK/MILESTONE)',
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
              description: `Task execution state:
- PENDING: Not started
- IN_PROGRESS: Actively being worked on
- COMPLETED: Successfully finished
- BLOCKED: Waiting on dependencies
- CANCELLED: No longer needed`,
            },
            parentPath: {
              type: 'string',
              description: 'New parent task for hierarchy changes',
            },
            dependencies: {
              type: 'array',
              items: { type: 'string' },
              description: 'Updated list of required tasks',
            },
            planningNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Planning and preparation notes',
            },
            progressNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Implementation progress notes',
            },
            completionNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Task completion notes',
            },
            troubleshootingNotes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Issue resolution notes',
            },
            metadata: {
              type: 'object',
              description: `Task metadata with structured validation:
Core Fields:
- priority: Task urgency (low/medium/high)
- tags: Keywords for categorization (max 100 tags, each max 100 chars)
- reasoning: Document decision rationale (max 2000 chars)

Technical Details:
- technicalRequirements: {
    language: Programming language
    framework: Framework used
    dependencies: Array of dependencies (max 50)
    environment: Environment details
    performance: {
      memory: Memory requirements
      cpu: CPU requirements
      storage: Storage requirements
    }
  }

Validation & Progress:
- acceptanceCriteria: {
    criteria: Array of criteria (max 20, each max 500 chars)
    testCases: Optional test cases (max 20)
    reviewers: Optional reviewer list (max 10)
  }
- progress: {
    percentage: Progress percentage (0-100)
    milestones: Array of milestone names (max 20)
    lastUpdated: Timestamp
    estimatedCompletion: Timestamp
  }

Resource Tracking:
- resources: {
    toolsUsed: Array of tools (max 100)
    resourcesAccessed: Array of resources (max 100)
    contextUsed: Array of context items (max 100)
  }

Status Information:
- blockInfo: {
    blockedBy: Task causing block
    blockReason: Reason for block (max 500 chars)
    blockTimestamp: When blocked
    unblockTimestamp: When unblocked
    resolution: Block resolution (max 500 chars)
  }

Version Control:
- versionControl: {
    version: Version number
    branch: Branch name
    commit: Commit hash
    previousVersions: Array of previous versions (max 10)
  }

Custom Fields:
- customFields: Record of additional string fields`,
              properties: {
                priority: {
                  type: 'string',
                  enum: ['low', 'medium', 'high'],
                },
                tags: {
                  type: 'array',
                  items: {
                    type: 'string',
                    maxLength: 100,
                  },
                  maxItems: 100,
                },
                reasoning: {
                  type: 'string',
                  maxLength: 2000,
                },
                technicalRequirements: {
                  type: 'object',
                  properties: {
                    language: { type: 'string' },
                    framework: { type: 'string' },
                    dependencies: {
                      type: 'array',
                      items: { type: 'string' },
                      maxItems: 50,
                    },
                    environment: { type: 'string' },
                    performance: {
                      type: 'object',
                      properties: {
                        memory: { type: 'string' },
                        cpu: { type: 'string' },
                        storage: { type: 'string' },
                      },
                    },
                  },
                },
                acceptanceCriteria: {
                  type: 'object',
                  properties: {
                    criteria: {
                      type: 'array',
                      items: {
                        type: 'string',
                        maxLength: 500,
                      },
                      maxItems: 20,
                    },
                    testCases: {
                      type: 'array',
                      items: {
                        type: 'string',
                        maxLength: 500,
                      },
                      maxItems: 20,
                    },
                    reviewers: {
                      type: 'array',
                      items: { type: 'string' },
                      maxItems: 10,
                    },
                  },
                },
                progress: {
                  type: 'object',
                  properties: {
                    percentage: {
                      type: 'number',
                      minimum: 0,
                      maximum: 100,
                    },
                    milestones: {
                      type: 'array',
                      items: { type: 'string' },
                      maxItems: 20,
                    },
                    lastUpdated: { type: 'number' },
                    estimatedCompletion: { type: 'number' },
                  },
                },
                resources: {
                  type: 'object',
                  properties: {
                    toolsUsed: {
                      type: 'array',
                      items: { type: 'string' },
                      maxItems: 100,
                    },
                    resourcesAccessed: {
                      type: 'array',
                      items: { type: 'string' },
                      maxItems: 100,
                    },
                    contextUsed: {
                      type: 'array',
                      items: {
                        type: 'string',
                        maxLength: 1000,
                      },
                      maxItems: 100,
                    },
                  },
                },
                blockInfo: {
                  type: 'object',
                  properties: {
                    blockedBy: { type: 'string' },
                    blockReason: {
                      type: 'string',
                      maxLength: 500,
                    },
                    blockTimestamp: { type: 'number' },
                    unblockTimestamp: { type: 'number' },
                    resolution: {
                      type: 'string',
                      maxLength: 500,
                    },
                  },
                },
                versionControl: {
                  type: 'object',
                  properties: {
                    version: { type: 'number' },
                    branch: { type: 'string' },
                    commit: { type: 'string' },
                    previousVersions: {
                      type: 'array',
                      items: { type: 'number' },
                      maxItems: 10,
                    },
                  },
                },
                customFields: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
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
