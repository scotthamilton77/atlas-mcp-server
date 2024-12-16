/**
 * Tool handler for Atlas MCP Server
 * Manages tool registration, execution, and response formatting
 */
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { TaskManager } from '../task-manager.js';
import {
    createTaskSchema,
    bulkCreateTasksSchema,
    updateTaskSchema,
    bulkUpdateTasksSchema,
    deleteTaskSchema,
    getSubtasksSchema,
    getTaskTreeSchema,
    getTasksByStatusSchema,
} from './schemas.js';
import { formatResponse } from '../tools/utils.js';
import { VisualizationHandler } from './visualization-handler.js';
import path from 'path';
import os from 'os';

/**
 * Handles all tool-related operations for the Atlas MCP Server
 */
export class ToolHandler {
    constructor(private taskManager: TaskManager) {}

    /**
     * Lists all available tools with their schemas and descriptions
     * @returns Promise resolving to the tool list response
     */
    async listTools() {
        return {
            tools: [
                {
                    name: 'create_task',
                    description: this.getCreateTaskDescription(),
                    inputSchema: createTaskSchema,
                },
                {
                    name: 'bulk_create_tasks',
                    description: this.getBulkCreateTasksDescription(),
                    inputSchema: bulkCreateTasksSchema,
                },
                {
                    name: 'get_task',
                    description: 'Retrieves a task by ID with all its content and metadata.',
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
                    description: this.getUpdateTaskDescription(),
                    inputSchema: updateTaskSchema,
                },
                {
                    name: 'bulk_update_tasks',
                    description: this.getBulkUpdateTasksDescription(),
                    inputSchema: bulkUpdateTasksSchema,
                },
                {
                    name: 'delete_task',
                    description: this.getDeleteTaskDescription(),
                    inputSchema: deleteTaskSchema,
                },
                {
                    name: 'get_subtasks',
                    description: this.getSubtasksDescription(),
                    inputSchema: getSubtasksSchema,
                },
                {
                    name: 'get_task_tree',
                    description: this.getTaskTreeDescription(),
                    inputSchema: getTaskTreeSchema,
                },
                {
                    name: 'get_tasks_by_status',
                    description: this.getTasksByStatusDescription(),
                    inputSchema: getTasksByStatusSchema,
                },
                {
                    name: 'visualize_tasks',
                    description: this.getVisualizeTasksDescription(),
                    inputSchema: {
                        type: 'object',
                        properties: {
                            format: {
                                type: 'string',
                                enum: ['terminal', 'html', 'both'],
                                description: 'Visualization format to generate',
                                default: 'both'
                            },
                            outputDir: {
                                type: 'string',
                                description: 'Directory to save visualizations (defaults to ~/Documents/atlas-tasks/visualizations)',
                                optional: true
                            }
                        }
                    },
                },
            ],
        };
    }

    /**
     * Handles tool execution requests
     * @param request The tool execution request
     * @returns Promise resolving to the tool execution response
     */
    async handleToolCall(request: any) {
        try {
            const response = await this.executeToolRequest(request);
            return {
                content: [{ 
                    type: 'text', 
                    text: formatResponse(response)
                }],
            };
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }
            throw new McpError(
                ErrorCode.InternalError,
                error instanceof Error ? error.message : 'Unknown error occurred'
            );
        }
    }

    /**
     * Executes the specific tool request based on the tool name
     * @param request The tool execution request
     * @returns Promise resolving to the tool execution result
     */
    private async executeToolRequest(request: any) {
        switch (request.params.name) {
            case 'create_task': {
                const args = request.params.arguments as any;
                return await this.taskManager.createTask(args.parentId, args);
            }

            case 'bulk_create_tasks': {
                const args = request.params.arguments as any;
                return await this.taskManager.bulkCreateTasks(args);
            }

            case 'get_task': {
                const { taskId } = request.params.arguments as { taskId: string };
                return await this.taskManager.getTask(taskId);
            }

            case 'update_task': {
                const { taskId, updates } = request.params.arguments as {
                    taskId: string;
                    updates: any;
                };
                return await this.taskManager.updateTask(taskId, updates);
            }

            case 'bulk_update_tasks': {
                const args = request.params.arguments as any;
                return await this.taskManager.bulkUpdateTasks(args);
            }

            case 'delete_task': {
                const { taskId } = request.params.arguments as { taskId: string };
                return await this.taskManager.deleteTask(taskId);
            }

            case 'get_subtasks': {
                const { taskId } = request.params.arguments as { taskId: string };
                return await this.taskManager.getSubtasks(taskId);
            }

            case 'get_task_tree': {
                return await this.taskManager.getTaskTree();
            }

            case 'get_tasks_by_status': {
                const { status } = request.params.arguments as { status: any };
                return await this.taskManager.getTasksByStatus(status);
            }

            case 'visualize_tasks': {
                const { format = 'both', outputDir } = request.params.arguments as {
                    format?: 'terminal' | 'html' | 'both';
                    outputDir?: string;
                };

                const tasks = (await this.taskManager.getTaskTree()).data;
                if (!tasks) {
                    return {
                        success: false,
                        error: {
                            code: 'NO_TASKS',
                            message: 'No tasks found to visualize'
                        }
                    };
                }

                const defaultDir = path.join(os.homedir(), 'Documents', 'atlas-tasks', 'visualizations');
                const visualizationDir = outputDir || defaultDir;

                const result = await VisualizationHandler.visualizeTasks(tasks, visualizationDir);

                return {
                    success: true,
                    data: {
                        format,
                        ...(format === 'terminal' || format === 'both' ? { terminalOutput: result.terminalOutput } : {}),
                        ...(format === 'html' || format === 'both' ? { htmlPath: result.htmlPath } : {})
                    },
                    metadata: {
                        timestamp: new Date().toISOString()
                    }
                };
            }

            default:
                throw new McpError(
                    ErrorCode.MethodNotFound,
                    `Unknown tool: ${request.params.name}`
                );
        }
    }

    /**
     * Returns the description for the create_task tool
     */
    private getCreateTaskDescription(): string {
        return `Creates a new task with rich content support and automatic status tracking. Supports nested subtask creation.

Best Practices:
1. Dependencies must use actual task IDs, not arbitrary strings
2. Create dependent tasks in order, using the returned task IDs
3. Notes support markdown, code, and JSON formats
4. Use metadata.context to provide clear task context
5. Use metadata.tags for categorization
6. Consider task hierarchy - group related tasks under a parent
7. Use reasoning fields to document decision-making process

Common Mistakes:
- Using string identifiers instead of task IDs for dependencies
- Creating tasks with dependencies before their dependent tasks exist
- Not maintaining proper task hierarchy
- Missing context in metadata
- Not documenting task reasoning and assumptions`;
    }

    /**
     * Returns the description for the bulk_create_tasks tool
     */
    private getBulkCreateTasksDescription(): string {
        return `Creates multiple tasks at once under the same parent.

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
- Missing reasoning documentation`;
    }

    /**
     * Returns the description for the update_task tool
     */
    private getUpdateTaskDescription(): string {
        return `Updates an existing task with automatic parent status updates and dependency validation.

Best Practices:
1. Verify task exists before updating
2. Consider impact on dependent tasks
3. Update status appropriately
4. Maintain task context in metadata
5. Document reasoning changes

Status Flow:
- pending → in_progress → completed
- pending → blocked (if dependencies not met)
- in_progress → failed (if issues occur)`;
    }

    /**
     * Returns the description for the bulk_update_tasks tool
     */
    private getBulkUpdateTasksDescription(): string {
        return `Updates multiple tasks at once with automatic parent status updates and dependency validation.

Best Practices:
1. Use for batch status updates or metadata changes
2. Consider impact on task hierarchy
3. Maintain data consistency
4. Document changes in reasoning

Common Mistakes:
- Not using valid task IDs
- Creating circular dependencies
- Inconsistent status updates
- Missing context in updates`;
    }

    /**
     * Returns the description for the delete_task tool
     */
    private getDeleteTaskDescription(): string {
        return `Safely deletes a task and its subtasks with dependency checking.

Best Practices:
1. Check for dependent tasks first
2. Consider impact on parent task
3. Verify task completion status

Common Mistakes:
- Deleting tasks that others depend on
- Not considering impact on project structure`;
    }

    /**
     * Returns the description for the get_subtasks tool
     */
    private getSubtasksDescription(): string {
        return `Retrieves all subtasks of a task for hierarchy navigation.

Best Practices:
1. Use for understanding task breakdown
2. Check subtask status and progress
3. Verify task relationships`;
    }

    /**
     * Returns the description for the get_task_tree tool
     */
    private getTaskTreeDescription(): string {
        return `Retrieves the entire task hierarchy starting from root tasks.

Best Practices:
1. Use for understanding overall project structure
2. Check task relationships and dependencies
3. Monitor project progress
4. Verify task organization`;
    }

    /**
     * Returns the description for the get_tasks_by_status tool
     */
    private getTasksByStatusDescription(): string {
        return `Retrieves all tasks with a specific status for progress tracking.

Best Practices:
1. Monitor task progress
2. Identify blocked or failed tasks
3. Track completion status
4. Find tasks needing attention`;
    }

    /**
     * Returns the description for the visualize_tasks tool
     */
    private getVisualizeTasksDescription(): string {
        return `Generate visual representations of tasks including terminal tree view and interactive HTML visualization.

Features:
1. Terminal Tree View
   - Hierarchical display with status indicators
   - Task type symbols
   - Dependency information
   - Compact and readable format

2. HTML Visualization
   - Interactive Mermaid.js diagram
   - Status-based color coding
   - Collapsible task details
   - Dependency arrows
   - Task metadata display

Best Practices:
1. Use terminal view for quick overview
2. Use HTML view for detailed analysis
3. Save visualizations for documentation
4. Update visualizations after major changes
5. Share HTML view with stakeholders

Output:
- Terminal: ASCII/Unicode tree with status indicators
- HTML: Interactive diagram with full task details
- Both: Combined output for comprehensive view`;
    }
}
