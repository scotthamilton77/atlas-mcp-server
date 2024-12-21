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

import {
    createSessionSchema,
    createTaskListSchema,
    switchSessionSchema,
    switchTaskListSchema,
    listSessionsSchema,
    listTaskListsSchema,
    archiveSessionSchema,
    archiveTaskListSchema
} from './session-schemas.js';

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
                name: 'create_session',
                description: 'Creates a new session for task management. Features:\n' +
                           '- Isolated task context\n' +
                           '- Multi-list support\n' +
                           '- Session-level metadata\n\n' +
                           'IMPORTANT: Must be called first before any task operations.',
                inputSchema: createSessionSchema,
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.createSession(args as any);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'create_task_list',
                description: 'Creates a new task list in the current session. Features:\n' +
                           '- Supports milestone and group hierarchies\n' +
                           '- Optional persistence across sessions\n' +
                           '- List-level metadata and organization\n\n' +
                           'IMPORTANT: Requires active session.',
                inputSchema: createTaskListSchema,
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.createTaskList(args as any);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'switch_session',
                description: 'Switches to a different session. Features:\n' +
                           '- Preserves task list context\n' +
                           '- Validates session existence\n' +
                           '- Updates active state\n\n' +
                           'IMPORTANT: Save any pending changes before switching.',
                inputSchema: switchSessionSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.sessionId || typeof args.sessionId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid sessionId'
                        );
                    }
                    await this.taskManager.switchSession(args.sessionId);
                    return this.formatResponse({ success: true });
                }
            },
            {
                name: 'switch_task_list',
                description: 'Switches to a different task list. Features:\n' +
                           '- Preserves session context\n' +
                           '- Validates task list existence\n' +
                           '- Updates active state\n\n' +
                           'IMPORTANT: Requires active session.',
                inputSchema: switchTaskListSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.taskListId || typeof args.taskListId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid taskListId'
                        );
                    }
                    await this.taskManager.switchTaskList(args.taskListId);
                    return this.formatResponse({ success: true });
                }
            },
            {
                name: 'list_sessions',
                description: 'Lists all available sessions. Features:\n' +
                           '- Optional archived session inclusion\n' +
                           '- Session metadata and status\n' +
                           '- Active session indication\n\n' +
                           'Use for session management and auditing.',
                inputSchema: listSessionsSchema,
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.listSessions(args.includeArchived as boolean);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'list_task_lists',
                description: 'Lists all task lists in current session. Features:\n' +
                           '- Optional archived list inclusion\n' +
                           '- Task list metadata and status\n' +
                           '- Active list indication\n\n' +
                           'IMPORTANT: Requires active session.',
                inputSchema: listTaskListsSchema,
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.listTaskLists(args.includeArchived as boolean);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'archive_session',
                description: 'Archives a session. Features:\n' +
                           '- Preserves all task data\n' +
                           '- Updates session metadata\n' +
                           '- Clears active session if archived\n\n' +
                           'Best practice: Create or switch to a new session first.',
                inputSchema: archiveSessionSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.sessionId || typeof args.sessionId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid sessionId'
                        );
                    }
                    await this.taskManager.archiveSession(args.sessionId);
                    return this.formatResponse({ success: true });
                }
            },
            {
                name: 'archive_task_list',
                description: 'Archives a task list. Features:\n' +
                           '- Preserves all task data\n' +
                           '- Updates task list metadata\n' +
                           '- Clears active task list if archived\n\n' +
                           'IMPORTANT: Requires active session.',
                inputSchema: archiveTaskListSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.taskListId || typeof args.taskListId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid taskListId'
                        );
                    }
                    await this.taskManager.archiveTaskList(args.taskListId);
                    return this.formatResponse({ success: true });
                }
            },
            {
                name: 'create_task',
                description: 'Creates a new task with support for hierarchical organization. Key Features:\n' +
                           '- Milestone tasks: Project phases with strict completion rules\n' +
                           '- Group tasks: Feature sets with flexible completion\n' +
                           '- Regular tasks: Individual work items\n\n' +
                           'IMPORTANT: Requires active session and task list.',
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
                description: 'Creates multiple tasks at once with support for complex hierarchies. Features:\n' +
                           '- Bulk creation of related tasks\n' +
                           '- Automatic parent-child relationships\n' +
                           '- Efficient transaction handling\n\n' +
                           'IMPORTANT: Maximum 50 tasks per operation.',
                inputSchema: bulkCreateTasksSchema,
                handler: async (args: Record<string, unknown>) => {
                    const input = this.validateBulkCreateTaskInput(args);
                    const result = await this.taskManager.bulkCreateTasks(input);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'update_task',
                description: 'Updates an existing task with smart status propagation. Features:\n' +
                           '- Different status rules for milestones vs groups\n' +
                           '- Automatic dependency validation\n' +
                           '- Parent status updates\n\n' +
                           'IMPORTANT: Requires active session.',
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
                description: 'Updates multiple tasks at once with transaction safety. Features:\n' +
                           '- Atomic updates across tasks\n' +
                           '- Dependency preservation\n' +
                           '- Status propagation handling\n\n' +
                           'IMPORTANT: Maximum 50 updates per operation.',
                inputSchema: bulkUpdateTasksSchema,
                handler: async (args: Record<string, unknown>) => {
                    const input = this.validateBulkUpdateTaskInput(args);
                    const result = await this.taskManager.bulkUpdateTasks(input);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'get_tasks_by_status',
                description: 'Retrieves tasks filtered by status with context awareness. Features:\n' +
                           '- Status-based filtering\n' +
                           '- Session and task list scoping\n' +
                           '- Progress tracking support\n\n' +
                           'Use for monitoring task progress and identifying bottlenecks.',
                inputSchema: getTasksByStatusSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.status || !Object.values(TaskStatus).includes(args.status as TaskStatus)) {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Invalid task status'
                        );
                    }
                    const result = await this.taskManager.getTasksByStatus(
                        args.status as TaskStatus,
                        args.sessionId as string | undefined,
                        args.taskListId as string | undefined
                    );
                    return this.formatResponse(result);
                }
            },
            {
                name: 'delete_task',
                description: 'Deletes a task with dependency cleanup. Features:\n' +
                           '- Automatic subtask cleanup\n' +
                           '- Dependency validation\n' +
                           '- Parent task updates\n\n' +
                           'IMPORTANT: Requires active session. Check for dependent tasks first.',
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
                description: 'Retrieves subtasks of a task with hierarchy awareness. Features:\n' +
                           '- Support for milestone and group subtasks\n' +
                           '- Status inheritance information\n' +
                           '- Dependency tracking\n\n' +
                           'Use for understanding task relationships and progress.',
                inputSchema: getSubtasksSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.taskId || typeof args.taskId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid taskId'
                        );
                    }
                    const result = await this.taskManager.getSubtasks(
                        args.taskId,
                        args.sessionId as string | undefined,
                        args.taskListId as string | undefined
                    );
                    return this.formatResponse(result);
                }
            },
            {
                name: 'get_task_tree',
                description: 'Retrieves the complete task hierarchy with rich context. Features:\n' +
                           '- Full parent-child relationships\n' +
                           '- Status propagation information\n' +
                           '- Dependency mappings\n\n' +
                           'Use for understanding project structure and relationships.',
                inputSchema: getTaskTreeSchema,
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.getTaskTree(
                        args.sessionId as string | undefined,
                        args.taskListId as string | undefined
                    );
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
