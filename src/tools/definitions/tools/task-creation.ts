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
    description: `Create tasks to organize and track work. Use this tool to:

1. Define Work Items:
   - Create concrete tasks for specific deliverables
   - Set up milestones to group related tasks
   - Organize tasks in hierarchical paths (e.g., "project/backend/auth")
   - Add detailed descriptions and requirements

2. Establish Dependencies:
   - Specify tasks that must complete first
   - Create parent-child relationships
   - Build task hierarchies
   - Prevent circular dependencies

3. Document Context:
   - Add planning notes for initial requirements
   - Track progress with implementation notes
   - Record completion criteria
   - Document troubleshooting steps

4. Set Technical Details:
   - Define language and framework requirements
   - Specify environment needs
   - List required dependencies
   - Set resource requirements

5. Track Progress:
   - Define acceptance criteria
   - Create test cases
   - Set milestones
   - Track blockers and resolutions

6. Manage Resources:
   - List required tools
   - Track accessed resources
   - Reference related documentation
   - Link to version control

Example Usage:
{
  "path": "project/backend/auth",
  "name": "Implement JWT Authentication",
  "type": "TASK",
  "description": "Add JWT-based authentication to API endpoints",
  "dependencies": ["project/backend/database"],
  "metadata": {
    "priority": "high",
    "technicalRequirements": {
      "language": "TypeScript",
      "framework": "Express",
      "dependencies": ["jsonwebtoken", "bcrypt"]
    }
  },
  "planningNotes": [
    "Research JWT best practices",
    "Design token refresh mechanism"
  ]
}`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Create hierarchical path (e.g., "project/backend/auth") to organize related tasks. Use forward slashes to indicate task hierarchy. Max length 1000 chars, max depth 10 levels.',
        },
        name: {
          type: 'string',
          description:
            'Define clear, action-oriented name describing what the task will accomplish. Max length 200 chars.',
        },
        description: {
          type: 'string',
          description:
            'Specify requirements, context, and success criteria. Include enough detail to understand the task scope. Max length 2000 chars.',
        },
        type: {
          type: 'string',
          enum: ['TASK', 'MILESTONE'],
          description: 'Choose TASK for concrete deliverables or MILESTONE to group related tasks.',
          default: 'TASK',
        },
        parentPath: {
          type: 'string',
          description: 'Specify parent task path to create subtasks under a milestone.',
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'List paths of tasks that must complete first. Tasks will be blocked until dependencies are met.',
        },
        metadata: {
          type: 'object',
          description: `Add any metadata needed to track and organize tasks. The metadata system is flexible and accepts custom fields. Some suggested fields include:

1. Core Fields:
   - priority: Set task urgency (low/medium/high)
   - tags: Add categorization keywords
   - reasoning: Document decision rationale

2. Technical Details:
   technicalRequirements: {
     - language: Programming language
     - framework: Frameworks/libraries
     - dependencies: Required packages
     - environment: Runtime needs
     - performance: Resource needs
     - [Add any other technical fields needed]
   }

3. Validation:
   acceptanceCriteria: {
     - criteria: Success criteria
     - testCases: Test scenarios
     - reviewers: Required reviews
     - [Add custom validation requirements]
   }
   progress: {
     - milestones: Key checkpoints
     - [Add custom progress tracking fields]
   }

4. Resources:
   resources: {
     - toolsUsed: Required tools
     - resourcesAccessed: Data sources
     - contextUsed: Documentation links
     - [Add other resource fields]
   }

5. Status:
   blockInfo: {
     - blockedBy: Blocking task
     - blockReason: Block description
     - resolution: Fix details
     - [Add custom status fields]
   }

6. Version Control:
   versionControl: {
     - branch: Working branch
     - commit: Commit hash
     - [Add other VCS fields]
   }

7. Custom Fields:
   - Add any additional fields needed
   - Use nested objects for organization
   - No strict schema requirements
   - Fields can be added/removed as needed`,
          // Allow any properties in metadata
          additionalProperties: true,
        },
        planningNotes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Add initial planning notes to document requirements and approach. Max 100 notes, each max 1000 chars.',
        },
        progressNotes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Track implementation progress with detailed notes. Max 100 notes, each max 1000 chars.',
        },
        completionNotes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Document task completion details and outcomes. Max 100 notes, each max 1000 chars.',
        },
        troubleshootingNotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Record issues and their resolutions. Max 100 notes, each max 1000 chars.',
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
