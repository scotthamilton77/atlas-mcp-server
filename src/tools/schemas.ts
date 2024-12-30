/**
 * Path-based task management schemas for LLM agents
 */
import { TaskStatus, CONSTRAINTS } from '../types/task.js';

// Schema validation messages
const VALIDATION_MESSAGES = {
  PATH_FORMAT: 'Use alphanumeric characters, underscores, dots, and hyphens for clear paths',
  PATH_DEPTH: `Keep path depth within ${CONSTRAINTS.MAX_PATH_DEPTH} levels for good organization`,
  NAME_LENGTH: `Use concise names up to ${CONSTRAINTS.NAME_MAX_LENGTH} characters`,
  DESC_LENGTH: `Provide clear descriptions within ${CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`,
  NOTE_LENGTH: `Write focused notes up to ${CONSTRAINTS.NOTE_MAX_LENGTH} characters each`,
  REASONING_LENGTH: `Document reasoning clearly within ${CONSTRAINTS.REASONING_MAX_LENGTH} characters`,
  DEPENDENCIES_SIZE: `Maintain up to ${CONSTRAINTS.MAX_DEPENDENCIES} well-defined dependencies`,
  NOTES_SIZE: `Track progress with up to ${CONSTRAINTS.MAX_NOTES} detailed notes`,
  METADATA_LENGTH: `Keep metadata fields concise within ${CONSTRAINTS.METADATA_STRING_MAX_LENGTH} characters`,
  METADATA_ARRAY: `Use up to ${CONSTRAINTS.MAX_ARRAY_ITEMS} items for effective categorization`,
};

/** Creates a new task with path-based hierarchy and validation */
export const createTaskSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description:
        'Hierarchical task path (e.g., "server/api/authentication"). Use paths to organize related tasks.\n' +
        `Constraints:\n` +
        `- ${VALIDATION_MESSAGES.PATH_FORMAT}\n` +
        `- ${VALIDATION_MESSAGES.PATH_DEPTH}`,
      pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$',
      maxLength: CONSTRAINTS.MAX_PATH_DEPTH * 50, // Reasonable max length per segment
    },
    name: {
      type: 'string',
      description:
        'Clear, action-oriented task name (e.g., "Implement JWT authentication", "Refactor database queries").\n' +
        `Maximum length: ${CONSTRAINTS.NAME_MAX_LENGTH} characters`,
      maxLength: CONSTRAINTS.NAME_MAX_LENGTH,
    },
    parentPath: {
      type: 'string',
      description:
        'Path of the parent task. Parent should be a MILESTONE for effective organization.\n' +
        'Best Practices:\n' +
        '• Use descriptive milestone names (e.g., "project/backend")\n' +
        '• Keep paths clear and meaningful\n' +
        '• Structure tasks logically under milestones',
    },
    description: {
      type: 'string',
      description:
        'Detailed task description including:\n' +
        '- Objective: What needs to be accomplished\n' +
        '- Context: Why this task is needed\n' +
        '- Technical details: Implementation considerations\n' +
        '- Success criteria: How to verify completion\n' +
        `Maximum length: ${CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`,
      maxLength: CONSTRAINTS.DESCRIPTION_MAX_LENGTH,
    },
    type: {
      type: 'string',
      enum: ['TASK', 'MILESTONE'],
      description:
        'Task Type Guide - Building Effective Task Hierarchies:\n\n' +
        '1. MILESTONE - Project Organization:\n' +
        '   • Organizes work into meaningful phases\n' +
        '   • Groups related tasks under clear objectives\n' +
        '   • Examples: "Backend Development", "Security Hardening"\n' +
        '   • Best Practices:\n' +
        '     - Use descriptive, goal-oriented names\n' +
        '     - Keep task groupings focused and cohesive\n' +
        '     - Track progress through task completion\n\n' +
        '2. TASK - Unit of Work:\n' +
        '   • Represents concrete, achievable actions\n' +
        '   • Focuses on specific implementation details\n' +
        '   • Examples: "Implement JWT", "Add Rate Limiting"\n' +
        '   • Best Practices:\n' +
        '     - Define clear success criteria\n' +
        '     - Use action-oriented names\n' +
        '     - Keep scope focused and manageable\n\n' +
        'Hierarchy Best Practices:\n' +
        '• Structure tasks logically under relevant milestones\n' +
        '• Use meaningful path segments for easy navigation\n' +
        '• Maintain clear dependencies between related tasks\n' +
        '• Keep hierarchy depth reasonable for good organization',
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$',
      },
      maxItems: CONSTRAINTS.MAX_DEPENDENCIES,
      description:
        'Paths of tasks that must be completed first. Tasks will be automatically blocked if dependencies are not met.\n' +
        `Maximum dependencies: ${CONSTRAINTS.MAX_DEPENDENCIES}\n` +
        'Dependencies can be specified here (recommended) or in metadata.dependencies (legacy).',
      uniqueItems: true,
    },
    metadata: {
      type: 'object',
      properties: {
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Task urgency and impact level. Affects task ordering and scheduling.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          maxItems: CONSTRAINTS.MAX_ARRAY_ITEMS,
          description:
            'Keywords for categorization and filtering (e.g., ["api", "security", "optimization"]). Used in path pattern matching.\n' +
            `Maximum tags: ${CONSTRAINTS.MAX_ARRAY_ITEMS}`,
          uniqueItems: true,
        },
        assignee: {
          type: 'string',
          description:
            'System or component responsible for the task. Used for task distribution and filtering.',
        },
        reasoning: {
          type: 'string',
          description:
            'LLM reasoning about task decisions, importance, and approach. Provides context for status changes and dependencies.\n' +
            `Maximum length: ${CONSTRAINTS.REASONING_MAX_LENGTH} characters`,
          maxLength: CONSTRAINTS.REASONING_MAX_LENGTH,
        },
        notes: {
          type: 'array',
          items: {
            type: 'string',
            maxLength: CONSTRAINTS.NOTE_MAX_LENGTH,
          },
          maxItems: CONSTRAINTS.MAX_NOTES,
          description:
            'Additional context, observations, and planning notes. Used to track progress and document decisions.\n' +
            `Maximum notes: ${CONSTRAINTS.MAX_NOTES}\n` +
            `Maximum length per note: ${CONSTRAINTS.NOTE_MAX_LENGTH} characters`,
        },
      },
      description:
        'Additional task context and tracking information. Fields affect:\n' +
        '- Task organization (priority, tags, assignee)\n' +
        '- Progress tracking (notes)\n' +
        '- Decision history (reasoning)\n\n' +
        'Note: dependencies in metadata.dependencies will be migrated to the main dependencies array.',
    },
  },
  required: ['name', 'path'],
};

/** Updates an existing task */
export const updateTaskSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Path of the task to update.',
    },
    updates: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Updated task name with current action focus.\n' +
            `Maximum length: ${CONSTRAINTS.NAME_MAX_LENGTH} characters`,
          maxLength: CONSTRAINTS.NAME_MAX_LENGTH,
        },
        description: {
          type: 'string',
          description:
            'Updated description with latest context, findings, and next steps.\n' +
            `Maximum length: ${CONSTRAINTS.DESCRIPTION_MAX_LENGTH} characters`,
          maxLength: CONSTRAINTS.DESCRIPTION_MAX_LENGTH,
        },
        type: {
          type: 'string',
          enum: ['TASK', 'MILESTONE'],
          description:
            'Task Type Selection Guide:\n' +
            '• MILESTONE: Choose when organizing related tasks under a common objective\n' +
            '• TASK: Choose when implementing specific, actionable work items\n\n' +
            'Best Practices:\n' +
            '• Group related tasks under descriptive milestones\n' +
            '• Keep task definitions clear and focused\n' +
            '• Consider dependencies when organizing tasks',
        },
        status: {
          type: 'string',
          enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
          description:
            'Current execution state with strict transition rules:\n\n' +
            'Status Flow:\n' +
            '1. PENDING (Initial State)\n' +
            '   → Can transition to: IN_PROGRESS, BLOCKED\n' +
            '   → Cannot skip to COMPLETED (must track progress)\n\n' +
            '2. IN_PROGRESS (Active State)\n' +
            '   → Can transition to: COMPLETED, FAILED, BLOCKED\n' +
            '   → Required before completion\n\n' +
            '3. BLOCKED (Dependency State)\n' +
            '   → Can transition to: PENDING, IN_PROGRESS\n' +
            '   → Auto-set when dependencies incomplete\n\n' +
            '4. COMPLETED (Terminal State)\n' +
            '   → Must come from IN_PROGRESS\n' +
            '   → Requires all dependencies completed\n\n' +
            '5. FAILED (Terminal State)\n' +
            '   → Can retry by setting to PENDING\n\n' +
            'Status Management Guide:\n\n' +
            'MILESTONE Progress:\n' +
            '• Tracks overall project phase completion\n' +
            '• Automatically updates based on task progress\n' +
            '• Provides high-level project insights\n\n' +
            'TASK Progress:\n' +
            '• Reflects individual work item status\n' +
            '• Updates through natural workflow stages\n' +
            '• Enables detailed progress tracking\n\n' +
            'Status Best Practices:\n' +
            '• Begin tasks in PENDING state\n' +
            '• Update to IN_PROGRESS when actively working\n' +
            '• Mark COMPLETED after thorough verification\n' +
            '• Use status transitions to maintain accurate progress\n' +
            '• Keep task status current for effective tracking',
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$',
          },
          maxItems: CONSTRAINTS.MAX_DEPENDENCIES,
          description:
            'Updated task dependencies. Tasks will be automatically blocked if new dependencies are not met.\n' +
            `Maximum dependencies: ${CONSTRAINTS.MAX_DEPENDENCIES}\n` +
            'Status changes propagate through dependency chain.',
          uniqueItems: true,
        },
        metadata: {
          type: 'object',
          properties: {
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Task urgency and impact level. Affects task ordering and scheduling.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              maxItems: CONSTRAINTS.MAX_ARRAY_ITEMS,
              description:
                'Keywords for categorization and filtering (e.g., ["api", "security", "optimization"]). Used in path pattern matching.\n' +
                `Maximum tags: ${CONSTRAINTS.MAX_ARRAY_ITEMS}`,
              uniqueItems: true,
            },
            assignee: {
              type: 'string',
              description: 'Updated system/component assignment',
            },
            reasoning: {
              type: 'string',
              description:
                'LLM reasoning about task decisions, importance, and approach. Provides context for status changes and dependencies.\n' +
                `Maximum length: ${CONSTRAINTS.REASONING_MAX_LENGTH} characters`,
              maxLength: CONSTRAINTS.REASONING_MAX_LENGTH,
            },
            notes: {
              type: 'array',
              items: {
                type: 'string',
                maxLength: CONSTRAINTS.NOTE_MAX_LENGTH,
              },
              maxItems: CONSTRAINTS.MAX_NOTES,
              description:
                'Additional context, observations, and planning notes. Used to track progress and document decisions.\n' +
                `Maximum notes: ${CONSTRAINTS.MAX_NOTES}\n` +
                `Maximum length per note: ${CONSTRAINTS.NOTE_MAX_LENGTH} characters`,
            },
          },
          description:
            'Task metadata fields affect:\n' +
            '- Task organization (priority, tags, assignee)\n' +
            '- Progress tracking (notes)\n' +
            '- Decision history (reasoning)',
        },
      },
      description:
        'Fields to update. Available fields:\n' +
        '- name: Update task name\n' +
        '- description: Update task details\n' +
        '- type: Select appropriate task type (TASK/MILESTONE)\n' +
        '- status: Update execution state with automatic dependency checks\n' +
        '- dependencies: Add/remove dependencies with validation\n' +
        '- metadata: Update task metadata (priority, tags, notes, etc.)\n\n' +
        'Status changes trigger:\n' +
        '- Automatic dependency validation\n' +
        '- Status propagation to parent tasks\n' +
        '- Dependent task blocking\n' +
        '- Child task status updates',
    },
  },
  required: ['path', 'updates'],
};

/** Gets tasks by status */
export const getTasksByStatusSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'] as TaskStatus[],
      description:
        'Filter tasks by their execution state. Use to find tasks needing attention or verify completion.',
    },
    pathPattern: {
      type: 'string',
      description:
        'Optional glob pattern to filter by path (e.g., "server/api/*"). Use to focus on specific subsystems.',
    },
  },
  required: ['status'],
};

/** Gets tasks by path pattern */
export const getTasksByPathSchema = {
  type: 'object',
  properties: {
    pathPattern: {
      type: 'string',
      description:
        'Glob pattern to match task paths. Use to analyze specific areas of work (e.g., "server/*/security/*").',
    },
  },
  required: ['pathPattern'],
};

/** Gets child tasks of a task */
export const getChildrenSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description:
        'Parent task path. Returns immediate child tasks to analyze task breakdown and progress.',
    },
  },
  required: ['path'],
};

/** Deletes a task */
export const deleteTaskSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description:
        'Task path to remove. Provides clean project organization by removing completed or obsolete tasks.',
    },
  },
  required: ['path'],
};

/** Clears all tasks from the database */
export const clearAllTasksSchema = {
  type: 'object',
  properties: {
    confirm: {
      type: 'boolean',
      description:
        'Enables fresh start by clearing task database. Useful when beginning new project phases or reorganizing work structure.',
    },
  },
  required: ['confirm'],
};

/** Optimizes database storage and performance */
export const vacuumDatabaseSchema = {
  type: 'object',
  properties: {
    analyze: {
      type: 'boolean',
      description:
        'Database Optimization Guide:\n' +
        '• Improves query performance through table analysis\n' +
        '• Optimizes storage space utilization\n' +
        '• Enhances overall system responsiveness\n' +
        '• Recommended during maintenance windows',
      default: true,
    },
  },
  required: [],
};

/** Repairs parent-child relationships and fixes inconsistencies */
export const repairRelationshipsSchema = {
  type: 'object',
  properties: {
    dryRun: {
      type: 'boolean',
      description:
        'Relationship Maintenance Guide:\n' +
        '• Preview changes before applying them\n' +
        '• Ensure task hierarchy integrity\n' +
        '• Validate parent-child relationships\n' +
        '• Maintain clean task organization',
      default: false,
    },
    pathPattern: {
      type: 'string',
      description:
        'Scope Control Guide:\n' +
        '• Focus repairs on specific project areas\n' +
        '• Use patterns like "project/*" for targeted maintenance\n' +
        '• Organize repairs by project phase or component',
    },
  },
  required: [],
};

/** Bulk task operations with validation */
export const bulkTaskSchema = {
  type: 'object',
  properties: {
    operations: {
      type: 'array',
      description:
        'Sequence of atomic task operations with intelligent dependency handling:\n' +
        '- Operations are automatically sorted by dependencies\n' +
        '- Forward-looking dependencies are allowed (deferred validation)\n' +
        '- Dependencies are validated after all tasks are created\n' +
        '- Operations execute in dependency order\n' +
        '- Atomic transaction ensures all-or-nothing execution',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['create', 'update', 'delete'],
            description:
              'Operation type:\n' +
              '- create: Add new task with full context\n' +
              '- update: Modify task with latest findings\n' +
              '- delete: Remove completed or obsolete task',
          },
          path: {
            type: 'string',
            description:
              'Task path for the operation. For create, this sets the desired hierarchy.\n' +
              `Constraints:\n` +
              `- ${VALIDATION_MESSAGES.PATH_FORMAT}\n` +
              `- ${VALIDATION_MESSAGES.PATH_DEPTH}`,
            pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$',
            maxLength: CONSTRAINTS.MAX_PATH_DEPTH * 50,
          },
          data: {
            type: 'object',
            description:
              'Operation-specific data:\n' +
              '- create: Full task definition including dependencies and context\n' +
              '- update: Fields to modify including status and dependencies\n' +
              '- delete: Optional deletion context\n\n' +
              'Dependency handling:\n' +
              '- Dependencies can reference tasks being created in the same batch\n' +
              '- Tasks are created in dependency order automatically\n' +
              '- Circular dependencies are prevented\n' +
              '- Status changes respect dependency constraints\n' +
              '- Failed operations trigger rollback\n\n' +
              'Example - Creating Tasks with Dependencies:\n' +
              '{\n' +
              '  "operations": [\n' +
              '    {\n' +
              '      "type": "create",\n' +
              '      "path": "project/backend/database",\n' +
              '      "data": {\n' +
              '        "name": "Database Setup",\n' +
              '        "type": "TASK"\n' +
              '      }\n' +
              '    },\n' +
              '    {\n' +
              '      "type": "create",\n' +
              '      "path": "project/backend/api",\n' +
              '      "data": {\n' +
              '        "name": "API Development",\n' +
              '        "dependencies": ["project/backend/database"]\n' +
              '      }\n' +
              '    }\n' +
              '  ]\n' +
              '}',
          },
        },
        required: ['type', 'path'],
      },
    },
  },
  required: ['operations'],
};
