/**
 * Path-based task management tools
 */
import { TaskManager } from '../task-manager.js';
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';
import {
    createTaskSchema,
    updateTaskSchema,
    getTasksByStatusSchema,
    getTasksByPathSchema,
    getSubtasksSchema,
    deleteTaskSchema,
    bulkTaskSchema
} from './schemas.js';

export interface Tool {
    name: string;
    description?: string;
    inputSchema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
        description?: string;
    };
}

export interface ToolResponse {
    content: Array<{
        type: string;
        text: string;
    }>;
}

export class ToolHandler {
    private readonly logger: Logger;
    private readonly tools: Map<string, Tool> = new Map();
    private readonly toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<ToolResponse>> = new Map();

    constructor(private readonly taskManager: TaskManager) {
        this.logger = Logger.getInstance().child({ component: 'ToolHandler' });
        this.registerDefaultTools();
    }

    private registerDefaultTools(): void {
        // Define tools according to MCP specification
        const defaultTools: Array<Tool & { handler: (args: Record<string, unknown>) => Promise<ToolResponse> }> = [
            {
                name: 'create_task',
                description: 'Creates a new task with path-based hierarchy. Examples:\n' +
                    '- Create a simple task: { "name": "Validate API inputs", "description": "Implement input validation for all API endpoints", "type": "task", "metadata": { "priority": "high", "tags": ["security", "api"], "reasoning": "Critical for preventing injection attacks" } }\n' +
                    '- Create with parent: { "name": "JWT Implementation", "parentPath": "server/auth", "type": "task", "metadata": { "estimatedHours": 4, "notes": ["Research best practices", "Consider token expiration"] } }\n' +
                    '- Create milestone: { "name": "Security Hardening", "type": "milestone", "metadata": { "priority": "high", "tags": ["security"], "reasoning": "Required before production deployment" } }',
                inputSchema: {
                    type: "object",
                    properties: createTaskSchema.properties,
                    required: createTaskSchema.required
                },
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.createTask(args as any);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'update_task',
                description: 'Updates an existing task by path. Examples:\n' +
                    '- Update status: { "path": "server/auth/jwt", "updates": { "status": "in_progress", "metadata": { "reasoning": "Dependencies resolved, starting implementation" } } }\n' +
                    '- Update progress: { "path": "server/api/validation", "updates": { "metadata": { "actualHours": 2, "notes": ["Input sanitization complete", "Need to add rate limiting"] } } }\n' +
                    '- Add dependencies: { "path": "server/deployment", "updates": { "dependencies": ["server/auth", "server/api"], "metadata": { "reasoning": "Authentication and API validation must be complete before deployment" } } }',
                inputSchema: {
                    type: "object",
                    properties: updateTaskSchema.properties,
                    required: updateTaskSchema.required
                },
                handler: async (args: Record<string, unknown>) => {
                    const { path, updates } = args as { path: string; updates: Record<string, unknown> };
                    const result = await this.taskManager.updateTask(path, updates as any);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'get_tasks_by_status',
                description: 'Gets tasks filtered by status. Examples:\n' +
                    '- Get in-progress tasks: { "status": "in_progress" }\n' +
                    '- Get blocked tasks in API: { "status": "blocked", "pathPattern": "server/api/*" }\n' +
                    '- Get completed security tasks: { "status": "completed", "pathPattern": "*/security/*" }',
                inputSchema: {
                    type: "object",
                    properties: getTasksByStatusSchema.properties,
                    required: getTasksByStatusSchema.required
                },
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.getTasksByStatus(args.status as any);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'get_tasks_by_path',
                description: 'Gets tasks matching a path pattern. Examples:\n' +
                    '- Get all auth tasks: { "pathPattern": "server/auth/*" }\n' +
                    '- Get all API tasks: { "pathPattern": "server/api/*" }\n' +
                    '- Get all security tasks: { "pathPattern": "*/security/*" }',
                inputSchema: {
                    type: "object",
                    properties: getTasksByPathSchema.properties,
                    required: getTasksByPathSchema.required
                },
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.listTasks(args.pathPattern as string);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'get_subtasks',
                description: 'Gets subtasks of a task by path. Examples:\n' +
                    '- Get auth subtasks: { "path": "server/auth" }\n' +
                    '- Get API subtasks: { "path": "server/api" }\n' +
                    '- Get validation subtasks: { "path": "server/api/validation" }',
                inputSchema: {
                    type: "object",
                    properties: getSubtasksSchema.properties,
                    required: getSubtasksSchema.required
                },
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.getSubtasks(args.path as string);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'delete_task',
                description: 'Deletes a task by path. Will also delete all subtasks. Example:\n' +
                    '- Delete task: { "path": "server/auth/jwt" }\n' +
                    '- Delete group: { "path": "server/api" }',
                inputSchema: {
                    type: "object",
                    properties: deleteTaskSchema.properties,
                    required: deleteTaskSchema.required
                },
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.deleteTask(args.path as string);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'bulk_task_operations',
                description: 'Performs multiple task operations in a single transaction. Example:\n' +
                    '{\n' +
                    '  "operations": [\n' +
                    '    { "type": "create", "path": "server/auth", "data": { "name": "Authentication System", "type": "group", "metadata": { "priority": "high", "tags": ["security"] } } },\n' +
                    '    { "type": "create", "path": "server/auth/jwt", "data": { "name": "JWT Implementation", "type": "task", "metadata": { "estimatedHours": 4 } } },\n' +
                    '    { "type": "create", "path": "server/auth/validation", "data": { "name": "Token Validation", "type": "task", "metadata": { "notes": ["Implement refresh token logic"] } } },\n' +
                    '    { "type": "update", "path": "server/auth", "data": { "status": "in_progress", "metadata": { "reasoning": "Starting authentication implementation" } } }\n' +
                    '  ]\n' +
                    '}',
                inputSchema: {
                    type: "object",
                    properties: bulkTaskSchema.properties,
                    required: bulkTaskSchema.required
                },
                handler: async (_args: Record<string, unknown>) => {
                    // TODO: Implement bulk operations
                    throw createError(
                        ErrorCodes.NOT_IMPLEMENTED,
                        'Bulk operations not yet implemented'
                    );
                }
            }
        ];

        for (const tool of defaultTools) {
            this.registerTool(tool);
        }
    }

    private registerTool(tool: Tool & { handler: (args: Record<string, unknown>) => Promise<ToolResponse> }): void {
        const { handler, ...toolDef } = tool;
        this.tools.set(tool.name, toolDef);
        this.toolHandlers.set(tool.name, handler);
        this.logger.debug('Registered tool', { name: tool.name });
    }

    async listTools(): Promise<{ tools: Tool[] }> {
        const tools = Array.from(this.tools.values());
        this.logger.info('Listed tools', { 
            count: tools.length,
            tools: tools.map(t => ({
                name: t.name,
                schema: t.inputSchema
            }))
        });
        return { tools };
    }

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
            this.logger.debug('Executing tool', { name, args });
            const result = await handler(args);
            this.logger.debug('Tool execution completed', { name });
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

    private formatResponse(result: unknown): ToolResponse {
        try {
            const sanitizedResult = JSON.parse(JSON.stringify(result, (key, value) => {
                if (typeof value === 'bigint') {
                    return value.toString();
                }
                if (key.toLowerCase().includes('secret') || 
                    key.toLowerCase().includes('password') ||
                    key.toLowerCase().includes('token')) {
                    return undefined;
                }
                return value;
            }));

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(sanitizedResult, null, 2)
                }]
            };
        } catch (error) {
            this.logger.error('Failed to format response', { error });
            throw createError(
                ErrorCodes.INTERNAL_ERROR,
                'Failed to format response'
            );
        }
    }
}
