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
    description: `Create a new task with defined outcomes, requirements, and success criteria. This tool enables LLM agents to:

CORE CAPABILITIES:
1. Task Definition
   - Create atomic work units with clear deliverables
   - Define measurable outcomes and success criteria
   - Establish hierarchical organization
   - Set completion requirements

2. Relationship Management
   - Define dependencies with validation
   - Create parent-child hierarchies
   - Prevent circular dependencies
   - Maintain task graph integrity
   - Create an initial milestone or task

3. Progress Tracking
   - Document implementation steps
   - Track completion status
   - Record blockers and issues
   - Maintain audit trail

VALIDATION RULES:
1. Path Requirements
   - Format: project/component/feature
   - Max Length: 1000 chars
   - Max Depth: 10 levels
   - Valid chars: a-z, A-Z, 0-9, -, _

2. Content Limits
   - Name: 200 chars max
   - Description: 2000 chars max
   - Notes: 100 per category, 1000 chars each
   - Dependencies: 50 max

3. Metadata Validation
   - Required fields must be present
   - Values must match defined types
   - Arrays must not exceed limits

EXAMPLES:

1. Development Task:
{
  "path": "project/backend/auth",
  "name": "Implement OAuth2 Authentication",
  "type": "TASK",
  "description": "Add OAuth2-based user authentication with refresh token support",
  "dependencies": ["project/backend/database"],
  "metadata": {
    "priority": "high",
    "acceptanceCriteria": {
      "requirements": [
        "OAuth2 flow implemented per spec",
        "Refresh tokens handled securely",
        "Rate limiting implemented"
      ]
    },
    "technicalRequirements": {
      "language": "TypeScript",
      "framework": "Express",
      "dependencies": ["passport-oauth2"]
    }
  },
  "planningNotes": [
    "Review OAuth2 specification",
    "Design token storage schema",
    "Plan rate limiting strategy"
  ]
}

2. Project Milestone:
{
  "path": "project/backend",
  "name": "Backend API v1.0",
  "type": "MILESTONE",
  "description": "Complete core backend API implementation",
  "metadata": {
    "acceptanceCriteria": {
      "requirements": [
        "All core endpoints implemented",
        "95% test coverage achieved",
        "Performance benchmarks met"
      ]
    },
    "versionControl": {
      "branch": "main",
      "tag": "v1.0.0"
    }
  }
}

OUTCOME REQUIREMENTS:
1. Task Creation
   - Unique path verified
   - Dependencies validated
   - Schema constraints met
   - Metadata validated

2. Success Criteria
   - Task stored in database
   - Relationships established
   - Initial status set
   - Audit trail created

3. Error Conditions
   - Path already exists
   - Invalid dependencies
   - Schema validation fails
   - Relationship conflicts`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Task identifier in hierarchical format (e.g., "project/backend/auth"). VALIDATION: Max length 1000 chars, max depth 10 levels, valid chars: a-z, A-Z, 0-9, -, _',
        },
        name: {
          type: 'string',
          description:
            'Action-oriented task name describing the specific outcome to achieve. VALIDATION: Max length 200 chars, must be descriptive and unique within parent scope.',
        },
        description: {
          type: 'string',
          description:
            'Detailed task requirements, success criteria, and context. VALIDATION: Max length 2000 chars, should include measurable outcomes.',
        },
        type: {
          type: 'string',
          enum: ['TASK', 'MILESTONE'],
          description:
            'TASK: Concrete deliverable with specific outcome. MILESTONE: Group of related tasks with shared objective.',
          default: 'TASK',
        },
        parentPath: {
          type: 'string',
          description:
            'Path of parent task/milestone. VALIDATION: Must exist if specified, cannot create circular relationships.',
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'Paths of tasks that must complete before this task can start. VALIDATION: Max 50 dependencies, no cycles allowed, all must exist.',
        },
        metadata: {
          type: 'object',
          description: `Structured task metadata for tracking and validation. VALIDATION: Max size 32KB.

REQUIRED SECTIONS:
1. acceptanceCriteria: {
   requirements: string[],    // Specific, measurable criteria
   testCases?: string[],     // Validation scenarios
   reviewers?: string[]      // Required approvals
}

2. technicalRequirements?: {
   language?: string,        // Programming language
   framework?: string,       // Framework/platform
   dependencies?: string[],  // Required packages/tools
   performance?: {           // Performance requirements
     memory?: string,
     cpu?: string,
     latency?: string
   }
}

3. progress?: {
   percentage?: number,      // 0-100
   milestones?: string[],    // Key checkpoints
   blockers?: string[]       // Current blockers
}

4. resources?: {
   toolsUsed: string[],      // Required tools
   documentation: string[],   // Reference docs
   artifacts: string[]       // Related artifacts
}

OPTIONAL SECTIONS:
- priority?: "low" | "medium" | "high"
- tags?: string[]            // Max 10 tags
- customFields?: object      // Additional metadata`,
          additionalProperties: true,
        },
        planningNotes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Initial requirements and implementation plan. VALIDATION: Max 100 notes, each max 1000 chars.',
        },
        progressNotes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Ongoing implementation updates. VALIDATION: Max 100 notes, each max 1000 chars.',
        },
        completionNotes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Final outcomes and delivery notes. VALIDATION: Max 100 notes, each max 1000 chars.',
        },
        troubleshootingNotes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Issues encountered and resolutions. VALIDATION: Max 100 notes, each max 1000 chars.',
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
