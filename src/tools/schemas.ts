/**
 * Tool schemas and input types for Atlas MCP Server
 * Defines the structure and validation for tool inputs
 */
import { TaskStatus } from '../types.js';

/**
 * Schema for task creation input
 */
export const createTaskSchema = {
    type: 'object',
    properties: {
        parentId: {
            type: ['string', 'null'],
            description: 'ID of the parent task, or null for root tasks. Use this for creating hierarchical task structures.',
        },
        name: {
            type: 'string',
            description: 'Name of the task (max 200 characters)',
        },
        description: {
            type: 'string',
            description: 'Description of the task (max 2000 characters)',
        },
        notes: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['text', 'code', 'json', 'markdown'],
                        description: 'Type of note',
                    },
                    content: {
                        type: 'string',
                        description: 'The actual note content',
                    },
                    language: {
                        type: 'string',
                        description: 'Programming language (required for code notes)',
                    },
                    metadata: {
                        type: 'object',
                        description: 'Additional metadata for the note',
                    },
                },
                required: ['type', 'content'],
            },
            description: 'Rich notes associated with the task. Supports markdown for documentation, code with syntax highlighting, and structured JSON data.',
        },
        reasoning: {
            type: 'object',
            properties: {
                approach: {
                    type: 'string',
                    description: 'High-level approach and strategy for the task'
                },
                assumptions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key assumptions made when planning the task'
                },
                alternatives: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Alternative approaches that were considered'
                },
                risks: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Potential risks and challenges'
                },
                tradeoffs: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key tradeoffs and decisions made'
                },
                constraints: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Technical or business constraints'
                },
                dependencies_rationale: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Reasoning behind task dependencies'
                },
                impact_analysis: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Analysis of task impact on system/project'
                }
            },
            description: 'Reasoning and decision-making documentation for the task'
        },
        type: {
            type: 'string',
            enum: ['task', 'milestone', 'group'],
            description: 'Type of task for organizational purposes',
        },
        dependencies: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of task IDs this task depends on',
        },
        metadata: {
            type: 'object',
            properties: {
                context: {
                    type: 'string',
                    description: 'Additional context about why this task exists',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for categorizing the task',
                }
            },
            description: 'Additional task metadata for context and organization',
        },
        subtasks: {
            type: 'array',
            items: {
                type: 'object',
                description: 'Nested subtasks to create with this task',
            }
        }
    },
    required: ['name'],
};

/**
 * Schema for bulk task creation input
 */
export const bulkCreateTasksSchema = {
    type: 'object',
    properties: {
        parentId: {
            type: ['string', 'null'],
            description: 'ID of the parent task, or null for root tasks',
        },
        tasks: {
            type: 'array',
            items: createTaskSchema,
            description: 'Array of tasks to create',
        }
    },
    required: ['tasks'],
};

/**
 * Schema for task update input
 */
export const updateTaskSchema = {
    type: 'object',
    properties: {
        taskId: {
            type: 'string',
            description: 'ID of the task to update',
        },
        updates: {
            type: 'object',
            properties: {
                name: { 
                    type: 'string',
                    description: 'New task name (max 200 characters)',
                },
                description: { 
                    type: 'string',
                    description: 'New task description (max 2000 characters)',
                },
                notes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['text', 'code', 'json', 'markdown'],
                            },
                            content: { type: 'string' },
                            language: { type: 'string' },
                            metadata: { type: 'object' },
                        },
                    },
                    description: 'Updated rich notes',
                },
                reasoning: {
                    type: 'object',
                    properties: {
                        approach: { type: 'string' },
                        assumptions: { 
                            type: 'array',
                            items: { type: 'string' }
                        },
                        alternatives: {
                            type: 'array',
                            items: { type: 'string' }
                        },
                        risks: {
                            type: 'array',
                            items: { type: 'string' }
                        },
                        tradeoffs: {
                            type: 'array',
                            items: { type: 'string' }
                        },
                        constraints: {
                            type: 'array',
                            items: { type: 'string' }
                        },
                        dependencies_rationale: {
                            type: 'array',
                            items: { type: 'string' }
                        },
                        impact_analysis: {
                            type: 'array',
                            items: { type: 'string' }
                        }
                    },
                    description: 'Updated reasoning documentation'
                },
                type: {
                    type: 'string',
                    enum: ['task', 'milestone', 'group'],
                    description: 'New task type',
                },
                status: {
                    type: 'string',
                    enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'],
                    description: 'New task status',
                },
                dependencies: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Updated dependencies',
                },
                metadata: {
                    type: 'object',
                    properties: {
                        context: { type: 'string' },
                        tags: {
                            type: 'array',
                            items: { type: 'string' }
                        }
                    },
                    description: 'Updated metadata',
                },
            },
        },
    },
    required: ['taskId', 'updates'],
};

/**
 * Schema for bulk task update input
 */
export const bulkUpdateTasksSchema = {
    type: 'object',
    properties: {
        updates: {
            type: 'array',
            items: updateTaskSchema,
            description: 'Array of task updates to apply'
        }
    },
    required: ['updates']
};

/**
 * Schema for task retrieval by status
 */
export const getTasksByStatusSchema = {
    type: 'object',
    properties: {
        status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'] as TaskStatus[],
            description: 'Status to filter tasks by',
        },
    },
    required: ['status'],
};

/**
 * Schema for task deletion
 */
export const deleteTaskSchema = {
    type: 'object',
    properties: {
        taskId: {
            type: 'string',
            description: 'ID of the task to delete',
        },
    },
    required: ['taskId'],
};

/**
 * Schema for subtask retrieval
 */
export const getSubtasksSchema = {
    type: 'object',
    properties: {
        taskId: {
            type: 'string',
            description: 'ID of the task to get subtasks for',
        },
    },
    required: ['taskId'],
};

/**
 * Schema for task tree retrieval
 */
export const getTaskTreeSchema = {
    type: 'object',
    properties: {},
};

/**
 * Schema for task visualization
 */
export const visualizeTasksSchema = {
    type: 'object',
    properties: {
        format: {
            type: 'string',
            enum: ['terminal', 'html', 'both'],
            description: 'Visualization format to generate',
            default: 'both'
        },
        outputDir: {
            type: 'string',
            description: 'Directory to save visualizations (defaults to ~/Documents/atlas-tasks/visualizations)',
        }
    },
    additionalProperties: false,
};
