import { Logger } from './logging/index.js';
import { TaskManager } from './task-manager.js';
import { createStorage } from './storage/index.js';
import { AtlasServer } from './server/index.js';
import { EventManager } from './events/event-manager.js';
import { EventTypes } from './types/events.js';
import { BaseError, ErrorCodes, createError } from './errors/index.js';
import { ConfigManager } from './config/index.js';

import { TaskStorage } from './types/storage.js';

let server: AtlasServer;
let storage: TaskStorage;

async function main() {
    // Load environment variables from .env file if present
    try {
        const { config } = await import('dotenv');
        config();
    } catch (error) {
        // Ignore error if .env file doesn't exist
    }

    // Initialize logger first before any other operations
    Logger.initialize({
        console: true,
        file: true,
        minLevel: 'debug',
        logDir: process.env.ATLAS_STORAGE_DIR ? `${process.env.ATLAS_STORAGE_DIR}/logs` : 'logs',
        maxFileSize: 5 * 1024 * 1024, // 5MB
        maxFiles: 5
    });
    const logger = Logger.getInstance();

    // Then initialize other components
    const eventManager = EventManager.getInstance();
    const configManager = ConfigManager.getInstance();
    
    // Update config after logger is initialized
    await configManager.updateConfig({
        logging: {
            console: true,
            file: true,
            level: 'debug'
        },
        storage: {
            baseDir: process.env.ATLAS_STORAGE_DIR || 'atlas-tasks',
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

        // Initialize storage using factory
        storage = await createStorage(config.storage);

        // Initialize task manager
        const taskManager = new TaskManager(storage);

        // Initialize server with tool handler
        server = new AtlasServer(
            {
                name: 'atlas-mcp-server',
                version: '0.1.0',
                maxRequestsPerMinute: 600,
                requestTimeout: 30000,
                shutdownTimeout: 5000
            },
            {
                listTools: async () => ({
                    tools: [
                        // Task CRUD operations
                        {
                            name: 'create_task',
                            description: 'Create a new task in the hierarchical task structure. Supports parent-child relationships and task dependencies.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    path: { 
                                        type: 'string',
                                        description: 'Unique path identifier for the task (e.g., "project/feature/subtask")'
                                    },
                                    name: { 
                                        type: 'string',
                                        description: 'Display name of the task'
                                    },
                                    description: { 
                                        type: 'string',
                                        description: 'Detailed description of the task'
                                    },
                                    type: { 
                                        type: 'string', 
                                        enum: ['TASK', 'GROUP', 'MILESTONE'],
                                        description: 'Type of task: TASK (individual task), GROUP (container), or MILESTONE (major checkpoint)'
                                    },
                                    parentPath: { 
                                        type: 'string',
                                        description: 'Path of the parent task if this is a subtask'
                                    },
                                    dependencies: { 
                                        type: 'array', 
                                        items: { type: 'string' },
                                        description: 'Array of task paths that must be completed before this task can start'
                                    },
                                    metadata: { 
                                        type: 'object',
                                        description: 'Additional task metadata like priority, tags, or custom fields'
                                    }
                                },
                                required: ['name']
                            }
                        },
                        {
                            name: 'update_task',
                            description: 'Update an existing task\'s properties including status, dependencies, and metadata. Changes are validated for consistency.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    path: { 
                                        type: 'string',
                                        description: 'Path of the task to update'
                                    },
                                    updates: {
                                        type: 'object',
                                        description: 'Fields to update on the task',
                                        properties: {
                                            name: { 
                                                type: 'string',
                                                description: 'New display name'
                                            },
                                            description: { 
                                                type: 'string',
                                                description: 'New task description'
                                            },
                                            status: { 
                                                type: 'string', 
                                                enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED'],
                                                description: 'New task status'
                                            },
                                            dependencies: { 
                                                type: 'array', 
                                                items: { type: 'string' },
                                                description: 'Updated list of dependency task paths'
                                            },
                                            metadata: { 
                                                type: 'object',
                                                description: 'Updated task metadata'
                                            }
                                        }
                                    }
                                },
                                required: ['path', 'updates']
                            }
                        },
                        {
                            name: 'delete_task',
                            description: 'Delete a task and all its subtasks recursively. This operation cannot be undone.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    path: { 
                                        type: 'string',
                                        description: 'Path of the task to delete (will also delete all subtasks)'
                                    }
                                },
                                required: ['path']
                            }
                        },
                        {
                            name: 'get_tasks_by_status',
                            description: 'Retrieve all tasks with a specific status (PENDING, IN_PROGRESS, COMPLETED, FAILED, or BLOCKED).',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    status: { 
                                        type: 'string', 
                                        enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED'],
                                        description: 'Status to filter tasks by'
                                    }
                                },
                                required: ['status']
                            }
                        },
                        {
                            name: 'get_tasks_by_path',
                            description: 'Retrieve tasks matching a glob pattern (e.g., "project/*" for all tasks in project, "auth/**" for all tasks under auth/).',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    pattern: { 
                                        type: 'string',
                                        description: 'Glob pattern to match task paths (e.g., "project/*" for all tasks in project)'
                                    }
                                },
                                required: ['pattern']
                            }
                        },
                        {
                            name: 'get_subtasks',
                            description: 'Retrieve all direct subtasks of a given task. Does not include nested subtasks of subtasks.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    parentPath: { 
                                        type: 'string',
                                        description: 'Path of the parent task to get subtasks for'
                                    }
                                },
                                required: ['parentPath']
                            }
                        },
                        {
                            name: 'bulk_task_operations',
                            description: 'Execute multiple task operations (create, update, delete) in a single transaction. If any operation fails, all changes are rolled back.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    operations: {
                                        type: 'array',
                                        description: 'Array of task operations to execute in sequence. All operations are executed in a single transaction - if any operation fails, all changes are rolled back.',
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
                            description: 'Clear all tasks from the database and reset all caches. Requires explicit confirmation.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    confirm: { 
                                        type: 'boolean',
                                        description: 'Must be true to confirm deletion of all tasks'
                                    }
                                },
                                required: ['confirm']
                            }
                        },
                        {
                            name: 'vacuum_database',
                            description: 'Optimize database storage and performance by cleaning up unused space and updating statistics.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    analyze: { 
                                        type: 'boolean',
                                        description: 'Whether to run ANALYZE after VACUUM to update database statistics'
                                    }
                                }
                            }
                        },
                        {
                            name: 'repair_relationships',
                            description: 'Repair parent-child relationships and fix inconsistencies in the task hierarchy. Can be run in dry-run mode.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    dryRun: { 
                                        type: 'boolean',
                                        description: 'If true, only report issues without fixing them'
                                    },
                                    pathPattern: { 
                                        type: 'string',
                                        description: 'Optional pattern to limit which tasks to check relationships for'
                                    }
                                }
                            }
                        }
                    ]
                }),
                handleToolCall: async (request) => {
                    const { name, arguments: args } = request.params;
                    const eventManager = EventManager.getInstance();
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
                            result = await taskManager.createTask(args);
                            return {
                                content: [{
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2)
                                }]
                            };
                        case 'update_task':
                            result = await taskManager.updateTask(args.path, args.updates);
                            return {
                                content: [{
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2)
                                }]
                            };
                        case 'delete_task':
                            await taskManager.deleteTask(args.path);
                            return {
                                content: [{
                                    type: 'text',
                                    text: 'Task deleted successfully'
                                }]
                            };
                        case 'get_tasks_by_status':
                            result = await taskManager.getTasksByStatus(args.status);
                            return {
                                content: [{
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2)
                                }]
                            };
                        case 'get_tasks_by_path':
                            result = await taskManager.listTasks(args.pattern);
                            return {
                                content: [{
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2)
                                }]
                            };
                        case 'get_subtasks':
                            result = await taskManager.getSubtasks(args.parentPath);
                            return {
                                content: [{
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2)
                                }]
                            };
                        case 'bulk_task_operations':
                            result = await taskManager.bulkTaskOperations(args.operations);
                            return {
                                content: [{
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2)
                                }]
                            };
                        case 'clear_all_tasks':
                            await taskManager.clearAllTasks(args.confirm);
                            return {
                                content: [{
                                    type: 'text',
                                    text: 'All tasks cleared successfully'
                                }]
                            };
                        case 'vacuum_database':
                            await taskManager.vacuumDatabase(args.analyze);
                            return {
                                content: [{
                                    type: 'text',
                                    text: 'Database vacuumed successfully'
                                }]
                            };
                        case 'repair_relationships':
                            result = await taskManager.repairRelationships(args.dryRun, args.pathPattern);
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
                        error: error instanceof Error ? error : new Error(String(error)),
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

        // Run server
        await server.run();
    } catch (error) {
        // Emit system error event
        eventManager.emitSystemEvent({
            type: EventTypes.SYSTEM_ERROR,
            timestamp: Date.now(),
            metadata: {
                error: error instanceof Error ? error : new Error(String(error))
            }
        });

        logger.error('Failed to start server', error);
        process.exit(1);
    }

    // Handle graceful shutdown
    const shutdown = async (reason: string = 'graceful_shutdown') => {
        try {
            // Emit system shutdown event
            eventManager.emitSystemEvent({
                type: EventTypes.SYSTEM_SHUTDOWN,
                timestamp: Date.now(),
                metadata: { reason }
            });

            // Ensure all cleanup happens before exit
            await Promise.all([
                server.shutdown(),
                storage.close()
            ]);

            // Force final cleanup
            if (global.gc) {
                global.gc();
            }

            // Remove all event listeners
            process.removeAllListeners();
            
            // Exit after cleanup
            process.nextTick(() => process.exit(0));
        } catch (error) {
            logger.error('Error during shutdown', error);
            process.nextTick(() => process.exit(1));
        }
    };

    // Handle various shutdown signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('beforeExit', () => shutdown('beforeExit'));
    process.on('exit', () => {
        try {
            // Synchronous cleanup for exit event
            if (global.gc) {
                global.gc();
            }
        } catch (error) {
            console.error('Error during final cleanup:', error);
        }
    });
}

main().catch((error) => {
    // Get logger instance if available, otherwise fallback to console
    try {
        const logger = Logger.getInstance();
        logger.fatal('Fatal error during startup', error);
    } catch {
        // If logger isn't initialized, fallback to console
        console.error('Fatal error:', error);
    }
    process.exit(1);
});
