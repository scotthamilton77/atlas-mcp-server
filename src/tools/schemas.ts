/**
 * Path-based task management schemas for LLM agents
 */
import { TaskStatus } from '../types/task.js';

/** Creates a new task with path-based hierarchy */
export const createTaskSchema = {
    type: 'object',
    properties: {
        path: {
            type: 'string',
            description: 'Hierarchical task path (e.g., "server/api/authentication"). Use paths to organize related tasks.',
        },
        name: {
            type: 'string',
            description: 'Clear, action-oriented task name (e.g., "Implement JWT authentication", "Refactor database queries").',
        },
        parentPath: {
            type: 'string',
            description: 'Path of the parent task. Use to build hierarchical workflows and break down complex tasks.',
        },
        description: {
            type: 'string',
            description: 'Detailed task description including:\n' +
                        '- Objective: What needs to be accomplished\n' +
                        '- Context: Why this task is needed\n' +
                        '- Technical details: Implementation considerations\n' +
                        '- Success criteria: How to verify completion',
        },
        type: {
            type: 'string',
            enum: ['task', 'milestone', 'group'],
            description: 'Task categorization:\n' +
                        '- milestone: Major completion point requiring all subtasks to be done\n' +
                        '- group: Collection of related tasks that can be partially completed\n' +
                        '- task: Individual actionable item',
        },
        dependencies: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths of tasks that must be completed first. Tasks will be automatically blocked if dependencies are not met. Dependencies can be specified here (recommended) or in metadata.dependencies (legacy).',
        },
        metadata: {
            type: 'object',
            properties: {
                priority: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Task urgency and impact level. Affects task ordering and scheduling.'
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Keywords for categorization and filtering (e.g., ["api", "security", "optimization"]). Used in path pattern matching.'
                },
                assignee: {
                    type: 'string',
                    description: 'System or component responsible for the task. Used for task distribution and filtering.'
                },
                reasoning: {
                    type: 'string',
                    description: 'LLM reasoning about task decisions, importance, and approach. Provides context for status changes and dependencies.'
                },
                notes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Additional context, observations, and planning notes. Used to track progress and document decisions.'
                }
            },
            description: 'Additional task context and tracking information. Fields affect:\n' +
                        '- Task organization (priority, tags, assignee)\n' +
                        '- Progress tracking (notes)\n' +
                        '- Decision history (reasoning)\n\n' +
                        'Note: dependencies in metadata.dependencies will be migrated to the main dependencies array.',
        }
    },
    required: ['name'],
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
                    description: 'Updated task name with current action focus.',
                },
                description: {
                    type: 'string',
                    description: 'Updated description with latest context, findings, and next steps.',
                },
                type: {
                    type: 'string',
                    enum: ['task', 'milestone', 'group'],
                    description: 'Updated task categorization based on current understanding.',
                },
                status: {
                    type: 'string',
                    enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'],
                    description: 'Current execution state:\n' +
                               '- pending: Not yet started\n' +
                               '- in_progress: Currently being processed\n' +
                               '- completed: Successfully finished\n' +
                               '- failed: Encountered unresolvable issues\n' +
                               '- blocked: Waiting on dependencies or external factors',
                },
                dependencies: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Updated task dependencies. Tasks will be automatically blocked if new dependencies are not met. Status changes propagate through dependency chain.',
                },
                metadata: {
                    type: 'object',
                    properties: {
                        priority: {
                            type: 'string',
                            enum: ['low', 'medium', 'high'],
                            description: 'Task urgency and impact level. Affects task ordering and scheduling.'
                        },
                        tags: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Keywords for categorization and filtering (e.g., ["api", "security", "optimization"]). Used in path pattern matching.'
                        },
                        assignee: {
                            type: 'string',
                            description: 'Updated system/component assignment'
                        },
                        reasoning: {
                            type: 'string',
                            description: 'LLM reasoning about task decisions, importance, and approach. Provides context for status changes and dependencies.'
                        },
                        notes: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Additional context, observations, and planning notes. Used to track progress and document decisions.'
                        }
                    },
                    description: 'Task metadata fields affect:\n' +
                                '- Task organization (priority, tags, assignee)\n' +
                                '- Progress tracking (notes)\n' +
                                '- Decision history (reasoning)',
                },
            },
            description: 'Fields to update. Available fields:\n' +
                        '- name: Update task name\n' +
                        '- description: Update task details\n' +
                        '- type: Change task type (task/milestone/group)\n' +
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
            enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'] as TaskStatus[],
            description: 'Filter tasks by their execution state. Use to find tasks needing attention or verify completion.',
        },
        pathPattern: {
            type: 'string',
            description: 'Optional glob pattern to filter by path (e.g., "server/api/*"). Use to focus on specific subsystems.',
        }
    },
    required: ['status'],
};

/** Gets tasks by path pattern */
export const getTasksByPathSchema = {
    type: 'object',
    properties: {
        pathPattern: {
            type: 'string',
            description: 'Glob pattern to match task paths. Use to analyze specific areas of work (e.g., "server/*/security/*").',
        }
    },
    required: ['pathPattern'],
};

/** Gets subtasks of a task */
export const getSubtasksSchema = {
    type: 'object',
    properties: {
        path: {
            type: 'string',
            description: 'Parent task path. Returns immediate subtasks to analyze task breakdown and progress.',
        }
    },
    required: ['path'],
};

/** Deletes a task */
export const deleteTaskSchema = {
    type: 'object',
    properties: {
        path: {
            type: 'string',
            description: 'Task path to delete. Will recursively remove all subtasks. Use with caution.',
        }
    },
    required: ['path'],
};

/** Bulk task operations */
export const bulkTaskSchema = {
    type: 'object',
    properties: {
        operations: {
            type: 'array',
            description: 'Sequence of atomic task operations. Use for coordinated updates and maintaining task relationships.',
            items: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['create', 'update', 'delete'],
                        description: 'Operation type:\n' +
                                   '- create: Add new task with full context\n' +
                                   '- update: Modify task with latest findings\n' +
                                   '- delete: Remove completed or obsolete task'
                    },
                    path: {
                        type: 'string',
                        description: 'Task path for the operation. For create, this sets the desired hierarchy.'
                    },
                    data: {
                        type: 'object',
                        description: 'Operation-specific data:\n' +
                                   '- create: Full task definition including dependencies and context\n' +
                                   '- update: Fields to modify including status and dependencies\n' +
                                   '- delete: Optional deletion context\n\n' +
                                   'Dependency handling:\n' +
                                   '- Dependencies are validated across all operations\n' +
                                   '- Status changes respect dependency constraints\n' +
                                   '- Circular dependencies are prevented\n' +
                                   '- Failed operations trigger rollback'
                    },
                },
                required: ['type', 'path'],
            },
        },
    },
    required: ['operations'],
};
