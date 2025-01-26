/**
 * Path-based task management schemas for LLM agents
 */
import { TaskStatus, CONSTRAINTS } from '../types/task.js';

// Schema validation messages
const VALIDATION_MESSAGES = {
  PATH_FORMAT: 'Use alphanumeric characters, underscores, dots, and hyphens for clear paths',
  PATH_DEPTH: `Keep path depth within ${CONSTRAINTS.MAX_PATH_DEPTH} levels`,
  NAME_LENGTH: `Use concise names up to ${CONSTRAINTS.NAME_MAX_LENGTH} chars`,
  DESC_LENGTH: `Provide clear descriptions within ${CONSTRAINTS.DESCRIPTION_MAX_LENGTH} chars`,
  NOTE_LENGTH: `Write focused notes up to ${CONSTRAINTS.NOTE_MAX_LENGTH} chars each`,
  REASONING_LENGTH: `Document reasoning clearly within ${CONSTRAINTS.REASONING_MAX_LENGTH} chars`,
  DEPENDENCIES_SIZE: `Maintain up to ${CONSTRAINTS.MAX_DEPENDENCIES} dependencies`,
  NOTES_SIZE: `Track progress with up to ${CONSTRAINTS.MAX_NOTES} notes`,
  METADATA_LENGTH: `Keep metadata fields within ${CONSTRAINTS.METADATA_STRING_MAX_LENGTH} chars`,
  METADATA_ARRAY: `Use up to ${CONSTRAINTS.MAX_ARRAY_ITEMS} items for categorization`,
};

/** Creates a new task with path-based hierarchy */
export const createTaskSchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description:
        'Hierarchical task path (e.g., "project/backend/auth"). Organizes related tasks.\n' +
        `${VALIDATION_MESSAGES.PATH_FORMAT}\n${VALIDATION_MESSAGES.PATH_DEPTH}`,
      pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$',
      maxLength: CONSTRAINTS.MAX_PATH_DEPTH * 50,
    },
    name: {
      type: 'string',
      description:
        'Action-oriented task name (e.g., "Implement JWT auth").\n' +
        `${VALIDATION_MESSAGES.NAME_LENGTH}`,
      maxLength: CONSTRAINTS.NAME_MAX_LENGTH,
    },
    parentPath: {
      type: 'string',
      description: 'Parent task path. Parent should be a MILESTONE.\nExample: "project/backend"',
    },
    description: {
      type: 'string',
      description:
        'Task details including:\n' +
        '- Objective and context\n' +
        '- Technical requirements\n' +
        '- Success criteria\n' +
        `${VALIDATION_MESSAGES.DESC_LENGTH}`,
      maxLength: CONSTRAINTS.DESCRIPTION_MAX_LENGTH,
    },
    type: {
      type: 'string',
      enum: ['TASK', 'MILESTONE'],
      description:
        'Task Classification:\n' +
        '• MILESTONE: Groups related tasks (e.g., "Backend Development")\n' +
        '• TASK: Concrete work item (e.g., "Implement JWT")',
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$',
      },
      maxItems: CONSTRAINTS.MAX_DEPENDENCIES,
      description:
        'Required tasks that must complete first.\n' +
        'Example: ["project/backend/database", "project/shared/config"]\n' +
        `${VALIDATION_MESSAGES.DEPENDENCIES_SIZE}`,
      uniqueItems: true,
    },
    metadata: {
      type: 'object',
      properties: {
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Task urgency and impact level',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          maxItems: CONSTRAINTS.MAX_ARRAY_ITEMS,
          description:
            'Keywords for categorization (e.g., ["api", "security"])\n' +
            `${VALIDATION_MESSAGES.METADATA_ARRAY}`,
          uniqueItems: true,
        },
        assignee: {
          type: 'string',
          description: 'System/component responsible for the task',
        },
        reasoning: {
          type: 'string',
          description:
            'LLM reasoning about task decisions and approach\n' +
            `${VALIDATION_MESSAGES.REASONING_LENGTH}`,
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
            'Progress tracking and decision notes\n' +
            `${VALIDATION_MESSAGES.NOTES_SIZE}\n${VALIDATION_MESSAGES.NOTE_LENGTH}`,
        },
      },
      description:
        'Additional task context for:\n' +
        '- Organization (priority, tags, assignee)\n' +
        '- Progress tracking (notes)\n' +
        '- Decision history (reasoning)',
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
      description: 'Path of task to update',
    },
    updates: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: `Updated task name\n${VALIDATION_MESSAGES.NAME_LENGTH}`,
          maxLength: CONSTRAINTS.NAME_MAX_LENGTH,
        },
        description: {
          type: 'string',
          description: `Updated task details\n${VALIDATION_MESSAGES.DESC_LENGTH}`,
          maxLength: CONSTRAINTS.DESCRIPTION_MAX_LENGTH,
        },
        type: {
          type: 'string',
          enum: ['TASK', 'MILESTONE'],
          description:
            'Task type:\n' +
            '• MILESTONE: For organizing related tasks\n' +
            '• TASK: For specific work items',
        },
        status: {
          type: 'string',
          enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
          description:
            'Task Status Flow:\n' +
            '• PENDING → IN_PROGRESS/BLOCKED\n' +
            '• IN_PROGRESS → COMPLETED/BLOCKED\n' +
            '• BLOCKED → PENDING/IN_PROGRESS\n' +
            '• COMPLETED (from IN_PROGRESS only)',
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$',
          },
          maxItems: CONSTRAINTS.MAX_DEPENDENCIES,
          description: 'Updated task dependencies\n' + `${VALIDATION_MESSAGES.DEPENDENCIES_SIZE}`,
          uniqueItems: true,
        },
        metadata: {
          type: 'object',
          properties: {
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Updated task priority',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              maxItems: CONSTRAINTS.MAX_ARRAY_ITEMS,
              description: `Updated categorization tags\n${VALIDATION_MESSAGES.METADATA_ARRAY}`,
              uniqueItems: true,
            },
            assignee: {
              type: 'string',
              description: 'Updated system/component assignment',
            },
            reasoning: {
              type: 'string',
              description: `Update reasoning\n${VALIDATION_MESSAGES.REASONING_LENGTH}`,
              maxLength: CONSTRAINTS.REASONING_MAX_LENGTH,
            },
            notes: {
              type: 'array',
              items: {
                type: 'string',
                maxLength: CONSTRAINTS.NOTE_MAX_LENGTH,
              },
              maxItems: CONSTRAINTS.MAX_NOTES,
              description: `Progress notes\n${VALIDATION_MESSAGES.NOTES_SIZE}\n${VALIDATION_MESSAGES.NOTE_LENGTH}`,
            },
          },
          description: 'Updated task metadata',
        },
      },
      description:
        'Fields to update with automatic:\n' +
        '- Dependency validation\n' +
        '- Status propagation\n' +
        '- Task blocking',
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
      description: 'Filter tasks by execution state',
    },
    pathPattern: {
      type: 'string',
      description: 'Optional glob pattern to filter by path (e.g., "server/api/*")',
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
      description: 'Glob pattern to match task paths (e.g., "server/*/security/*")',
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
      description: 'Parent task path to list immediate children',
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
      description: 'Task path to remove',
    },
    strategy: {
      type: 'string',
      enum: ['cascade', 'block'],
      description:
        'Deletion strategy:\n' +
        '• cascade: Remove all child tasks\n' +
        '• block: Prevent if has children',
      default: 'block',
    },
  },
  required: ['path'],
};

/** Clears all tasks */
export const clearAllTasksSchema = {
  type: 'object',
  properties: {
    confirm: {
      type: 'boolean',
      description: 'Confirmation to clear all tasks',
    },
  },
  required: ['confirm'],
};

/** Optimizes database */
export const vacuumDatabaseSchema = {
  type: 'object',
  properties: {
    analyze: {
      type: 'boolean',
      description: 'Run analysis phase for query optimization',
      default: true,
    },
  },
  required: [],
};

/** Repairs task relationships */
export const repairRelationshipsSchema = {
  type: 'object',
  properties: {
    dryRun: {
      type: 'boolean',
      description: 'Preview changes without applying',
      default: false,
    },
    pathPattern: {
      type: 'string',
      description: 'Optional pattern to focus repairs (e.g., "project/*")',
    },
  },
  required: [],
};

/** Bulk task operations */
export const bulkTaskSchema = {
  type: 'object',
  properties: {
    operations: {
      type: 'array',
      description:
        'Atomic operations executed in dependency order.\n' +
        'Example:\n' +
        '{\n' +
        '  "operations": [\n' +
        '    {\n' +
        '      "type": "create",\n' +
        '      "path": "project/backend/database",\n' +
        '      "data": { "name": "Database Setup" }\n' +
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
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['create', 'update', 'delete'],
            description: 'Operation type',
          },
          path: {
            type: 'string',
            description: `Task path\n${VALIDATION_MESSAGES.PATH_FORMAT}`,
            pattern: '^[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*$',
            maxLength: CONSTRAINTS.MAX_PATH_DEPTH * 50,
          },
          data: {
            type: 'object',
            description: 'Operation data (create/update fields or delete options)',
          },
        },
        required: ['type', 'path'],
      },
    },
  },
  required: ['operations'],
};
