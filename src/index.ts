import { Logger } from './logging/index.js';
import { TaskManager } from './task-manager.js';
import { SqliteStorage } from './storage/sqlite-storage.js';
import { AtlasServer } from './server/index.js';
import { join } from 'path';
import { homedir } from 'os';

async function main() {
    // Initialize logger with file output
    const logDir = join(homedir(), 'Library', 'Logs', 'atlas-mcp-server');
    Logger.initialize({
        minLevel: 'info',
        console: false, // Disable console output
        file: true,
        logDir,
        maxFileSize: 5 * 1024 * 1024, // 5MB
        maxFiles: 5,
        noColors: true
    });

    const logger = Logger.getInstance();

    try {
        // Initialize storage
        const storage = new SqliteStorage({
            baseDir: join(homedir(), 'Library', 'Application Support', 'atlas-mcp-server'),
            name: 'tasks',
            connection: {
                busyTimeout: 5000
            },
            performance: {
                cacheSize: 2000,
                pageSize: 4096,
                mmapSize: 30000000000
            }
        });
        await storage.initialize();

        // Initialize task manager
        const taskManager = new TaskManager(storage);

        // Initialize server with tool handler
        const server = new AtlasServer(
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
                            description: 'Create a new task',
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
                            description: 'Update an existing task',
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
                            description: 'Delete a task and its subtasks',
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
                            description: 'Get tasks by status',
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
                            description: 'Get tasks matching a path pattern',
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
                            description: 'Get subtasks of a task',
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
                            description: 'Execute multiple task operations in a single transaction',
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
                            description: 'Clear all tasks from the database',
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
                            description: 'Optimize database storage',
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
                            description: 'Repair task relationships',
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
                    switch (name) {
                        case 'create_task':
                            return await taskManager.createTask(args);
                        case 'update_task':
                            return await taskManager.updateTask(args.path, args.updates);
                        case 'delete_task':
                            return await taskManager.deleteTask(args.path);
                        case 'get_tasks_by_status':
                            return await taskManager.getTasksByStatus(args.status);
                        case 'get_tasks_by_path':
                            return await taskManager.listTasks(args.pattern);
                        case 'get_subtasks':
                            return await taskManager.getSubtasks(args.parentPath);
                        case 'bulk_task_operations':
                            return await taskManager.bulkTaskOperations(args.operations);
                        case 'clear_all_tasks':
                            return await taskManager.clearAllTasks(args.confirm);
                        case 'vacuum_database':
                            return await taskManager.vacuumDatabase(args.analyze);
                        case 'repair_relationships':
                            return await taskManager.repairRelationships(args.dryRun, args.pathPattern);
                        default:
                            throw new Error(`Unknown tool: ${name}`);
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
        logger.error('Failed to start server', error);
        process.exit(1);
    }
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
