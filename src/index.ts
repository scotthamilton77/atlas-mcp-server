import { Logger } from './logging/index.js';
import { TaskManager } from './task-manager.js';
import { createStorage } from './storage/index.js';
import { AtlasServer } from './server/index.js';
import { EventManager } from './events/event-manager.js';
import { EventTypes } from './types/events.js';
import { BaseError, ErrorCodes, createError } from './errors/index.js';
import { ConfigManager } from './config/index.js';
import { join } from 'path';
import { promises as fs } from 'fs';

import { TaskStorage } from './types/storage.js';
import { CreateTaskInput, UpdateTaskInput, TaskStatus } from './types/task.js';

let server: AtlasServer;
let storage: TaskStorage;
let taskManager: TaskManager;

async function main() {
    // Load environment variables from .env file if present
    try {
        const { config } = await import('dotenv');
        config();
    } catch (error) {
        // Ignore error if .env file doesn't exist
    }

    // Initialize logger first before any other operations
    const logDir = process.env.ATLAS_STORAGE_DIR ? 
        `${process.env.ATLAS_STORAGE_DIR}/logs` : 
        join(process.env.HOME || '', 'Documents/Cline/mcp-workspace/ATLAS/logs');

    // Create log directory with proper permissions
    await fs.mkdir(logDir, { recursive: true, mode: 0o755 });

    // Initialize logger with explicit file permissions and await initialization
    const logger = await Logger.initialize({
        console: true,
        file: true,
        minLevel: 'debug',
        logDir: logDir,  // Ensure logDir is explicitly set
        maxFileSize: 5 * 1024 * 1024, // 5MB
        maxFiles: 5,
        noColors: false  // Enable colors for better readability
    });
    logger.info('Logger initialized', { logDir, permissions: '0755' });

    // Ensure logger is fully initialized before proceeding
    await new Promise(resolve => setTimeout(resolve, 100));

    // Increase event listener limits to prevent warnings
    process.setMaxListeners(20);

    // Initialize components in correct order
    const eventManager = await EventManager.initialize();
    const configManager = await ConfigManager.initialize({
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

        // Initialize storage with mutex
        storage = await createStorage(config.storage);
        
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
                shutdownTimeout: 5000
            },
            {
                listTools: async () => ({
                    tools: [
                        // Task CRUD operations
                        {
                            name: 'create_task',
                            description: 'Create a new task in the hierarchical task structure. Tasks can be organized in a tree-like structure with parent-child relationships and dependencies. Each task has a unique path identifier, metadata, and status tracking.\n\nBest Practices:\n- Use descriptive path names that reflect the task hierarchy (e.g., "project/feature/subtask")\n- Set appropriate task types (TASK for work items, GROUP for organization, MILESTONE for major checkpoints)\n- Include detailed descriptions for better context\n- Use metadata for custom fields like priority, tags, or deadlines\n- Consider dependencies carefully to avoid circular references\n\nExample:\n{\n  "path": "website/auth/login-form",\n  "name": "Implement login form",\n  "description": "Create React component for user authentication",\n  "type": "TASK",\n  "parentPath": "website/auth",\n  "dependencies": ["website/auth/api-endpoints"],\n  "metadata": {\n    "priority": "high",\n    "estimatedHours": 4,\n    "tags": ["frontend", "security"]\n  }\n}',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    path: { 
                                        type: 'string',
                                        description: 'Optional: Unique path identifier for the task (e.g., "project/feature/subtask"). If not provided, will be generated from name'
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
                                        enum: ['TASK', 'GROUP', 'MILESTONE'],
                                        description: 'Optional: Type of task: TASK (individual task), GROUP (container), or MILESTONE (major checkpoint). Defaults to TASK'
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
                                required: ['name']
                            }
                        },
                        {
                            name: 'update_task',
                            description: 'Update an existing task\'s properties including status, dependencies, and metadata. All changes are validated for consistency and dependency cycles.\n\nBest Practices:\n- Update only the fields that need to change\n- Use appropriate status values to track progress\n- Validate dependencies before updating\n- Keep metadata consistent across updates\n- Consider impact on dependent tasks\n\nExample:\n{\n  "path": "website/auth/login-form",\n  "updates": {\n    "status": "IN_PROGRESS",\n    "description": "Updated implementation details...",\n    "metadata": {\n      "assignee": "john.doe",\n      "progress": 50\n    }\n  }\n}',
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
                            description: 'Delete a task and all its subtasks recursively. This operation cascades through the task hierarchy and cannot be undone.\n\nBest Practices:\n- Verify task path carefully before deletion\n- Check for dependent tasks that may be affected\n- Consider archiving important tasks instead of deletion\n- Back up task data if needed before deletion\n- Update dependent task references after deletion\n\nExample:\n{\n  "path": "website/auth"\n  // Will delete auth task and all subtasks like login-form, etc.\n}',
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
                            description: 'Retrieve tasks matching a glob pattern. Supports flexible path matching for finding related tasks.\n\nPattern Examples:\n- "project/*": Direct children of project\n- "project/**": All tasks under project (recursive)\n- "*/feature": Feature tasks in any project\n- "auth/login*": All login-related tasks in auth\n\nBest Practices:\n- Use specific patterns to limit results\n- Consider hierarchy depth when using **\n- Combine with status/metadata filtering\n\nExample:\n{\n  "pattern": "website/auth/**"\n  // Returns all tasks under auth hierarchy\n}',
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
                            description: 'Retrieve all direct subtasks of a given task. Returns only immediate children, not the entire subtree.\n\nBest Practices:\n- Use for targeted task management\n- Combine with get_tasks_by_path for deep hierarchies\n- Check subtask status for progress tracking\n- Monitor subtask dependencies\n\nExample:\n{\n  "parentPath": "website/auth"\n  // Returns direct subtasks like login-form, signup-form, etc.\n}',
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
                            description: 'Execute multiple task operations atomically in a single transaction. Ensures data consistency by rolling back all changes if any operation fails.\n\nSupported Operations:\n- create: Add new tasks\n- update: Modify existing tasks\n- delete: Remove tasks and subtasks\n\nBest Practices:\n- Group related changes together\n- Order operations to handle dependencies\n- Keep transactions focused and minimal\n- Include proper error handling\n- Validate data before submission\n\nExample:\n{\n  "operations": [\n    {\n      "type": "create",\n      "path": "website/auth/oauth",\n      "data": {\n        "name": "OAuth Integration",\n        "type": "TASK"\n      }\n    },\n    {\n      "type": "update",\n      "path": "website/auth/login-form",\n      "data": {\n        "status": "COMPLETED"\n      }\n    }\n  ]\n}',
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
                            description: 'Repair parent-child relationships and fix inconsistencies in the task hierarchy. Validates and corrects task relationships, orphaned tasks, and broken dependencies.\n\nBest Practices:\n- Run in dry-run mode first\n- Fix critical paths immediately\n- Schedule regular validation\n- Monitor repair results\n- Back up before repairs\n\nExample:\n{\n  "dryRun": true,\n  "pathPattern": "website/**"\n  // Check website hierarchy without making changes\n}',
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
                        }
                    ]
                }),
                handleToolCall: async (request) => {
                    const name = request.params?.name as string;
                    const args = request.params?.arguments as Record<string, any>;
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
                            result = await taskManager.bulkTaskOperations(args.operations as Array<{ type: 'create' | 'update' | 'delete', path: string, data?: CreateTaskInput | UpdateTaskInput }>);
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
        }
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

            // Cleanup in specific order to ensure proper shutdown
            try {
                // First stop accepting new requests
                if (server) {
                    await server.shutdown();
                }

                // Then cleanup task manager and its resources
                if (taskManager) {
                    await taskManager.cleanup();
                }

                // Finally close storage
                if (storage) {
                    await storage.close();
                }

                // Clear event manager
                eventManager.removeAllListeners();

                // Force final cleanup
                if (global.gc) {
                    global.gc();
                }

                // Remove process event listeners
                process.removeAllListeners();
            } catch (cleanupError) {
                logger.error('Error during component cleanup', cleanupError);
                // Continue with shutdown despite cleanup errors
            }

            // Final logging before exit
            logger.info('Server shutdown completed', { reason });
            
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
