/**
 * Path-based task management tools
 */
import { TaskManager } from '../task/manager/task-manager.js';
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';
import { TaskType, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../types/task.js';
import {
  createTaskSchema,
  updateTaskSchema,
  getTasksByStatusSchema,
  getTasksByPathSchema,
  getSubtasksSchema,
  deleteTaskSchema,
  bulkTaskSchema,
  clearAllTasksSchema,
  vacuumDatabaseSchema,
  repairRelationshipsSchema,
} from './schemas.js';
import { DependencyAwareBatchProcessor } from '../task/core/batch/dependency-aware-batch-processor.js';
import { BatchData } from '../task/core/batch/common/batch-utils.js';

interface BulkOperation {
  type: 'create' | 'update' | 'delete';
  path: string;
  data?: Record<string, unknown>;
  id?: string;
  dependencies?: string[];
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
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
  private readonly toolHandlers: Map<
    string,
    (args: Record<string, unknown>) => Promise<ToolResponse>
  > = new Map();

  constructor(private readonly taskManager: TaskManager) {
    this.logger = Logger.getInstance().child({ component: 'ToolHandler' });
    this.registerDefaultTools();
  }

  /**
   * Validates task hierarchy rules
   */
  private async validateTaskHierarchy(
    args: CreateTaskInput | (UpdateTaskInput & { path?: string }),
    operation: 'create' | 'update'
  ): Promise<void> {
    const taskType = (args.type || TaskType.TASK).toString().toUpperCase();
    const parentPath = 'parentPath' in args ? args.parentPath : undefined;

    // Validate task type is uppercase
    if (taskType !== taskType.toUpperCase()) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Task type must be uppercase (TASK or MILESTONE)',
        'validateTaskHierarchy'
      );
    }

    // Validate task type is valid
    if (![TaskType.TASK, TaskType.MILESTONE].includes(taskType as TaskType)) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Invalid task type. Must be TASK or MILESTONE',
        'validateTaskHierarchy'
      );
    }

    // If parent path is provided, validate parent type compatibility
    if (parentPath) {
      const parent = await this.taskManager.getTaskByPath(parentPath);
      if (!parent) {
        throw createError(
          ErrorCodes.INVALID_INPUT,
          `Parent task '${parentPath}' not found`,
          'validateTaskHierarchy'
        );
      }

      // Validate parent-child type relationships
      switch (parent.type) {
        case TaskType.MILESTONE:
          if (taskType !== TaskType.TASK) {
            throw createError(
              ErrorCodes.INVALID_INPUT,
              'MILESTONE can only contain TASK types',
              'validateTaskHierarchy'
            );
          }
          break;
        case TaskType.TASK:
          throw createError(
            ErrorCodes.INVALID_INPUT,
            'TASK type cannot contain subtasks',
            'validateTaskHierarchy'
          );
      }
    }

    // For updates, validate type changes don't break hierarchy
    if (operation === 'update' && taskType) {
      const path = args.path as string;
      const task = await this.taskManager.getTaskByPath(path);
      if (!task) {
        throw createError(
          ErrorCodes.INVALID_INPUT,
          `Task '${path}' not found`,
          'validateTaskHierarchy'
        );
      }

      // Check if task has subtasks and is being changed to TASK type
      if (taskType === TaskType.TASK) {
        const subtasksResponse = await this.taskManager.getSubtasks(path);
        if (subtasksResponse.data && subtasksResponse.data.length > 0) {
          throw createError(
            ErrorCodes.INVALID_INPUT,
            'Cannot change to TASK type while having subtasks',
            'validateTaskHierarchy'
          );
        }
      }
    }
  }

  private registerDefaultTools(): void {
    const defaultTools: Array<
      Tool & { handler: (args: Record<string, unknown>) => Promise<ToolResponse> }
    > = [
      {
        name: 'create_task',
        description: createTaskSchema.properties.type.description,
        inputSchema: {
          type: 'object',
          properties: createTaskSchema.properties,
          required: createTaskSchema.required,
        },
        handler: async (args: Record<string, unknown>) => {
          // Validate hierarchy rules
          await this.validateTaskHierarchy(
            {
              path: args.path as string,
              name: args.name as string,
              type: args.type ? ((args.type as string).toUpperCase() as TaskType) : TaskType.TASK,
              description: args.description as string | undefined,
              parentPath: args.parentPath as string | undefined,
              dependencies: Array.isArray(args.dependencies) ? (args.dependencies as string[]) : [],
              notes: Array.isArray(args.notes) ? (args.notes as string[]) : [],
              reasoning: args.reasoning as string | undefined,
              metadata: (args.metadata as Record<string, unknown>) || {},
            },
            'create'
          );

          // Create task input with proper type casting
          const taskInput = {
            name: args.name as string,
            path: args.path as string,
            type: args.type ? ((args.type as string).toUpperCase() as TaskType) : TaskType.TASK,
            description: args.description as string | undefined,
            parentPath: args.parentPath as string | undefined,
            dependencies: Array.isArray(args.dependencies) ? (args.dependencies as string[]) : [],
            notes: Array.isArray(args.notes) ? (args.notes as string[]) : [],
            reasoning: args.reasoning as string | undefined,
            metadata: (args.metadata as Record<string, unknown>) || {},
          };

          const result = await this.taskManager.createTask(taskInput);
          return this.formatResponse(result);
        },
      },
      {
        name: 'update_task',
        description: updateTaskSchema.properties.updates.properties.type.description,
        inputSchema: {
          type: 'object',
          properties: updateTaskSchema.properties,
          required: updateTaskSchema.required,
        },
        handler: async (args: Record<string, unknown>) => {
          const { path, updates } = args as { path: string; updates: Record<string, unknown> };

          // Validate hierarchy rules if type is being updated
          if (updates.type) {
            await this.validateTaskHierarchy({ ...updates, path }, 'update');
          }

          // Create update input with proper type casting
          const updateInput: UpdateTaskInput = {
            name: updates.name as string | undefined,
            type: updates.type ? ((updates.type as string).toUpperCase() as TaskType) : undefined,
            description: updates.description as string | undefined,
            status: updates.status as TaskStatus | undefined,
            dependencies: Array.isArray(updates.dependencies)
              ? (updates.dependencies as string[])
              : undefined,
            notes: Array.isArray(updates.notes) ? (updates.notes as string[]) : undefined,
            reasoning: updates.reasoning as string | undefined,
            metadata: updates.metadata as Record<string, unknown> | undefined,
          };

          const result = await this.taskManager.updateTask(path, updateInput);
          return this.formatResponse(result);
        },
      },
      {
        name: 'get_tasks_by_status',
        description: getTasksByStatusSchema.properties.status.description,
        inputSchema: {
          type: 'object',
          properties: getTasksByStatusSchema.properties,
          required: getTasksByStatusSchema.required,
        },
        handler: async (args: Record<string, unknown>) => {
          const result = await this.taskManager.getTasksByStatus(
            args.status as unknown as TaskStatus
          );
          return this.formatResponse(result);
        },
      },
      {
        name: 'get_tasks_by_path',
        description: getTasksByPathSchema.properties.pathPattern.description,
        inputSchema: {
          type: 'object',
          properties: getTasksByPathSchema.properties,
          required: getTasksByPathSchema.required,
        },
        handler: async (args: Record<string, unknown>) => {
          const result = await this.taskManager.listTasks(args.pathPattern as string);
          return this.formatResponse(result);
        },
      },
      {
        name: 'get_subtasks',
        description: getSubtasksSchema.properties.path.description,
        inputSchema: {
          type: 'object',
          properties: getSubtasksSchema.properties,
          required: getSubtasksSchema.required,
        },
        handler: async (args: Record<string, unknown>) => {
          const result = await this.taskManager.getSubtasks(args.path as string);
          return this.formatResponse(result);
        },
      },
      {
        name: 'delete_task',
        description: deleteTaskSchema.properties.path.description,
        inputSchema: {
          type: 'object',
          properties: deleteTaskSchema.properties,
          required: deleteTaskSchema.required,
        },
        handler: async (args: Record<string, unknown>) => {
          const result = await this.taskManager.deleteTask(args.path as string);
          return this.formatResponse(result);
        },
      },
      {
        name: 'bulk_task_operations',
        description: `Execute multiple task operations atomically in a single transaction. Operations are automatically sorted by dependencies and validated in deferred mode to allow forward-looking dependencies.

Key Features:
- Automatic dependency-based sorting
- Deferred validation mode for dependencies
- Atomic transaction handling
- Proper rollback on failure

Example - Creating Tasks with Dependencies:
{
  "operations": [
    {
      "type": "create",
      "path": "project/backend/database",
      "data": {
        "name": "Database Setup",
        "type": "TASK"
      }
    },
    {
      "type": "create",
      "path": "project/backend/api",
      "data": {
        "name": "API Development",
        "dependencies": ["project/backend/database"]
      }
    }
  ]
}`,
        inputSchema: {
          type: 'object',
          properties: bulkTaskSchema.properties,
          required: bulkTaskSchema.required,
        },
        handler: async (args: Record<string, unknown>) => {
          const { operations } = args as { operations: BulkOperation[] };

          // Extract all create operations for dependency sorting
          const createOps = operations
            .filter(op => op.type === 'create')
            .map(op => ({
              path: op.path,
              dependencies: (op.data?.dependencies as string[]) || [],
            }));

          // Sort create operations by dependencies if any exist
          let sortedPaths: string[] = [];
          if (createOps.length > 0) {
            try {
              sortedPaths = await this.taskManager.sortTasksByDependencies(createOps);
            } catch (error) {
              throw createError(
                ErrorCodes.INVALID_INPUT,
                'Failed to sort operations by dependencies: ' +
                  (error instanceof Error ? error.message : String(error)),
                'handleToolCall'
              );
            }
          }

          // Reorder operations based on dependency order
          const sortedOps = [];

          // Add create operations in sorted order
          for (const path of sortedPaths) {
            const op = operations.find(o => o.type === 'create' && o.path === path);
            if (op) sortedOps.push(op);
          }

          // Add remaining operations
          const otherOps = operations.filter(
            op => op.type !== 'create' || !sortedPaths.includes(op.path)
          );
          sortedOps.push(...otherOps);

          const batchProcessor = new DependencyAwareBatchProcessor(
            {
              validator: null,
              logger: this.logger,
              storage: this.taskManager.storage,
            },
            {
              maxBatchSize: 1,
              concurrentBatches: 1,
              maxRetries: 3,
              retryDelay: 1000,
            }
          );

          // Process operations sequentially with dependency ordering
          const result = await batchProcessor.processInBatches(
            sortedOps.map(op => ({
              id: op.path,
              data: op,
              task: {
                path: op.path,
                name: (op.data?.name as string) || op.path.split('/').pop() || '',
                type: ((op.data?.type as string) || 'TASK').toUpperCase() as TaskType,
                status: TaskStatus.PENDING,
                created: Date.now(),
                updated: Date.now(),
                version: 1,
                projectPath: op.path.split('/')[0],
                description: op.data?.description as string,
                dependencies: (op.data?.dependencies as string[]) || [],
                metadata: (op.data?.metadata as Record<string, unknown>) || {},
                notes: [],
                subtasks: [],
              },
              dependencies: (op.data?.dependencies as string[]) || [],
            })),
            1,
            async (operation: BatchData) => {
              const op = (operation.data as { data: BulkOperation }).data;
              try {
                switch (op.type) {
                  case 'create': {
                    // Extract parent path from task path if not provided
                    const pathSegments = op.path.split('/');
                    const parentPath =
                      (op.data?.parentPath as string) ||
                      (pathSegments.length > 1 ? pathSegments.slice(0, -1).join('/') : undefined);

                    const taskData: CreateTaskInput = {
                      path: op.path,
                      name:
                        (op.data?.name as string) ||
                        pathSegments[pathSegments.length - 1] ||
                        'Unnamed Task',
                      type: ((op.data?.type as string) || 'TASK').toUpperCase() as TaskType,
                      description: op.data?.description as string,
                      dependencies: (op.data?.dependencies as string[]) || [],
                      parentPath,
                      metadata: {
                        ...(op.data?.metadata || {}),
                        created: Date.now(),
                        updated: Date.now(),
                      },
                    };

                    // Validate hierarchy rules
                    await this.validateTaskHierarchy(taskData, 'create');

                    await this.taskManager.createTask(taskData);
                    break;
                  }
                  case 'update': {
                    const updateData: UpdateTaskInput = {
                      status: op.data?.status as TaskStatus,
                      metadata: op.data?.metadata as Record<string, unknown>,
                      notes: op.data?.notes as string[],
                      dependencies: op.data?.dependencies as string[],
                      description: op.data?.description as string,
                      name: op.data?.name as string,
                      type: op.data?.type
                        ? ((op.data.type as string).toUpperCase() as TaskType)
                        : undefined,
                    };

                    // Validate hierarchy rules if type is being updated
                    if (updateData.type) {
                      await this.validateTaskHierarchy({ ...updateData, path: op.path }, 'update');
                    }

                    await this.taskManager.updateTask(op.path, updateData);
                    break;
                  }
                  case 'delete':
                    await this.taskManager.deleteTask(op.path);
                    break;
                  default:
                    throw createError(
                      ErrorCodes.INVALID_INPUT,
                      `Invalid operation type: ${op.type}`,
                      'handleToolCall'
                    );
                }
              } catch (error) {
                this.logger.error('Operation failed', {
                  operation: op,
                  error,
                });
                throw error;
              }
            }
          );

          return this.formatResponse({
            success: result.metadata?.successCount === sortedOps.length,
            processedCount: result.metadata?.successCount || 0,
            failedCount: result.metadata?.errorCount || 0,
            errors: result.errors.map(err => ({
              operation: err,
              error: err.message,
              context: undefined,
            })),
          });
        },
      },
      {
        name: 'clear_all_tasks',
        description: clearAllTasksSchema.properties.confirm.description,
        inputSchema: {
          type: 'object',
          properties: clearAllTasksSchema.properties,
          required: clearAllTasksSchema.required,
        },
        handler: async (args: Record<string, unknown>) => {
          await this.taskManager.clearAllTasks(args.confirm as boolean);
          return this.formatResponse({ success: true, message: 'All tasks cleared' });
        },
      },
      {
        name: 'vacuum_database',
        description: vacuumDatabaseSchema.properties.analyze.description,
        inputSchema: {
          type: 'object',
          properties: vacuumDatabaseSchema.properties,
          required: vacuumDatabaseSchema.required,
        },
        handler: async (args: Record<string, unknown>) => {
          await this.taskManager.vacuumDatabase(args.analyze as boolean);
          return this.formatResponse({ success: true, message: 'Database optimized' });
        },
      },
      {
        name: 'repair_relationships',
        description: repairRelationshipsSchema.properties.dryRun.description,
        inputSchema: {
          type: 'object',
          properties: repairRelationshipsSchema.properties,
          required: repairRelationshipsSchema.required,
        },
        handler: async (args: Record<string, unknown>) => {
          const result = await this.taskManager.repairRelationships(
            args.dryRun as boolean,
            args.pathPattern as string | undefined
          );
          return this.formatResponse(result);
        },
      },
    ];

    for (const tool of defaultTools) {
      this.registerTool(tool);
    }
  }

  private registerTool(
    tool: Tool & { handler: (args: Record<string, unknown>) => Promise<ToolResponse> }
  ): void {
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
        schema: t.inputSchema,
      })),
    });
    return { tools };
  }

  async handleToolCall(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<{
    _meta?: Record<string, unknown>;
    content: Array<{ type: string; text: string }>;
  }> {
    const { name, arguments: args = {} } = request.params;

    const tool = this.tools.get(name);
    if (!tool) {
      throw createError(ErrorCodes.INVALID_INPUT, 'Unknown tool', 'handleToolCall', undefined, {
        tool: name,
      });
    }

    const handler = this.toolHandlers.get(name);
    if (!handler) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Tool handler not found',
        'handleToolCall',
        undefined,
        { tool: name }
      );
    }

    try {
      // Validate dependencies are at root level
      if (
        (name === 'create_task' || name === 'update_task') &&
        (args as any).metadata?.dependencies
      ) {
        throw createError(
          ErrorCodes.INVALID_INPUT,
          'Dependencies must be specified at root level, not in metadata',
          'handleToolCall'
        );
      }

      this.logger.debug('Executing tool', { name, args });
      const result = await handler(args);
      this.logger.debug('Tool execution completed', { name });
      return {
        _meta: {},
        ...result,
      };
    } catch (error) {
      this.logger.error('Tool execution failed', {
        tool: name,
        error,
      });
      throw error;
    }
  }

  async getStorageMetrics(): Promise<any> {
    return await this.taskManager.storage.getMetrics();
  }

  private formatResponse(result: unknown): ToolResponse {
    try {
      const sanitizedResult = JSON.parse(
        JSON.stringify(result, (key, value) => {
          if (typeof value === 'bigint') {
            return value.toString();
          }
          if (
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('password') ||
            key.toLowerCase().includes('token')
          ) {
            return undefined;
          }
          return value;
        })
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(sanitizedResult, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error('Failed to format response', { error });
      throw createError(ErrorCodes.INTERNAL_ERROR, 'Failed to format response', 'formatResponse');
    }
  }
}
