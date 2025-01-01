import { TaskType, TaskMetadata } from '../../../types/task.js';
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
      metadata: (args.metadata as TaskMetadata) || {
        tags: [],
        technicalRequirements: {
          dependencies: [],
          requirements: [],
        },
        resources: {
          toolsUsed: [],
          resourcesAccessed: [],
          contextUsed: [],
        },
        customFields: {},
      },
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
