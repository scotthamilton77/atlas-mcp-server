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

Core Task Properties:
- Path: Hierarchical identifier (e.g., "project/backend/auth")
  * Max length: 1000 chars
  * Max depth: 10 levels
  * Allowed chars: alphanumeric, hyphen, underscore, forward slash
  * Forward slashes indicate hierarchy levels
- Name: Clear, action-oriented task title
  * Max length: 200 chars
  * Should describe concrete objective
- Description: Detailed task explanation
  * Max length: 2000 chars
  * Include context, requirements, success criteria
- Type: TASK or MILESTONE
  * TASK: Concrete work item with specific deliverable
  * MILESTONE: Organizational container for related tasks

Validation & Dependencies:
- Dependencies: Tasks that must complete first
  * Max dependencies: 50 tasks
  * Tasks blocked until dependencies met
  * Circular dependencies prevented
- Parent-Child Rules:
  * Parent task must exist if parentPath specified
  * Child tasks inherit certain parent properties
  * Parent status affects child task constraints
  * Proper task hierarchy maintained

Notes & Documentation:
Each category limited to 100 notes, 1000 chars per note
- Planning Notes: Initial task preparation
- Progress Notes: Implementation updates
- Completion Notes: Final outcomes
- Troubleshooting Notes: Issue resolution

Metadata Categories:
1. Core Fields:
   - Priority: low/medium/high
   - Tags: Keywords for categorization (max 100)
   - Reasoning: Decision rationale (max 2000 chars)

2. Technical Details:
   - Language & Framework
   - Dependencies (max 50)
   - Environment specifications

3. Validation & Progress:
   - Acceptance criteria (max 20)
   - Test cases (max 20)
   - Progress percentage (0-100)
   - Milestone tracking
   - Timestamps

4. Resource Tracking:
   - Tools used (max 100)
   - Resources accessed (max 100)
   - Context references (max 100)

5. Status Information:
   - Block tracking
   - Resolution details
   - Timestamps

6. Version Control:
   - Version numbers
   - Branch information
   - Commit references
   - Version history (max 10)`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Hierarchical path (e.g., "project/backend/auth"). Max length 1000 chars, max depth 10 levels. Must be alphanumeric with -_/ characters. Use forward slashes to indicate task hierarchy.',
        },
        name: {
          type: 'string',
          description:
            'Clear, action-oriented name describing the task objective. Max length 200 chars.',
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

1. Core Fields:
   - priority: Task urgency (low/medium/high)
   - tags: Keywords for categorization (max 100 tags, each max 100 chars)
   - reasoning: Document decision rationale (max 2000 chars)

2. Technical Details:
   technicalRequirements: {
     - language: Programming language used
     - framework: Framework/libraries used
     - dependencies: Array of required dependencies (max 50)
     - environment: Runtime environment details
     - performance: Resource requirements
   }

3. Validation & Progress:
   acceptanceCriteria: {
     - criteria: Success validation points (max 20, each max 500 chars)
     - testCases: Test scenarios (max 20, each max 500 chars)
     - reviewers: Required reviewers list (max 10)
   }
   progress: {
     - percentage: Task completion (0-100)
     - milestones: Key progress points (max 20)
     - lastUpdated: Last status update timestamp
     - estimatedCompletion: Target completion timestamp
   }

4. Resource Tracking:
   resources: {
     - toolsUsed: Tools/utilities used (max 100)
     - resourcesAccessed: Data/systems accessed (max 100)
     - contextUsed: Related information (max 100, each max 1000 chars)
   }

5. Status Information:
   blockInfo: {
     - blockedBy: Task causing the block
     - blockReason: Block description (max 500 chars)
     - blockTimestamp: When block occurred
     - unblockTimestamp: When block was resolved
     - resolution: How block was resolved (max 500 chars)
   }

6. Version Control:
   versionControl: {
     - version: Current version number
     - branch: Active branch name
     - commit: Latest commit hash
     - previousVersions: Version history (max 10)
   }

7. Custom Fields:
   customFields: Record of additional string fields for extensibility`,
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
      required: ['path', 'name'],
    },
  };

  const handler = async (args: Record<string, unknown>): Promise<ToolResponse> => {
    const { taskManager } = context;

    const task = await taskManager.createTask({
      // Required fields
      path: String(args.path),
      name: String(args.name),
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
