#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { TaskManager } from './task-manager.js';
import { CreateTaskInput, UpdateTaskInput, TaskStatus, BulkCreateTaskInput, BulkUpdateTasksInput } from './types.js';

class AtlasServer {
    private server: Server;
    private taskManager: TaskManager;

    constructor() {
        this.server = new Server(
            {
                name: 'atlas-mcp-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.taskManager = new TaskManager();
        
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });

        this.setupToolHandlers();
    }

    private formatResponse(response: unknown): string {
        return JSON.stringify(response, null, 2);
    }

    private setupToolHandlers(): void {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'create_task',
                    description: `Creates a new task with rich content support and automatic status tracking. Supports nested subtask creation.

Best Practices:
1. Dependencies must use actual task IDs, not arbitrary strings
2. Create dependent tasks in order, using the returned task IDs
3. Notes support markdown, code, and JSON formats
4. Use metadata.context to provide clear task context
5. Use metadata.tags for categorization
6. Consider task hierarchy - group related tasks under a parent
7. Use reasoning fields to document decision-making process - be clear and concise; 1-2 sentences max. Focus on actionable insights.

Example:
1. Create parent task first
2. Note its ID from the response
3. Create child tasks using parentId
4. Use previous task IDs for dependencies

Common Mistakes:
- Using string identifiers instead of task IDs for dependencies
- Creating tasks with dependencies before their dependent tasks exist
- Not maintaining proper task hierarchy
- Missing context in metadata
- Not documenting task reasoning and assumptions`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            parentId: {
                                type: ['string', 'null'],
                                description: 'ID of the parent task, or null for root tasks. Use this for creating hierarchical task structures.',
                            },
                            name: {
                                type: 'string',
                                description: 'Name of the task (max 200 characters)',
                            },
                            description: {
                                type: 'string',
                                description: 'Description of the task (max 2000 characters)',
                            },
                            notes: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        type: {
                                            type: 'string',
                                            enum: ['text', 'code', 'json', 'markdown'],
                                            description: 'Type of note',
                                        },
                                        content: {
                                            type: 'string',
                                            description: 'The actual note content',
                                        },
                                        language: {
                                            type: 'string',
                                            description: 'Programming language (required for code notes)',
                                        },
                                        metadata: {
                                            type: 'object',
                                            description: 'Additional metadata for the note',
                                        },
                                    },
                                    required: ['type', 'content'],
                                },
                                description: 'Rich notes associated with the task. Supports markdown for documentation, code with syntax highlighting, and structured JSON data.',
                            },
                            reasoning: {
                                type: 'object',
                                properties: {
                                    approach: {
                                        type: 'string',
                                        description: 'High-level approach and strategy for the task'
                                    },
                                    assumptions: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Key assumptions made when planning the task'
                                    },
                                    alternatives: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Alternative approaches that were considered'
                                    },
                                    risks: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Potential risks and challenges'
                                    },
                                    tradeoffs: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Key tradeoffs and decisions made'
                                    },
                                    constraints: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Technical or business constraints'
                                    },
                                    dependencies_rationale: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Reasoning behind task dependencies'
                                    },
                                    impact_analysis: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Analysis of task impact on system/project'
                                    }
                                },
                                description: 'Reasoning and decision-making documentation for the task'
                            },
                            type: {
                                type: 'string',
                                enum: ['task', 'milestone', 'group'],
                                description: 'Type of task for organizational purposes. Use "group" for parent tasks with subtasks, "milestone" for important checkpoints, and "task" for regular work items.',
                            },
                            dependencies: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'List of task IDs this task depends on. IMPORTANT: Must use actual task IDs returned from previous task creations, not arbitrary strings. Dependencies enforce task order and prevent circular relationships.',
                            },
                            metadata: {
                                type: 'object',
                                properties: {
                                    context: {
                                        type: 'string',
                                        description: 'Additional context about why this task exists and its role in the larger project',
                                    },
                                    tags: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Tags for categorizing and grouping related tasks',
                                    }
                                },
                                description: 'Additional task metadata for context and organization',
                            },
                            subtasks: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    description: 'Nested subtasks to create with this task. Consider task dependencies when ordering subtasks.',
                                    properties: {
                                        name: { type: 'string' },
                                        description: { type: 'string' },
                                        notes: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    type: {
                                                        type: 'string',
                                                        enum: ['text', 'code', 'json', 'markdown']
                                                    },
                                                    content: { type: 'string' },
                                                    language: { type: 'string' },
                                                    metadata: { type: 'object' }
                                                }
                                            }
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
                                            }
                                        },
                                        type: {
                                            type: 'string',
                                            enum: ['task', 'milestone', 'group']
                                        },
                                        dependencies: {
                                            type: 'array',
                                            items: { type: 'string' }
                                        },
                                        metadata: { type: 'object' },
                                        subtasks: {
                                            type: 'array',
                                            items: { type: 'object' }
                                        }
                                    }
                                }
                            }
                        },
                        required: ['name'],
                    },
                },
                {
                    name: 'bulk_create_tasks',
                    description: `Creates multiple tasks at once under the same parent.

Best Practices:
1. Use for creating related tasks that share the same parent
2. Consider task order and dependencies
3. Create dependent tasks in separate calls if they need IDs from previous tasks
4. Provide clear context and metadata for each task
5. Document reasoning for task organization

Common Mistakes:
- Trying to create dependent tasks before their dependencies exist
- Missing task context and metadata
- Not considering task hierarchy
- Missing reasoning documentation`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            parentId: {
                                type: ['string', 'null'],
                                description: 'ID of the parent task, or null for root tasks',
                            },
                            tasks: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string' },
                                        description: { type: 'string' },
                                        notes: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    type: {
                                                        type: 'string',
                                                        enum: ['text', 'code', 'json', 'markdown']
                                                    },
                                                    content: { type: 'string' },
                                                    language: { type: 'string' },
                                                    metadata: { type: 'object' }
                                                }
                                            }
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
                                            }
                                        },
                                        type: {
                                            type: 'string',
                                            enum: ['task', 'milestone', 'group']
                                        },
                                        dependencies: {
                                            type: 'array',
                                            items: { type: 'string' }
                                        },
                                        metadata: { type: 'object' },
                                        subtasks: {
                                            type: 'array',
                                            items: { type: 'object' }
                                        }
                                    },
                                    required: ['name']
                                },
                                description: 'Array of tasks to create. Consider task relationships and dependencies when ordering tasks.'
                            }
                        },
                        required: ['tasks'],
                    },
                },
                {
                    name: 'get_task',
                    description: `Retrieves a task by ID with all its content and metadata.

Best Practices:
1. Use to verify task creation and updates
2. Check task status and dependencies
3. Review subtask hierarchy`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            taskId: {
                                type: 'string',
                                description: 'ID of the task to retrieve',
                            },
                        },
                        required: ['taskId'],
                    },
                },
                {
                    name: 'update_task',
                    description: `Updates an existing task with automatic parent status updates and dependency validation.

Best Practices:
1. Verify task exists before updating
2. Consider impact on dependent tasks
3. Update status appropriately
4. Maintain task context in metadata
5. Document reasoning changes

Status Flow:
- pending → in_progress → completed
- pending → blocked (if dependencies not met)
- in_progress → failed (if issues occur)`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            taskId: {
                                type: 'string',
                                description: 'ID of the task to update',
                            },
                            updates: {
                                type: 'object',
                                properties: {
                                    name: { 
                                        type: 'string',
                                        description: 'New task name (max 200 characters)',
                                    },
                                    description: { 
                                        type: 'string',
                                        description: 'New task description (max 2000 characters)',
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
                                        description: 'Updated rich notes',
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
                                        description: 'Updated reasoning documentation'
                                    },
                                    type: {
                                        type: 'string',
                                        enum: ['task', 'milestone', 'group'],
                                        description: 'New task type',
                                    },
                                    status: {
                                        type: 'string',
                                        enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'],
                                        description: 'New task status. Parent status updates automatically based on subtask statuses.',
                                    },
                                    dependencies: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Updated dependencies. Must use valid task IDs. System prevents circular dependencies.',
                                    },
                                    metadata: {
                                        type: 'object',
                                        properties: {
                                            context: {
                                                type: 'string',
                                                description: 'Additional context about why this task exists',
                                            },
                                            tags: {
                                                type: 'array',
                                                items: { type: 'string' },
                                                description: 'Tags for categorizing the task',
                                            }
                                        },
                                        description: 'Updated metadata (merged with existing)',
                                    },
                                },
                            },
                        },
                        required: ['taskId', 'updates'],
                    },
                },
                {
                    name: 'bulk_update_tasks',
                    description: `Updates multiple tasks at once with automatic parent status updates and dependency validation.

Best Practices:
1. Use for batch status updates or metadata changes
2. Consider impact on task hierarchy
3. Maintain data consistency
4. Document changes in reasoning

Common Mistakes:
- Not using valid task IDs
- Creating circular dependencies
- Inconsistent status updates
- Missing context in updates`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            updates: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        taskId: {
                                            type: 'string',
                                            description: 'ID of the task to update',
                                        },
                                        updates: {
                                            type: 'object',
                                            properties: {
                                                name: { 
                                                    type: 'string',
                                                    description: 'New task name (max 200 characters)',
                                                },
                                                description: { 
                                                    type: 'string',
                                                    description: 'New task description (max 2000 characters)',
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
                                                    }
                                                },
                                                type: {
                                                    type: 'string',
                                                    enum: ['task', 'milestone', 'group'],
                                                },
                                                status: {
                                                    type: 'string',
                                                    enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'],
                                                },
                                                dependencies: {
                                                    type: 'array',
                                                    items: { type: 'string' },
                                                },
                                                metadata: {
                                                    type: 'object',
                                                    properties: {
                                                        context: { type: 'string' },
                                                        tags: {
                                                            type: 'array',
                                                            items: { type: 'string' }
                                                        }
                                                    }
                                                },
                                            }
                                        }
                                    },
                                    required: ['taskId', 'updates']
                                },
                                description: 'Array of task updates to apply'
                            }
                        },
                        required: ['updates']
                    }
                },
                {
                    name: 'delete_task',
                    description: `Safely deletes a task and its subtasks with dependency checking.

Best Practices:
1. Check for dependent tasks first
2. Consider impact on parent task
3. Verify task completion status

Common Mistakes:
- Deleting tasks that others depend on
- Not considering impact on project structure`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            taskId: {
                                type: 'string',
                                description: 'ID of the task to delete. Will fail if other tasks depend on this task.',
                            },
                        },
                        required: ['taskId'],
                    },
                },
                {
                    name: 'get_subtasks',
                    description: `Retrieves all subtasks of a task for hierarchy navigation.

Best Practices:
1. Use for understanding task breakdown
2. Check subtask status and progress
3. Verify task relationships`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            taskId: {
                                type: 'string',
                                description: 'ID of the task to get subtasks for',
                            },
                        },
                        required: ['taskId'],
                    },
                },
                {
                    name: 'get_task_tree',
                    description: `Retrieves the entire task hierarchy starting from root tasks.

Best Practices:
1. Use for understanding overall project structure
2. Check task relationships and dependencies
3. Monitor project progress
4. Verify task organization`,
                    inputSchema: {
                        type: 'object',
                        properties: {},
                    },
                },
                {
                    name: 'get_tasks_by_status',
                    description: `Retrieves all tasks with a specific status for progress tracking.

Best Practices:
1. Monitor task progress
2. Identify blocked or failed tasks
3. Track completion status
4. Find tasks needing attention`,
                    inputSchema: {
                        type: 'object',
                        properties: {
                            status: {
                                type: 'string',
                                enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked'],
                                description: 'Status to filter tasks by',
                            },
                        },
                        required: ['status'],
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                switch (request.params.name) {
                    case 'create_task': {
                        const args = request.params.arguments as unknown as { parentId: string | null } & CreateTaskInput;
                        const response = await this.taskManager.createTask(args.parentId, args);
                        return {
                            content: [{ 
                                type: 'text', 
                                text: this.formatResponse(response)
                            }],
                        };
                    }

                    case 'bulk_create_tasks': {
                        const args = request.params.arguments as unknown as BulkCreateTaskInput;
                        const response = await this.taskManager.bulkCreateTasks(args);
                        return {
                            content: [{ 
                                type: 'text', 
                                text: this.formatResponse(response)
                            }],
                        };
                    }

                    case 'get_task': {
                        const { taskId } = request.params.arguments as { taskId: string };
                        const response = await this.taskManager.getTask(taskId);
                        return {
                            content: [{ 
                                type: 'text', 
                                text: this.formatResponse(response)
                            }],
                        };
                    }

                    case 'update_task': {
                        const { taskId, updates } = request.params.arguments as {
                            taskId: string;
                            updates: UpdateTaskInput;
                        };
                        const response = await this.taskManager.updateTask(taskId, updates);
                        return {
                            content: [{ 
                                type: 'text', 
                                text: this.formatResponse(response)
                            }],
                        };
                    }

                    case 'bulk_update_tasks': {
                        const args = request.params.arguments as unknown as BulkUpdateTasksInput;
                        const response = await this.taskManager.bulkUpdateTasks(args);
                        return {
                            content: [{ 
                                type: 'text', 
                                text: this.formatResponse(response)
                            }],
                        };
                    }

                    case 'delete_task': {
                        const { taskId } = request.params.arguments as { taskId: string };
                        const response = await this.taskManager.deleteTask(taskId);
                        return {
                            content: [{ 
                                type: 'text', 
                                text: this.formatResponse(response)
                            }],
                        };
                    }

                    case 'get_subtasks': {
                        const { taskId } = request.params.arguments as { taskId: string };
                        const response = await this.taskManager.getSubtasks(taskId);
                        return {
                            content: [{ 
                                type: 'text', 
                                text: this.formatResponse(response)
                            }],
                        };
                    }

                    case 'get_task_tree': {
                        const response = await this.taskManager.getTaskTree();
                        return {
                            content: [{ 
                                type: 'text', 
                                text: this.formatResponse(response)
                            }],
                        };
                    }

                    case 'get_tasks_by_status': {
                        const { status } = request.params.arguments as { status: TaskStatus };
                        const response = await this.taskManager.getTasksByStatus(status);
                        return {
                            content: [{ 
                                type: 'text', 
                                text: this.formatResponse(response)
                            }],
                        };
                    }

                    default:
                        throw new McpError(
                            ErrorCode.MethodNotFound,
                            `Unknown tool: ${request.params.name}`
                        );
                }
            } catch (error) {
                if (error instanceof McpError) {
                    throw error;
                }
                throw new McpError(
                    ErrorCode.InternalError,
                    error instanceof Error ? error.message : 'Unknown error occurred'
                );
            }
        });
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Atlas MCP server running on stdio');
    }
}

const server = new AtlasServer();
server.run().catch(console.error);
