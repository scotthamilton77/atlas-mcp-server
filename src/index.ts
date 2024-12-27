import { Logger } from './logging/index.js';
import { TaskManager } from './task/manager/task-manager.js';
import { createStorage } from './storage/index.js';
import { AtlasServer } from './server/index.js';
import { EventManager } from './events/event-manager.js';
import { EventTypes } from './types/events.js';
import { BaseError, ErrorCodes, createError } from './errors/index.js';
import { SerializableError } from './types/events.js';
import { ConfigManager } from './config/index.js';
import { join } from 'path';
import { promises as fs } from 'fs';

import { TaskStorage } from './types/storage.js';
import { CreateTaskInput, UpdateTaskInput, TaskStatus } from './types/task.js';
import { LogLevels, LogLevel } from './types/logging.js';

let server: AtlasServer;
let storage: TaskStorage;
let taskManager: TaskManager;
let eventManager: EventManager;
let logger: Logger;

// Helper function to convert Error to SerializableError
function toSerializableError(error: unknown): SerializableError {
    if (error instanceof Error) {
        // Create a base serializable error with required properties
        const serializableError: SerializableError = {
            name: error.name,
            message: error.message
        };

        // Add optional stack trace if available
        if (error.stack) {
            serializableError.stack = error.stack;
        }

        // Copy any additional enumerable properties
        for (const key of Object.keys(error)) {
            serializableError[key] = (error as any)[key];
        }

        return serializableError;
    }

    // For non-Error objects, create a new Error and convert it
    const baseError = new Error(String(error));
    return {
        name: baseError.name,
        message: baseError.message,
        stack: baseError.stack
    };
}

async function main(): Promise<void> {
    try {
        // Load environment variables from .env file if present
        try {
            const { config } = await import('dotenv');
            config();
        } catch (error) {
            // Ignore error if .env file doesn't exist
        }

        // Get home directory in a cross-platform way
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';

        const logDir = process.env.ATLAS_STORAGE_DIR ? 
            join(process.env.ATLAS_STORAGE_DIR, 'logs') : 
            join(homeDir, 'Documents', 'Cline', 'mcp-workspace', 'ATLAS', 'logs');

        // Create log directory with proper permissions (mode is ignored on Windows)
        await fs.mkdir(logDir, { recursive: true, ...(process.platform !== 'win32' && { mode: 0o755 }) });

        // Get log level from environment or default to info
        const logLevel = process.env.ATLAS_LOG_LEVEL?.toLowerCase();
        const validLogLevel = Object.values(LogLevels).map(l => l.toLowerCase()).includes(logLevel || '')
            ? logLevel as LogLevel 
            : LogLevels.INFO;

        // Initialize logger first - no console logging for MCP clients
        logger = await Logger.initialize({
            console: false,
            file: true,
            minLevel: validLogLevel,
            logDir: logDir,
            maxFileSize: 5 * 1024 * 1024,
            maxFiles: 5,
            noColors: true
        });

        // Add debug log to verify level
        logger.debug('Logger initialized with level', { level: validLogLevel });

        // Initialize event manager
        eventManager = await EventManager.initialize();

        // Update logger with event manager
        logger.setEventManager(eventManager);

        // Increase event listener limits to prevent warnings
        process.setMaxListeners(20);

        const configManager = await ConfigManager.initialize({
            logging: {
                console: false,
                file: true,
                level: validLogLevel,
                maxFiles: 5,
                maxSize: 5242880, // 5MB
                dir: logDir
            },
            storage: {
                baseDir: process.env.ATLAS_STORAGE_DIR || join(homeDir, 'Documents', 'Cline', 'mcp-workspace', 'ATLAS'),
                name: process.env.ATLAS_STORAGE_NAME || 'atlas-tasks',
                connection: {
                    maxRetries: 1,
                    retryDelay: 500,
                    busyTimeout: 2000
                },
                performance: {
                    checkpointInterval: 60000,
                    cacheSize: 1000,
                    mmapSize: 1024 * 1024 * 1024, // 1GB
                    pageSize: 4096
                }
            }
        });

        const config = configManager.getConfig();

        try {
            // Emit system startup event
            eventManager.emitSystemEvent({
                type: EventTypes.SYSTEM_STARTUP,
                timestamp: Date.now(),
                metadata: {
                    version: '0.1.0',
                    environment: process.env.NODE_ENV || 'development'
                }
            });

            // Initialize storage with mutex
            storage = await createStorage(config.storage!);
            
            // Initialize task manager with existing storage instance
            taskManager = await TaskManager.getInstance(storage);

            // Run maintenance after initialization
            await storage.vacuum();
            await storage.analyze();
            await storage.checkpoint();

            // Initialize server only if it doesn't exist
            if (!server) {
                server = await AtlasServer.getInstance(
                {
                    name: 'atlas-mcp-server',
                    version: '0.1.0',
                    maxRequestsPerMinute: 600,
                    requestTimeout: 30000,
                    shutdownTimeout: 5000,
                    health: {
                        checkInterval: 300000,     // 5 minutes
                        failureThreshold: 5,       // 5 strikes
                        shutdownGracePeriod: 10000, // 10 seconds
                        clientPingTimeout: 300000   // 5 minutes
                    }
                },
                {
                    listTools: async () => ({
                        tools: [
                            // Task CRUD operations
                            {
                                name: 'create_task',
                                description: 'Create a new task in the hierarchical task structure. Tasks can be organized in a tree-like structure with parent-child relationships and dependencies. Each task has a unique path identifier, metadata, and status tracking.\n\nBest Practices:\n- Use descriptive path names that reflect the task hierarchy (e.g., "project/feature/subtask")\n- Set appropriate task types (TASK for concrete work items, MILESTONE for major checkpoints)\n- Both TASK and MILESTONE types can contain subtasks\n- Include detailed descriptions for better context\n- Use metadata for custom fields like priority, tags, or deadlines\n- Consider dependencies carefully to avoid circular references\n\nExample:\n{\n  "path": "project/backend/api",\n  "name": "Implement REST API",\n  "description": "Create RESTful API endpoints with proper validation",\n  "type": "TASK",\n  "metadata": {\n    "priority": "high",\n    "estimatedDays": 14,\n    "tags": ["backend", "api", "rest"]\n  }\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        path: { 
                                            type: 'string',
                                            description: 'Required: Unique path identifier for the task (e.g., "project/feature/subtask")'
                                        },
                                        name: { 
                                            type: 'string',
                                            description: 'Required: Display name of the task. This is the only required field'
                                        },
                                        description: { 
                                            type: 'string',
                                            description: 'Optional: Detailed description of the task'
                                        },
                                        type: { 
                                            type: 'string', 
                                            enum: ['TASK', 'MILESTONE'],
                                            description: 'Optional: Type of task: TASK (concrete work item) or MILESTONE (major checkpoint). Both types can contain subtasks. Defaults to TASK'
                                        },
                                        parentPath: { 
                                            type: 'string',
                                            description: 'Optional: Path of the parent task if this is a subtask. Used for hierarchical organization'
                                        },
                                        dependencies: { 
                                            type: 'array', 
                                            items: { type: 'string' },
                                            description: 'Optional: Array of task paths that must be completed before this task can start. Used for dependency tracking'
                                        },
                                        metadata: { 
                                            type: 'object',
                                            description: 'Optional: Additional task metadata like priority, tags, or custom fields. Can store any JSON-serializable data'
                                        }
                                    },
                                    required: ['path', 'name']
                                }
                            },
                            {
                                name: 'update_task',
                                description: 'Update an existing task\'s properties including status, dependencies, and metadata. All changes are validated for consistency and dependency cycles.\n\nBest Practices:\n- Update only the fields that need to change\n- Use appropriate status values to track progress\n- Validate dependencies before updating\n- Keep metadata consistent across updates\n- Consider impact on dependent tasks\n\nExample:\n{\n  "path": "project/backend/api",\n  "updates": {\n    "status": "IN_PROGRESS",\n    "description": "Implementing core API endpoints with JWT auth",\n    "metadata": {\n      "assignee": "backend-team",\n      "progress": 35,\n      "currentPhase": "authentication"\n    }\n  }\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        path: { 
                                            type: 'string',
                                            description: 'Required: Path of the task to update. Must be an existing task path'
                                        },
                                        updates: {
                                            type: 'object',
                                            description: 'Required: Fields to update on the task. At least one update field must be provided',
                                            properties: {
                                                    name: { 
                                                        type: 'string',
                                                        description: 'Optional: New display name for the task'
                                                    },
                                                    description: { 
                                                        type: 'string',
                                                        description: 'Optional: New detailed description for the task'
                                                    },
                                                    status: { 
                                                        type: 'string', 
                                                        enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED'],
                                                        description: 'Optional: New status for the task. Must be one of the defined status values'
                                                    },
                                                    dependencies: { 
                                                        type: 'array', 
                                                        items: { type: 'string' },
                                                        description: 'Optional: New list of dependency task paths. Replaces existing dependencies'
                                                    },
                                                    metadata: { 
                                                        type: 'object',
                                                        description: 'Optional: Updated task metadata. Merges with existing metadata'
                                                    }
                                            }
                                        }
                                    },
                                    required: ['path', 'updates']
                                }
                            },
                            {
                                name: 'delete_task',
                                description: 'Delete a task and all its subtasks recursively. This operation cascades through the task hierarchy and cannot be undone.\n\nBest Practices:\n- Verify task path carefully before deletion\n- Check for dependent tasks that may be affected\n- Consider archiving important tasks instead of deletion\n- Back up task data if needed before deletion\n- Update dependent task references after deletion\n\nExample:\n{\n  "path": "project/backend"\n  // Will delete backend task and all subtasks like api, database, etc.\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        path: { 
                                            type: 'string',
                                            description: 'Required: Path of the task to delete. Will recursively delete this task and all its subtasks'
                                        }
                                    },
                                    required: ['path']
                                }
                            },
                            {
                                name: 'get_tasks_by_status',
                                description: 'Retrieve all tasks with a specific status. Useful for monitoring progress, finding blocked tasks, or generating status reports.\n\nStatus Values:\n- PENDING: Not started\n- IN_PROGRESS: Currently being worked on\n- COMPLETED: Finished successfully\n- FAILED: Encountered errors/issues\n- BLOCKED: Waiting on dependencies\n\nExample:\n{\n  "status": "BLOCKED"\n  // Returns all blocked tasks for investigation\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        status: { 
                                            type: 'string', 
                                            enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED'],
                                            description: 'Required: Status value to filter tasks by. Must be one of the defined status values'
                                        }
                                    },
                                    required: ['status']
                                }
                            },
                            {
                                name: 'get_tasks_by_path',
                                description: 'Retrieve tasks matching a glob pattern. Supports flexible path matching for finding related tasks.\n\nPattern Examples:\n- "project/*": Direct children of project\n- "project/**": All tasks under project (recursive)\n- "*/api": API tasks in any project\n- "backend/db*": All database-related tasks in backend\n\nBest Practices:\n- Use specific patterns to limit results\n- Consider hierarchy depth when using **\n- Combine with status/metadata filtering\n\nExample:\n{\n  "pattern": "project/backend/**"\n  // Returns all tasks under backend hierarchy\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        pattern: { 
                                            type: 'string',
                                            description: 'Required: Glob pattern to match task paths. Supports * for single level and ** for recursive matching'
                                        }
                                    },
                                    required: ['pattern']
                                }
                            },
                            {
                                name: 'get_subtasks',
                                description: 'Retrieve all direct subtasks of a given task. Returns only immediate children, not the entire subtree.\n\nBest Practices:\n- Use for targeted task management\n- Combine with get_tasks_by_path for deep hierarchies\n- Check subtask status for progress tracking\n- Monitor subtask dependencies\n\nExample:\n{\n  "parentPath": "project/backend"\n  // Returns direct subtasks like api, database, auth, etc.\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        parentPath: { 
                                            type: 'string',
                                            description: 'Required: Path of the parent task to get subtasks for. Must be an existing task path'
                                        }
                                    },
                                    required: ['parentPath']
                                }
                            },
                            {
                                name: 'bulk_task_operations',
                                description: 'Execute multiple task operations atomically in a single transaction. Ensures data consistency by rolling back all changes if any operation fails.\n\nSupported Operations:\n- create: Add new tasks\n- update: Modify existing tasks\n- delete: Remove tasks and subtasks\n\nBest Practices:\n- Group related changes together\n- Order operations to handle dependencies\n- Keep transactions focused and minimal\n- Include proper error handling\n- Validate data before submission\n\nExample:\n{\n  "operations": [\n    {\n      "type": "create",\n      "path": "project/backend/auth",\n      "data": {\n        "name": "Authentication Service",\n        "type": "TASK"\n      }\n    },\n    {\n      "type": "update",\n      "path": "project/backend/api",\n      "data": {\n        "status": "COMPLETED"\n      }\n    }\n  ]\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        operations: {
                                            type: 'array',
                                            description: 'Required: Array of task operations to execute atomically. Must contain at least one operation. All operations are executed in a single transaction - if any operation fails, all changes are rolled back',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    type: { 
                                                        type: 'string', 
                                                        enum: ['create', 'update', 'delete'],
                                                        description: 'Type of operation to perform'
                                                    },
                                                    path: { 
                                                        type: 'string',
                                                        description: 'Task path the operation applies to'
                                                    },
                                                    data: { 
                                                        type: 'object',
                                                        description: 'Operation data (CreateTaskInput for create, UpdateTaskInput for update)'
                                                    }
                                                },
                                                required: ['type', 'path']
                                            }
                                        }
                                    },
                                    required: ['operations']
                                }
                            },
                            // Database maintenance operations
                            {
                                name: 'clear_all_tasks',
                                description: 'Clear all tasks from the database and reset all caches. This is a destructive operation that requires explicit confirmation.\n\nBest Practices:\n- Use only for complete system reset\n- Backup data before clearing\n- Verify confirmation requirement\n- Plan for cache rebuild time\n- Consider selective deletion instead\n\nExample:\n{\n  "confirm": true\n  // Must be explicitly set to true\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        confirm: { 
                                            type: 'boolean',
                                            description: 'Required: Must be explicitly set to true to confirm deletion. This is a safety measure for this destructive operation'
                                        }
                                    },
                                    required: ['confirm']
                                }
                            },
                            {
                                name: 'vacuum_database',
                                description: 'Optimize database storage and performance by cleaning up unused space and updating statistics.\n\nBest Practices:\n- Run during low-usage periods\n- Schedule regular maintenance\n- Monitor space reclamation\n- Update statistics for query optimization\n- Back up before major operations\n\nExample:\n{\n  "analyze": true\n  // Also updates query statistics\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        analyze: { 
                                            type: 'boolean',
                                            description: 'Optional: Whether to run ANALYZE after VACUUM to update database statistics. Defaults to false'
                                        }
                                    }
                                }
                            },
                            {
                                name: 'repair_relationships',
                                description: 'Repair parent-child relationships and fix inconsistencies in the task hierarchy. Validates and corrects task relationships, orphaned tasks, and broken dependencies.\n\nBest Practices:\n- Run in dry-run mode first\n- Fix critical paths immediately\n- Schedule regular validation\n- Monitor repair results\n- Back up before repairs\n\nExample:\n{\n  "dryRun": true,\n  "pathPattern": "project/**"\n  // Check project hierarchy without making changes\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        dryRun: { 
                                            type: 'boolean',
                                            description: 'Optional: If true, only report issues without fixing them. Useful for safely checking what would be repaired. Defaults to false'
                                        },
                                        pathPattern: { 
                                            type: 'string',
                                            description: 'Optional: Pattern to limit which tasks to check relationships for. If not provided, checks all tasks'
                                        }
                                    }
                                }
                            },
                            {
                                name: 'update_task_statuses',
                                description: 'Update statuses of multiple tasks in a single batch operation. Validates status changes against dependencies and task hierarchy.\n\nBest Practices:\n- Group related status updates together\n- Consider dependency order\n- Update parent tasks last\n- Monitor status transitions\n- Handle failed updates\n\nExample:\n{\n  "updates": [\n    {\n      "path": "project/backend/api",\n      "status": "COMPLETED"\n    },\n    {\n      "path": "project/backend/database",\n      "status": "IN_PROGRESS"\n    }\n  ]\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        updates: {
                                            type: 'array',
                                            description: 'Array of status updates to process in batch',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    path: {
                                                        type: 'string',
                                                        description: 'Path of the task to update'
                                                    },
                                                    status: {
                                                        type: 'string',
                                                        enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED'],
                                                        description: 'New status for the task'
                                                    }
                                                },
                                                required: ['path', 'status']
                                            }
                                        }
                                    },
                                    required: ['updates']
                                }
                            },
                            {
                                name: 'update_task_dependencies',
                                description: 'Update dependencies of multiple tasks in a single batch operation. Validates dependency relationships and detects cycles.\n\nBest Practices:\n- Verify dependency paths exist\n- Avoid circular dependencies\n- Update related tasks together\n- Consider task hierarchy\n- Monitor dependency chains\n\nExample:\n{\n  "updates": [\n    {\n      "path": "project/backend/api",\n      "dependencies": ["project/backend/auth", "project/backend/database"]\n    },\n    {\n      "path": "project/backend/auth",\n      "dependencies": ["project/backend/database"]\n    }\n  ]\n}',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        updates: {
                                            type: 'array',
                                            description: 'Array of dependency updates to process in batch',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    path: {
                                                        type: 'string',
                                                        description: 'Path of the task to update'
                                                    },
                                                    dependencies: {
                                                        type: 'array',
                                                        items: { type: 'string' },
                                                        description: 'New list of dependency task paths'
                                                    }
                                                },
                                                required: ['path', 'dependencies']
                                            }
                                        }
                                    },
                                    required: ['updates']
                                }
                            }
                        ]
                    }),
                    handleToolCall: async (request) => {
                        const name = request.params?.name as string;
                        const args = request.params?.arguments as Record<string, any>;
                        let result;

                        try {
                            // Emit tool start event
                            eventManager.emitSystemEvent({
                                type: EventTypes.TOOL_STARTED,
                                timestamp: Date.now(),
                                metadata: {
                                    tool: name,
                                    args
                                }
                            });

                            switch (name) {
                            case 'create_task':
                                result = await taskManager.createTask(args as CreateTaskInput);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'update_task':
                                result = await taskManager.updateTask(args.path as string, args.updates as UpdateTaskInput);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'delete_task':
                                await taskManager.deleteTask(args.path as string);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: 'Task deleted successfully'
                                    }]
                                };
                            case 'get_tasks_by_status':
                                result = await taskManager.getTasksByStatus(args.status as TaskStatus);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'get_tasks_by_path':
                                result = await taskManager.listTasks(args.pattern as string);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'get_subtasks':
                                result = await taskManager.getSubtasks(args.parentPath as string);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'bulk_task_operations':
                                result = await taskManager.bulkTaskOperations({ operations: args.operations as Array<{ type: 'create' | 'update' | 'delete', path: string, data?: CreateTaskInput | UpdateTaskInput }> });
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'clear_all_tasks':
                                await taskManager.clearAllTasks(args.confirm as boolean);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: 'All tasks cleared successfully'
                                    }]
                                };
                            case 'vacuum_database':
                                await taskManager.vacuumDatabase(args.analyze as boolean);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: 'Database vacuumed successfully'
                                    }]
                                };
                            case 'repair_relationships':
                                result = await taskManager.repairRelationships(args.dryRun as boolean, args.pathPattern as string | undefined);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'update_task_statuses':
                                result = await taskManager.updateTaskStatuses(args.updates);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            case 'update_task_dependencies':
                                result = await taskManager.updateTaskDependencies(args.updates);
                                return {
                                    content: [{
                                        type: 'text',
                                        text: JSON.stringify(result, null, 2)
                                    }]
                                };
                            default:
                                throw createError(
                                    ErrorCodes.INVALID_INPUT,
                                    `Unknown tool: ${name}`,
                                    'handleToolCall'
                                );
                            }
                        } catch (error) {
                            // Emit tool error event
                            eventManager.emitErrorEvent({
                                type: EventTypes.SYSTEM_ERROR,
                                timestamp: Date.now(),
                                error: toSerializableError(error),
                                context: {
                                    component: 'ToolHandler',
                                    operation: name,
                                    args
                                }
                            });

                            // Format error response
                            const errorMessage = error instanceof BaseError 
                                ? error.getUserMessage()
                                : String(error);

                            return {
                                content: [{
                                    type: 'text',
                                    text: JSON.stringify({
                                        error: errorMessage,
                                        code: error instanceof BaseError ? error.code : ErrorCodes.INTERNAL_ERROR
                                    }, null, 2)
                                }],
                                isError: true
                            };
                        }
                    },
                    getStorageMetrics: async () => await storage.getMetrics(),
                    clearCaches: async () => {
                        await taskManager.clearCaches();
                    },
                    cleanup: async () => {
                        await taskManager.close();
                    }
                }
            );
            }
        } catch (error) {
            // Emit system error event
            eventManager.emitSystemEvent({
                type: EventTypes.SYSTEM_ERROR,
                timestamp: Date.now(),
                metadata: {
                    error: toSerializableError(error)
                }
            });

            logger.error('Failed to start server', error);
            process.exit(1);
        }

        // Log successful startup
        logger.info('Server initialization completed successfully');

        // Store cleanup handlers for proper removal
        const cleanupHandlers = new Map<string, () => Promise<void>>();

        // Handle graceful shutdown with proper cleanup order and timeouts
        const shutdown = async (reason: string = 'graceful_shutdown', timeout: number = 30000) => {
            logger.info('Initiating shutdown', { reason });
            try {
                // Emit system shutdown event
                eventManager.emitSystemEvent({
                    type: EventTypes.SYSTEM_SHUTDOWN,
                    timestamp: Date.now(),
                    metadata: { reason }
                });

                // Create shutdown promise with timeout
                const shutdownPromise = (async () => {
                    try {
                        // First stop accepting new requests
                        if (server) {
                            await Promise.race([
                                server.shutdown(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Server shutdown timeout')), 5000))
                            ]);
                        }

                        // Then cleanup task manager and its resources
                        if (taskManager) {
                            await Promise.race([
                                taskManager.cleanup(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Task manager cleanup timeout')), 10000))
                            ]);
                        }

                        // Finally close storage
                        if (storage) {
                            await Promise.race([
                                storage.close(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Storage close timeout')), 5000))
                            ]);
                        }

                        // Clear event manager and remove all handlers
                        eventManager.removeAllListeners();
                        cleanupHandlers.forEach((handler, signal) => {
                            process.removeListener(signal, handler);
                        });
                        cleanupHandlers.clear();

                        // Force final cleanup
                        if (global.gc) {
                            global.gc();
                        }

                        // Final logging before exit
                        logger.info('Server shutdown completed', { reason });
                    } catch (cleanupError) {
                        logger.error('Error during component cleanup', cleanupError);
                        throw cleanupError; // Re-throw to trigger force exit
                    }
                })();

                // Wait for shutdown with timeout
                await Promise.race([
                    shutdownPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), timeout))
                ]);

                // Clean exit
                process.nextTick(() => process.exit(0));
            } catch (error) {
                logger.error('Error during shutdown', error);
                // Force exit after error
                process.nextTick(() => process.exit(1));
            }
        };

        // Register shutdown handlers with proper cleanup
        const registerShutdownHandler = (signal: string, handler: () => Promise<void>) => {
            cleanupHandlers.set(signal, handler);
            process.on(signal, handler);
        };

        // Only register shutdown handlers after successful initialization
        if (server && storage && taskManager) {
            // Handle various shutdown signals with Windows compatibility
            registerShutdownHandler('SIGINT', () => shutdown('SIGINT'));
            registerShutdownHandler('SIGTERM', () => shutdown('SIGTERM'));
            registerShutdownHandler('beforeExit', () => shutdown('beforeExit'));
            
            // Windows-specific handling for CTRL+C and other termination signals
            if (process.platform === 'win32') {
                const readline = require('readline').createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                readline.on('SIGINT', () => {
                    process.emit('SIGINT');
                });

                // Handle Windows-specific process termination
                registerShutdownHandler('SIGHUP', () => shutdown('SIGHUP'));
                registerShutdownHandler('SIGBREAK', () => shutdown('SIGBREAK'));

                // Ensure readline interface is cleaned up
                cleanupHandlers.set('cleanup-readline', async () => {
                    readline.close();
                });
            }

            // Handle uncaught errors and rejections
            const errorHandler = (error: Error) => {
                logger.error('Uncaught error', error);
                shutdown('uncaught_error', 5000).catch(() => process.exit(1));
            };

            process.on('uncaughtException', errorHandler);
            process.on('unhandledRejection', errorHandler);
        }
    } catch (error) {
        // Don't log to console - MCP will handle the error
        process.exit(1);
    }
}

main().catch((error: Error) => {
    // Get logger instance if available
    let logger;
    try {
        logger = Logger.getInstance();
    } catch {
        // Don't log to console - MCP will handle the error
        process.exit(1);
    }

    // Log error and exit
    logger.error('Failed to start server', { error });
    process.exit(1);
});
