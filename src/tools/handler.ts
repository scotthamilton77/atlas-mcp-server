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
import { TaskBatchProcessor } from '../task/core/batch/batch-processor.js';
import { BatchResult } from '../task/core/batch/batch-types.js';

interface BulkOperation {
    type: 'create' | 'update' | 'delete';
    path: string;
    data?: Record<string, unknown>;
}

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
                description: 'Creates a new task with path-based hierarchy and dependency management. Examples:\n' +
                    '- Create a simple task:\n' +
                    '  {\n' +
                    '    "name": "Validate API inputs",\n' +
                    '    "path": "server/api/validation",\n' +
                    '    "description": "Implement input validation for all API endpoints",\n' +
                    '    "type": "task",\n' +
                    '    "metadata": {\n' +
                    '      "priority": "high",\n' +
                    '      "tags": ["security", "api"],\n' +
                    '      "reasoning": "Critical for preventing injection attacks"\n' +
                    '    }\n' +
                    '  }\n\n' +
                    '- Create with dependencies:\n' +
                    '  {\n' +
                    '    "name": "Deploy API",\n' +
                    '    "path": "server/deployment",\n' +
                    '    "dependencies": ["server/auth/jwt", "server/api/validation"],\n' +
                    '    "type": "task",\n' +
                    '    "metadata": {\n' +
                    '      "priority": "high",\n' +
                    '      "reasoning": "Deploy after security features are complete"\n' +
                    '    }\n' +
                    '  }\n\n' +
                    '- Create milestone with subtasks:\n' +
                    '  {\n' +
                    '    "name": "Security Hardening",\n' +
                    '    "path": "server/security",\n' +
                    '    "type": "milestone",\n' +
                    '    "metadata": {\n' +
                    '      "priority": "high",\n' +
                    '      "tags": ["security"],\n' +
                    '      "reasoning": "Required before production deployment"\n' +
                    '    }\n' +
                    '  }\n\n' +
                    'Dependencies can be specified in two ways:\n' +
                    '1. Using the dependencies array (recommended)\n' +
                    '2. In metadata.dependencies (legacy, will be migrated)\n\n' +
                    'Tasks will be automatically blocked if their dependencies are not met.',
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
                description: 'Updates an existing task by path with dependency and status management. Examples:\n' +
                    '- Update status with progress:\n' +
                    '  {\n' +
                    '    "path": "server/auth/jwt",\n' +
                    '    "updates": {\n' +
                    '      "status": "in_progress",\n' +
                    '      "metadata": {\n' +
                    '        "notes": ["Implemented token generation", "Working on validation"],\n' +
                    '        "reasoning": "Dependencies resolved, starting implementation"\n' +
                    '      }\n' +
                    '    }\n' +
                    '  }\n\n' +
                    '- Update task details:\n' +
                    '  {\n' +
                    '    "path": "server/api/validation",\n' +
                    '    "updates": {\n' +
                    '      "description": "Implement comprehensive input validation with rate limiting",\n' +
                    '      "metadata": {\n' +
                    '        "notes": ["Input sanitization complete", "Need to add rate limiting"],\n' +
                    '        "reasoning": "Scope increased to include rate limiting"\n' +
                    '      }\n' +
                    '    }\n' +
                    '  }\n\n' +
                    '- Add dependencies with context:\n' +
                    '  {\n' +
                    '    "path": "server/deployment",\n' +
                    '    "updates": {\n' +
                    '      "dependencies": ["server/auth", "server/api"],\n' +
                    '      "metadata": {\n' +
                    '        "reasoning": "Authentication and API validation must be complete before deployment",\n' +
                    '        "notes": ["Added security dependencies", "Will be blocked until auth is ready"]\n' +
                    '      }\n' +
                    '    }\n' +
                    '  }\n\n' +
                    'Status Transitions:\n' +
                    '- Tasks are automatically blocked if dependencies are not met\n' +
                    '- Parent tasks inherit status from children in specific cases\n' +
                    '- Status changes propagate through task hierarchy\n' +
                    '- Failed dependencies block dependent tasks',
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
                    '- Get in-progress tasks:\n' +
                    '  { "status": "in_progress" }\n\n' +
                    '- Get blocked tasks in API:\n' +
                    '  {\n' +
                    '    "status": "blocked",\n' +
                    '    "pathPattern": "server/api/*"\n' +
                    '  }\n\n' +
                    '- Get completed security tasks:\n' +
                    '  {\n' +
                    '    "status": "completed",\n' +
                    '    "pathPattern": "*/security/*"\n' +
                    '  }',
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
                    '- Get all auth tasks:\n' +
                    '  { "pathPattern": "server/auth/*" }\n\n' +
                    '- Get all API tasks:\n' +
                    '  { "pathPattern": "server/api/*" }\n\n' +
                    '- Get all security tasks:\n' +
                    '  { "pathPattern": "*/security/*" }',
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
                    '- Get auth subtasks:\n' +
                    '  { "path": "server/auth" }\n\n' +
                    '- Get API subtasks:\n' +
                    '  { "path": "server/api" }\n\n' +
                    '- Get validation subtasks:\n' +
                    '  { "path": "server/api/validation" }',
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
                    '- Delete single task:\n' +
                    '  { "path": "server/auth/jwt" }\n\n' +
                    '- Delete task group:\n' +
                    '  { "path": "server/api" }',
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
                description: 'Performs multiple task operations in a single atomic transaction with dependency validation. Example:\n' +
                    '{\n' +
                    '  "operations": [\n' +
                    '    { "type": "create", "path": "server/auth", "data": { "name": "Authentication System", "type": "group", "metadata": { "priority": "high", "tags": ["security"] } } },\n' +
                    '    { "type": "create", "path": "server/auth/jwt", "data": { "name": "JWT Implementation", "type": "task", "metadata": { "priority": "high" } } },\n' +
                    '    { "type": "create", "path": "server/auth/validation", "data": { "name": "Token Validation", "type": "task", "metadata": { "notes": ["Implement refresh token logic"] } } },\n' +
                    '    { "type": "update", "path": "server/auth", "data": { "status": "in_progress", "metadata": { "reasoning": "Starting authentication implementation" } } }\n' +
                    '  ]\n' +
                    '}\n\n' +
                    'Features:\n' +
                    '- Atomic transactions (all operations succeed or none do)\n' +
                    '- Dependency validation across operations\n' +
                    '- Status propagation through task hierarchy\n' +
                    '- Automatic dependency-based blocking\n' +
                    '- Rollback on failure',
                inputSchema: {
                    type: "object",
                    properties: bulkTaskSchema.properties,
                    required: bulkTaskSchema.required
                },
                handler: async (args: Record<string, unknown>) => {
                    const { operations } = args as { operations: BulkOperation[] };

                    const batchProcessor = new TaskBatchProcessor();
                    
                    // Process operations in sequence to maintain consistency
                    const result = await batchProcessor.processBatch(operations, async (operation: BulkOperation) => {
                        switch (operation.type) {
                            case 'create':
                                await this.taskManager.createTask(operation.data as any);
                                break;
                            case 'update':
                                await this.taskManager.updateTask(operation.path, operation.data as any);
                                break;
                            case 'delete':
                                await this.taskManager.deleteTask(operation.path);
                                break;
                            default:
                                throw createError(
                                    ErrorCodes.INVALID_INPUT,
                                    `Invalid operation type: ${operation.type}`
                                );
                        }
                    });

                    return this.formatResponse({
                        success: result.success,
                        processedCount: result.processedCount,
                        failedCount: result.failedCount,
                        errors: result.errors.map((err: BatchResult['errors'][0]) => ({
                            operation: err.item,
                            error: err.error.message,
                            context: err.context
                        }))
                    });
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
