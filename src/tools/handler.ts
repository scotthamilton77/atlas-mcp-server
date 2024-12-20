/**
 * Tool Handler
 * Manages MCP tool registration and execution
 */

import { TaskManager } from '../task-manager.js';
import {
    TaskStatus,
    TaskType,
    CreateTaskInput,
    BulkCreateTaskInput,
    BulkUpdateTasksInput,
    UpdateTaskInput,
    Task,
    TaskNote
} from '../types/task.js';
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';
import {
    createTaskSchema,
    bulkCreateTasksSchema,
    updateTaskSchema,
    bulkUpdateTasksSchema,
    getTasksByStatusSchema,
    deleteTaskSchema,
    getSubtasksSchema,
    getTaskTreeSchema
} from './schemas.js';

export interface Tool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface ToolResponse {
    content: Array<{
        type: string;
        text: string;
    }>;
}

export class ToolHandler {
    private logger: Logger;
    private tools: Map<string, Tool> = new Map();
    private toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<ToolResponse>> = new Map();

    constructor(private taskManager: TaskManager) {
        this.logger = Logger.getInstance().child({ component: 'ToolHandler' });
        this.registerDefaultTools();
    }

    /**
     * Registers default task management tools
     */
    private registerDefaultTools(): void {
        const defaultTools = [
            {
                name: 'create_task',
                description: `Creates a new task

Parameters:
- parentId: ID of the parent task, or null for root tasks. Use this for creating hierarchical task structures. Best practice: Keep hierarchies shallow (max 3-4 levels) for better maintainability.
- name*: Name of the task (max 200 characters). Best practice: Use clear, action-oriented names that describe the outcome (e.g., "Implement user authentication" rather than "Auth work").
- description: Description of the task (max 2000 characters). Best practice: Include context, acceptance criteria, and any technical considerations. Use markdown for better formatting.
- notes: Rich notes associated with the task. Best practice: Use a combination of note types - markdown for documentation, code for examples, and JSON for structured data.
- reasoning: Reasoning and decision-making documentation. Best practice: Keep this documentation up-to-date as decisions evolve.
- type: Type of task. Best practice: Use "milestone" for major deliverables, "group" for organizing related tasks, and "task" for concrete work items.
- dependencies: List of task IDs this task depends on. Best practice: Keep dependencies minimal and explicit. Consider using task groups for better organization.
- metadata: Additional task metadata. Best practice: Use for cross-cutting concerns and categorization.
- subtasks: Nested subtasks for breaking down work items.`,
                inputSchema: createTaskSchema,
                handler: async (args: Record<string, unknown>) => {
                    const input = this.validateCreateTaskInput(args);
                    const parentId = input.parentId || null;
                    delete input.parentId; // Remove from input since it's passed separately
                    const result = await this.taskManager.createTask(parentId, input, false);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'bulk_create_tasks',
                description: `Creates multiple tasks at once

Parameters:
- parentId: ID of the parent task. Best practice: Use for creating related tasks under a common parent.
- tasks*: Array of tasks to create. Best practice: Group related tasks together and maintain consistent structure.`,
                inputSchema: bulkCreateTasksSchema,
                handler: async (args: Record<string, unknown>) => {
                    const input = this.validateBulkCreateTaskInput(args);
                    const result = await this.taskManager.bulkCreateTasks(input);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'update_task',
                description: `Updates an existing task

Parameters:
- taskId*: ID of the task to update. Best practice: Verify task exists before updating.
- updates*: Updates to apply to the task.`,
                inputSchema: updateTaskSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.taskId || typeof args.taskId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid taskId'
                        );
                    }
                    const updates = this.validateUpdateTaskInput(args.updates as Record<string, unknown>);
                    const result = await this.taskManager.updateTask(args.taskId, updates);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'bulk_update_tasks',
                description: `Updates multiple tasks at once

Parameters:
- updates*: Array of updates. Best practice: Group related updates together and consider dependency order.`,
                inputSchema: bulkUpdateTasksSchema,
                handler: async (args: Record<string, unknown>) => {
                    const input = this.validateBulkUpdateTaskInput(args);
                    const result = await this.taskManager.bulkUpdateTasks(input);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'get_tasks_by_status',
                description: `Retrieves tasks filtered by status

Parameters:
- status*: Status filter. Best practice: Use for progress tracking and identifying bottlenecks.`,
                inputSchema: getTasksByStatusSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.status || !Object.values(TaskStatus).includes(args.status as TaskStatus)) {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Invalid task status'
                        );
                    }
                    const result = await this.taskManager.getTasksByStatus(args.status as TaskStatus);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'delete_task',
                description: `Deletes a task

Parameters:
- taskId*: Task ID to delete. Best practice: Check for dependent tasks before deletion.`,
                inputSchema: deleteTaskSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.taskId || typeof args.taskId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid taskId'
                        );
                    }
                    const result = await this.taskManager.deleteTask(args.taskId);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'get_subtasks',
                description: `Retrieves subtasks of a task

Parameters:
- taskId*: Parent task ID. Best practice: Use for progress tracking and dependency management.`,
                inputSchema: getSubtasksSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.taskId || typeof args.taskId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid taskId'
                        );
                    }
                    const result = await this.taskManager.getSubtasks(args.taskId);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'get_task_tree',
                description: 'Retrieves the complete task hierarchy. Best practice: Use for visualization and dependency analysis.',
                inputSchema: getTaskTreeSchema,
                handler: async () => {
                    const result = await this.taskManager.getTaskTree();
                    return this.formatResponse(result);
                }
            }
        ];

        for (const tool of defaultTools) {
            this.registerTool(tool);
        }
    }

    /**
     * Validates create task input
     */
    private validateCreateTaskInput(args: Record<string, unknown>): CreateTaskInput {
        if (!args.name || typeof args.name !== 'string') {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Missing or invalid task name'
            );
        }

        return {
            name: args.name,
            description: args.description as string | undefined,
            type: args.type as TaskType | undefined,
            parentId: args.parentId as string | null | undefined,
            dependencies: (args.dependencies as string[]) || [],
            metadata: args.metadata as Record<string, unknown> | undefined,
            notes: this.validateNotes(args.notes),
            reasoning: args.reasoning as Task['reasoning']
        };
    }

    /**
     * Validates task notes
     */
    private validateNotes(notes: unknown): TaskNote[] | undefined {
        if (!notes) return undefined;
        if (!Array.isArray(notes)) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Notes must be an array'
            );
        }
        return notes as TaskNote[];
    }

    /**
     * Validates update task input
     */
    private validateUpdateTaskInput(args: Record<string, unknown>): UpdateTaskInput {
        const updates: UpdateTaskInput = {};

        if (args.name !== undefined) updates.name = args.name as string;
        if (args.description !== undefined) updates.description = args.description as string;
        if (args.type !== undefined) updates.type = args.type as TaskType;
        if (args.status !== undefined) updates.status = args.status as TaskStatus;
        if (args.dependencies !== undefined) updates.dependencies = args.dependencies as string[];
        if (args.metadata !== undefined) {
            updates.metadata = args.metadata as {
                context?: string;
                tags?: string[];
                [key: string]: unknown;
            };
        }
        if (args.notes !== undefined) updates.notes = this.validateNotes(args.notes);
        if (args.reasoning !== undefined) updates.reasoning = args.reasoning as Task['reasoning'];

        return updates;
    }

    /**
     * Validates bulk create task input
     */
    private validateBulkCreateTaskInput(args: Record<string, unknown>): BulkCreateTaskInput {
        if (!args.tasks || !Array.isArray(args.tasks)) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Missing or invalid tasks array'
            );
        }

        return {
            parentId: args.parentId as string | null,
            tasks: args.tasks.map(task => this.validateCreateTaskInput(task as Record<string, unknown>))
        };
    }

    /**
     * Validates bulk update task input
     */
    private validateBulkUpdateTaskInput(args: Record<string, unknown>): BulkUpdateTasksInput {
        if (!args.updates || !Array.isArray(args.updates)) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Missing or invalid updates array'
            );
        }

        return {
            updates: args.updates.map(update => {
                if (!update || typeof update !== 'object' || !('taskId' in update)) {
                    throw createError(
                        ErrorCodes.INVALID_INPUT,
                        'Invalid update object'
                    );
                }
                return {
                    taskId: update.taskId as string,
                    updates: this.validateUpdateTaskInput(update.updates as Record<string, unknown>)
                };
            })
        };
    }

    /**
     * Formats a response into the standard tool response format
     */
    private formatResponse(result: unknown): ToolResponse {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
            }]
        };
    }

    /**
     * Registers a tool
     */
    private registerTool(tool: Tool & { handler: (args: Record<string, unknown>) => Promise<ToolResponse> }): void {
        const { handler, ...toolDef } = tool;
        this.tools.set(tool.name, toolDef);
        this.toolHandlers.set(tool.name, handler);
    }

    /**
     * Adds additional tools to the handler
     */
    addTools(tools: Tool[], handler?: (name: string, args: Record<string, unknown>) => Promise<ToolResponse>): void {
        for (const tool of tools) {
            if (this.tools.has(tool.name)) {
                this.logger.warn(`Tool ${tool.name} already registered, skipping`);
                continue;
            }
            this.tools.set(tool.name, tool);
            if (handler) {
                this.toolHandlers.set(tool.name, (args) => handler(tool.name, args));
            }
        }
    }

    /**
     * Lists all available tools
     */
    async listTools(): Promise<{ tools: Tool[] }> {
        return {
            tools: Array.from(this.tools.values())
        };
    }

    /**
     * Handles a tool call
     */
    async handleToolCall(request: { params: { name: string; arguments?: Record<string, unknown> } }): Promise<{
        _meta?: Record<string, unknown>;
        content: Array<{ type: string; text: string }>;
    }> {
        const { name, arguments: args = {} } = request.params;

        const tool = this.tools.get(name);
        if (!tool) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                { tool: name },
                'Unknown tool'
            );
        }

        const handler = this.toolHandlers.get(name);
        if (!handler) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                { tool: name },
                'Tool handler not found'
            );
        }

        try {
            const result = await handler(args);
            return {
                _meta: {},
                ...result
            };
        } catch (error) {
            this.logger.error('Tool execution failed', {
                tool: name,
                error
            });
            throw error;
        }
    }
}
