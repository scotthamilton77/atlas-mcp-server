/**
 * Tool schemas and input types for Atlas MCP Server
 * Defines the structure and validation for tool inputs
 */
import { TaskStatus } from '../types.js';

/** Creates a new task. IMPORTANT: Requires an active session and task list - use create_session and create_task_list first if you haven't already. Tasks represent individual work items within a task list. */
export const createTaskSchema = {
    type: 'object',
    properties: {
        parentId: {
            type: ['string', 'null'],
            description: 'ID of the parent task, or null for root tasks. Use this for creating hierarchical task structures. Best practice: Keep hierarchies shallow (max 3-4 levels) for better maintainability.',
        },
        name: {
            type: 'string',
            description: 'Name of the task (max 200 characters). Best practice: Use clear, action-oriented names that describe the outcome (e.g., "Implement user authentication" rather than "Auth work").',
        },
        description: {
            type: 'string',
            description: 'Description of the task (max 2000 characters). Best practice: Include context, acceptance criteria, and any technical considerations. Use markdown for better formatting.',
        },
        notes: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['text', 'code', 'json', 'markdown'],
                        description: 'Type of note. Best practice: Use markdown for documentation, code for examples/snippets, and JSON for structured data.',
                    },
                    content: {
                        type: 'string',
                        description: 'The actual note content. Best practice: Keep code snippets focused and well-commented. Include context for future reference.',
                    },
                    language: {
                        type: 'string',
                        description: 'Programming language for syntax highlighting in code notes. Use standard identifiers (e.g., "typescript", "python").',
                    },
                    metadata: {
                        type: 'object',
                        description: 'Additional metadata for the note. Use for version info, references, or related resources.',
                    },
                },
                required: ['type', 'content'],
            },
            description: 'Rich notes associated with the task. Best practice: Use a combination of note types - markdown for documentation, code for examples, and JSON for structured data.',
        },
        reasoning: {
            type: 'object',
            properties: {
                approach: {
                    type: 'string',
                    description: 'High-level approach and strategy. Best practice: Explain the "why" behind technical decisions and architectural choices.'
                },
                assumptions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key assumptions made when planning. Best practice: Document all non-obvious assumptions that could affect implementation.'
                },
                alternatives: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Alternative approaches considered. Best practice: Include pros/cons of each alternative to explain decision-making.'
                },
                risks: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Potential risks and challenges. Best practice: Include both technical risks and potential business impacts.'
                },
                tradeoffs: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Key tradeoffs and decisions. Best practice: Explain what was gained and what was given up with each decision.'
                },
                constraints: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Technical or business constraints. Best practice: Document both hard constraints (must-have) and soft constraints (preferences).'
                },
                dependencies_rationale: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Reasoning behind task dependencies. Best practice: Explain why each dependency is necessary and how it affects the task.'
                },
                impact_analysis: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Analysis of task impact. Best practice: Consider performance, security, maintainability, and user experience impacts.'
                }
            },
            description: 'Reasoning and decision-making documentation. Best practice: Keep this documentation up-to-date as decisions evolve.'
        },
        type: {
            type: 'string',
            enum: ['task', 'milestone', 'group'],
            description: 'Type of task. Best practice: Use "milestone" for major deliverables, "group" for organizing related tasks, and "task" for concrete work items.',
        },
            dependencies: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of task IDs this task depends on. IMPORTANT: Must use actual task IDs (e.g., "xK7cPq2Z"), not task names. Best practices:\n' +
                           '1. Keep dependencies minimal and explicit\n' +
                           '2. Store task IDs when creating tasks for later reference\n' +
                           '3. Use get_task_tree to view all task IDs and relationships\n' +
                           '4. Consider using task groups for better organization',
            },
        metadata: {
            type: 'object',
            properties: {
                context: {
                    type: 'string',
                    description: 'Additional context about task purpose. Best practice: Include links to relevant documentation, discussions, or requirements.',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for categorization. Best practice: Use consistent naming conventions for tags (e.g., "feature:", "tech:", "priority:").',
                }
            },
            description: 'Additional task metadata. Best practice: Use for cross-cutting concerns and categorization.',
        },
        subtasks: {
            type: 'array',
            items: {
                type: 'object',
                description: 'Nested subtasks. Best practice: Break down complex tasks into manageable pieces, but avoid deep nesting.',
            }
        }
    },
    required: ['name'],
};

/** Creates multiple tasks at once. IMPORTANT: Requires an active session and task list - use create_session and create_task_list first if you haven't already. 

Best Practices:
1. Use this for efficiently creating related tasks in bulk instead of individual create_task calls
2. Group related tasks together to minimize transaction overhead
3. Keep track of returned task IDs for setting up dependencies
4. Consider task relationships and hierarchy when organizing bulk creation
*/
export const bulkCreateTasksSchema = {
    type: 'object',
    properties: {
        parentId: {
            type: ['string', 'null'],
            description: 'ID of the parent task. Best practice: Use for creating related tasks under a common parent.',
        },
        tasks: {
            type: 'array',
            items: createTaskSchema,
            description: 'Array of tasks to create. Best practice: Group related tasks together and maintain consistent structure.',
        }
    },
    required: ['tasks'],
};

/** Updates an existing task. IMPORTANT: Requires an active session - ensure you have created or switched to the appropriate session. */
export const updateTaskSchema = {
    type: 'object',
    properties: {
        taskId: {
            type: 'string',
            description: 'ID of the task to update. Best practice: Verify task exists before updating.',
        },
        updates: {
            type: 'object',
            properties: {
                name: { 
                    type: 'string',
                    description: 'New task name. Best practice: Maintain naming consistency within task groups.',
                },
                description: { 
                    type: 'string',
                    description: 'New description. Best practice: Document significant changes in the description.',
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
                    description: 'Updated notes. Best practice: Append new notes rather than replacing all existing ones.',
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
                    description: 'Updated reasoning. Best practice: Document why changes were made.',
                },
                type: {
                    type: 'string',
                    enum: ['task', 'milestone', 'group'],
                    description: 'New task type. Best practice: Only change type if task scope fundamentally changes.',
                },
                status: {
                    type: 'string',
                    enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'],
                    description: 'New status. Best practice: Update dependencies when marking tasks as blocked.',
                },
                dependencies: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Updated dependencies. Best practice: Review impact on dependent tasks before updating.',
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
                    description: 'Updated metadata. Best practice: Maintain tag consistency across updates.',
                },
            },
        },
    },
    required: ['taskId', 'updates'],
};

/** Updates multiple tasks at once. IMPORTANT: Requires an active session - ensure you have created or switched to the appropriate session. 

Best Practices:
1. Use this for efficiently updating related tasks in bulk instead of individual update_task calls
2. Group all related updates into a single bulk_update_tasks call to avoid transaction conflicts
3. Ensure all task IDs are valid 8-character alphanumeric strings
4. Consider dependencies and task relationships when planning updates
5. Use get_task_tree to verify task IDs and relationships before updating
*/
export const bulkUpdateTasksSchema = {
    type: 'object',
    properties: {
        updates: {
            type: 'array',
            items: updateTaskSchema,
            description: 'Array of updates. Best practice: Group related updates together and consider dependency order.',
        }
    },
    required: ['updates']
};

/** Retrieves tasks filtered by status. IMPORTANT: Requires an active session - ensure you have created or switched to the appropriate session before querying tasks. */
export const getTasksByStatusSchema = {
    type: 'object',
    properties: {
        status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'] as TaskStatus[],
            description: 'Status filter. Best practice: Use for progress tracking and identifying bottlenecks.',
        },
        sessionId: {
            type: 'string',
            description: 'Optional session ID to filter by. If not provided, uses active session.',
        },
        taskListId: {
            type: 'string',
            description: 'Optional task list ID to filter by. If not provided, uses active task list.',
        }
    },
    required: ['status'],
};

/** Deletes a task. IMPORTANT: Requires an active session - ensure you have created or switched to the appropriate session before deleting tasks. */
export const deleteTaskSchema = {
    type: 'object',
    properties: {
        taskId: {
            type: 'string',
            description: 'Task ID to delete. Best practice: Check for dependent tasks before deletion.',
        },
    },
    required: ['taskId'],
};

/** Retrieves subtasks of a task. IMPORTANT: Requires an active session - ensure you have created or switched to the appropriate session before querying tasks. */
export const getSubtasksSchema = {
    type: 'object',
    properties: {
        taskId: {
            type: 'string',
            description: 'Parent task ID. Best practice: Use for progress tracking and dependency management.',
        },
        sessionId: {
            type: 'string',
            description: 'Optional session ID to filter by. If not provided, uses parent task\'s session.',
        },
        taskListId: {
            type: 'string',
            description: 'Optional task list ID to filter by. If not provided, uses parent task\'s task list.',
        }
    },
    required: ['taskId'],
};

/** Retrieves the complete task hierarchy. IMPORTANT: Requires an active session - ensure you have created or switched to the appropriate session before querying the task tree. Best practice: Use frequently to maintain awareness of all tasks, their relationships, and current progress. Regular checks help keep the full task context fresh in memory and ensure proper task management. */
export const getTaskTreeSchema = {
    type: 'object',
    properties: {
        sessionId: {
            type: 'string',
            description: 'Optional session ID to filter tasks by. If not provided, uses the active session.',
        },
        taskListId: {
            type: 'string',
            description: 'Optional task list ID to filter tasks by. If not provided, uses the active task list.',
        }
    },
    description: 'Retrieves complete task hierarchy with optional session and task list filtering. Best practice: Use frequently to maintain awareness of all tasks, their relationships, and current progress.',
};
