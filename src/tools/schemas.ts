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
            description: 'Paths of tasks that must be completed first. Use for managing execution order and prerequisites.',
        },
        metadata: {
            type: 'object',
            properties: {
                priority: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Task urgency and impact level'
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Keywords for categorization (e.g., ["api", "security", "optimization"])'
                },
                dueDate: {
                    type: 'number',
                    description: 'Unix timestamp for completion deadline'
                },
                assignee: {
                    type: 'string',
                    description: 'System or component responsible for the task'
                },
                estimatedHours: {
                    type: 'number',
                    description: 'Estimated processing time in hours'
                },
                reasoning: {
                    type: 'string',
                    description: 'LLM reasoning about task creation, importance, and approach'
                },
                notes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Additional context, observations, and planning notes'
                }
            },
            description: 'Additional task context and tracking information.',
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
                    description: 'Updated task dependencies based on discovered requirements.',
                },
                metadata: {
                    type: 'object',
                    properties: {
                        priority: {
                            type: 'string',
                            enum: ['low', 'medium', 'high'],
                            description: 'Adjusted priority based on current context'
                        },
                        tags: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Updated categorization tags'
                        },
                        dueDate: {
                            type: 'number',
                            description: 'Adjusted completion deadline'
                        },
                        assignee: {
                            type: 'string',
                            description: 'Updated system/component assignment'
                        },
                        estimatedHours: {
                            type: 'number',
                            description: 'Refined time estimate'
                        },
                        actualHours: {
                            type: 'number',
                            description: 'Actual processing time spent'
                        },
                        reasoning: {
                            type: 'string',
                            description: 'Updated LLM reasoning about task progress and changes'
                        },
                        notes: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Additional observations and progress notes'
                        }
                    },
                    description: 'Updated task metadata reflecting current state and understanding.',
                },
            },
            description: 'Fields to update. Only specified fields will be modified.',
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
                                   '- create: Full task definition including context\n' +
                                   '- update: Fields to modify with reasoning\n' +
                                   '- delete: Optional deletion context'
                    },
                },
                required: ['type', 'path'],
            },
        },
    },
    required: ['operations'],
};
