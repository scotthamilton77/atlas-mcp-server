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

Task Types:
- task: Standard work item (default)
- milestone: Key achievement or deliverable
- group: Container for related tasks

Best Practices:
1. Dependencies:
   - Always use actual task IDs returned from create_task
   - Create dependent tasks in sequence to get their IDs
   - Update dependencies after task creation if needed
   - Document dependency rationale

2. Task Structure:
   - Use clear, action-oriented names
   - Group related tasks under a parent
   - Break complex tasks into subtasks
   - Keep task descriptions focused and specific

3. Documentation:
   - Use markdown notes for detailed documentation
   - Add code notes with proper language tags
   - Include JSON notes for structured data
   - Document assumptions and constraints

4. Metadata:
   - Add clear context about task purpose
   - Use consistent tag naming
   - Tag for easy filtering (e.g., priority, domain)
   - Include relevant links or references

5. Status Management:
   - Tasks start as 'pending'
   - Update to 'in_progress' when work begins
   - Mark 'blocked' if dependencies aren't met
   - Set 'completed' only when verified
   - Use 'failed' for documented failures

Common Mistakes:
- Creating dependent tasks without parent IDs
- Missing dependency documentation
- Unclear task hierarchies
- Incomplete metadata
- Poor status tracking
- Missing reasoning documentation`;
    }

    /**
     * Returns the description for the bulk_create_tasks tool
     */
    private getBulkCreateTasksDescription(): string {
        return `Creates multiple tasks at once under the same parent.

Workflow Patterns:
1. Related Features:
   - Create parent group task
   - Add feature tasks as children
   - Set appropriate dependencies

2. Project Milestones:
   - Create milestone sequence
   - Add dependent task groups
   - Link with dependencies

3. Task Breakdown:
   - Create epic/story parent
   - Add implementation tasks
   - Set task relationships

Best Practices:
1. Task Organization:
   - Group related tasks together
   - Maintain clear hierarchy
   - Use consistent naming
   - Set proper task types

2. Dependencies:
   - Create independent tasks first
   - Add dependencies in later batch
   - Document relationships
   - Verify task order

3. Documentation:
   - Add detailed descriptions
   - Include acceptance criteria
   - Document assumptions
   - Set clear context

Common Mistakes:
- Circular dependencies
- Missing parent context
- Inconsistent metadata
- Poor task organization
- Unclear relationships`;
    }

    /**
     * Returns the description for the update_task tool
     */
    private getUpdateTaskDescription(): string {
        return `Updates an existing task with automatic parent status updates and dependency validation.

Status Workflow:
1. New Task Flow:
   pending → in_progress → completed
   
2. Blocked Flow:
   pending → blocked (dependencies not met)
   blocked → in_progress (dependencies resolved)
   
3. Failed Flow:
   in_progress → failed (issues encountered)
   failed → in_progress (retry attempt)

Best Practices:
1. Status Updates:
   - Verify task exists before update
   - Check dependency status
   - Update parent status
   - Document status changes

2. Dependency Management:
   - Validate new dependencies
   - Update dependent tasks
   - Check for circular deps
   - Document relationship changes

3. Content Updates:
   - Maintain task context
   - Update progress notes
   - Document blockers
   - Track time estimates

4. Metadata Management:
   - Keep tags consistent
   - Update priority if needed
   - Maintain clear context
   - Document changes

Common Mistakes:
- Invalid status transitions
- Breaking dependency chain
- Missing status rationale
- Incomplete updates
- Poor change tracking`;
    }

    /**
     * Returns the description for the bulk_update_tasks tool
     */
    private getBulkUpdateTasksDescription(): string {
        return `Updates multiple tasks at once with automatic parent status updates and dependency validation.

Update Patterns:
1. Status Updates:
   - Mark sprint tasks complete
   - Update blocked tasks
   - Progress task group

2. Dependency Updates:
   - Reorder task sequence
   - Update blocked tasks
   - Modify task relationships

3. Content Updates:
   - Add sprint notes
   - Update estimates
   - Modify descriptions

Best Practices:
1. Batch Planning:
   - Group related updates
   - Consider dependencies
   - Verify task states
   - Document changes

2. Status Management:
   - Update in proper order
   - Check dependency impact
   - Maintain consistency
   - Track progress

3. Documentation:
   - Note batch changes
   - Update timestamps
   - Record decisions
   - Track progress

Common Mistakes:
- Inconsistent states
- Breaking dependencies
- Missing documentation
- Poor change tracking
- Invalid task IDs`;
    }

    /**
     * Returns the description for the delete_task tool
     */
    private getDeleteTaskDescription(): string {
        return `Safely deletes a task and its subtasks with dependency checking.

Deletion Patterns:
1. Single Task:
   - Check dependencies
   - Update parent status
   - Remove task data

2. Task Group:
   - Verify subtasks
   - Check dependencies
   - Clean up hierarchy

3. Failed Tasks:
   - Document reason
   - Update dependencies
   - Clean up resources

Best Practices:
1. Pre-Deletion:
   - Check dependent tasks
   - Verify completion
   - Document reason
   - Update references

2. Cleanup:
   - Remove dependencies
   - Update parent tasks
   - Clean metadata
   - Archive if needed

3. Documentation:
   - Record deletion reason
   - Update related tasks
   - Maintain history
   - Track impact

Common Mistakes:
- Deleting active tasks
- Breaking dependencies
- Missing documentation
- Incomplete cleanup`;
    }

    /**
     * Returns the description for the get_subtasks tool
     */
    private getSubtasksDescription(): string {
        return `Retrieves all subtasks of a task for hierarchy navigation.

Usage Patterns:
1. Progress Tracking:
   - Check subtask status
   - Monitor blockers
   - Track completion

2. Dependency Review:
   - Verify relationships
   - Check blockers
   - Monitor progress

3. Task Planning:
   - Review workload
   - Check estimates
   - Plan resources

Best Practices:
1. Regular Review:
   - Check status daily
   - Monitor blockers
   - Track progress
   - Update estimates

2. Documentation:
   - Note relationships
   - Track changes
   - Document decisions
   - Monitor impact

3. Organization:
   - Group related tasks
   - Maintain hierarchy
   - Track dependencies
   - Monitor progress`;
    }

    /**
     * Returns the description for the get_task_tree tool
     */
    private getTaskTreeDescription(): string {
        return `Retrieves the entire task hierarchy starting from root tasks.

Analysis Patterns:
1. Project Overview:
   - Review structure
   - Check progress
   - Monitor blockers

2. Status Review:
   - Track completion
   - Find blockers
   - Monitor progress

3. Planning:
   - Analyze workload
   - Check dependencies
   - Plan resources

Best Practices:
1. Regular Review:
   - Monitor daily
   - Track changes
   - Update status
   - Check blockers

2. Organization:
   - Maintain hierarchy
   - Group tasks
   - Track progress
   - Monitor impact

3. Documentation:
   - Note changes
   - Track decisions
   - Monitor progress
   - Update status`;
    }

    /**
     * Returns the description for the get_tasks_by_status tool
     */
    private getTasksByStatusDescription(): string {
        return `Retrieves all tasks with a specific status for progress tracking.

Status Types:
1. pending: Not started
2. in_progress: Active work
3. completed: Done & verified
4. failed: Issues found
5. blocked: Dependencies pending

Best Practices:
1. Status Review:
   - Check daily
   - Monitor changes
   - Track progress
   - Update blocked

2. Progress Tracking:
   - Monitor completion
   - Check blockers
   - Update status
   - Track changes

3. Documentation:
   - Note status changes
   - Track decisions
   - Monitor impact
   - Update estimates`;
    }
}
