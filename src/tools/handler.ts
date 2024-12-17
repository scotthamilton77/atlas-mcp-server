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
    // Tools that require input parameters
    private readonly TOOLS_REQUIRING_INPUT = new Set([
        'create_task',
        'bulk_create_tasks',
        'get_task',
        'update_task',
        'bulk_update_tasks',
        'delete_task',
        'get_subtasks',
        'get_tasks_by_status'
    ]);

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
                    description: 'Retrieves a task by ID with all its content and metadata. Use task ID to retrieve. Review tasks often to track progress and update status.',
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
     */
    async handleToolCall(request: any) {
        try {
            // Only check for empty input on tools that require parameters
            if (this.TOOLS_REQUIRING_INPUT.has(request.params.name) && 
                (!request.params.arguments || Object.keys(request.params.arguments).length === 0)) {
                return this.handleEmptyInputError(request.params.name);
            }

            const response = await this.executeToolRequest(request);
            return {
                content: [{ 
                    type: 'text', 
                    text: formatResponse(response)
                }],
            };
        } catch (error) {
            return this.handleToolError(error, request.params.name);
        }
    }

    /**
     * Handles empty input errors with tool-specific guidance
     */
    private handleEmptyInputError(toolName: string): { content: { type: string, text: string }[] } {
        let message: string;
        let help: string;

        switch (toolName) {
            case 'create_task':
                message = 'Task creation requires at least a name. Required fields:\n- name: Task name (string, required)\n\nOptional fields:\n- description: Task description\n- type: Task type (task/milestone/group)\n- notes: Array of task notes\n- dependencies: Array of task IDs';
                help = 'Example:\n{\n  "name": "My Task",\n  "description": "Optional description"\n}';
                break;
            case 'get_task':
            case 'get_subtasks':
                message = 'Task ID is required';
                help = 'Example:\n{\n  "taskId": "task-uuid-here"\n}';
                break;
            case 'update_task':
                message = 'Task ID and updates are required';
                help = 'Example:\n{\n  "taskId": "task-uuid-here",\n  "updates": {\n    "name": "Updated Task Name"\n  }\n}';
                break;
            case 'get_tasks_by_status':
                message = 'Status is required. Must be one of: pending, in_progress, completed, failed, blocked';
                help = 'Example:\n{\n  "status": "pending"\n}';
                break;
            default:
                message = 'Required parameters are missing';
                help = 'Check the tool schema for required parameters';
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    error: {
                        code: 'INVALID_INPUT',
                        message,
                        help
                    }
                }, null, 2)
            }]
        };
    }

    /**
     * Handles tool errors with improved messaging
     */
    private handleToolError(error: unknown, toolName: string) {
        let help: string;

        switch (toolName) {
            case 'create_task':
                help = 'Task creation requires at least a name. Example:\n{\n  "name": "My Task",\n  "description": "Optional description"\n}';
                break;
            case 'get_task_tree':
                help = 'No parameters required. Just call get_task_tree to retrieve the complete task hierarchy.';
                break;
            case 'get_tasks_by_status':
                help = 'Provide a valid status. Example:\n{\n  "status": "pending"\n}';
                break;
            default:
                help = 'Check the tool schema for required parameters and format';
        }

        const errorResponse = {
            error: {
                code: error instanceof McpError ? error.code : ErrorCode.InternalError,
                message: error instanceof Error ? error.message : 'An unexpected error occurred',
                help
            }
        };
        
        return {
            content: [{
                type: 'text',
                text: JSON.stringify(errorResponse, null, 2)
            }]
        };
    }

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

    private getCreateTaskDescription(): string {
        return `Creates a new task with rich content support and automatic status tracking. Supports nested subtask creation.

Task Types:
- task: Standard work item (default)
- milestone: Key achievement or deliverable
- group: Container for related tasks

Status Flow:
1. Initial Status:
   - Tasks start as 'pending'
   - Parent tasks inherit status from children
   - Group tasks aggregate child statuses

2. Valid Transitions:
   pending → in_progress: Start work
   in_progress → completed: Finish work
   in_progress → failed: Issues found
   in_progress → blocked: Dependencies not met
   blocked → in_progress: Dependencies resolved
   failed → in_progress: Retry attempt

Best Practices:
1. Task Structure:
   - Use clear, action-oriented names
   - Keep descriptions focused and specific
   - Break complex tasks into subtasks
   - Group related tasks under a parent
   - Limit hierarchy depth for clarity

2. Dependencies:
   - Create dependent tasks first
   - Use actual task IDs (not placeholders)
   - Document dependency rationale
   - Avoid circular dependencies
   - Consider task order carefully

3. Documentation:
   - Use markdown for detailed docs
   - Add code examples with language tags
   - Include JSON for structured data
   - Document assumptions clearly
   - Keep notes updated

4. Metadata:
   - Add clear task context
   - Use consistent tag naming
   - Tag for easy filtering
   - Include priority levels
   - Reference related resources

Error Prevention:
1. Dependencies:
   - Verify task IDs exist
   - Check for circular refs
   - Document relationships
   - Consider task order

2. Status Updates:
   - Follow valid transitions
   - Check dependencies first
   - Update parent status
   - Handle blocked states

3. Content Management:
   - Validate task names
   - Check description length
   - Verify note formats
   - Update metadata

Common Mistakes:
- Creating circular dependencies
- Missing dependency documentation
- Unclear task hierarchies
- Incomplete metadata
- Empty task names/description
- Do not include the task ID field in the first task
- Invalid status transitions
- Poor error handling`;
    }

    private getBulkCreateTasksDescription(): string {
        return `Creates multiple tasks at once with automatic relationship management and validation.

Operation Patterns:
1. Project Setup:
   - Create parent group task
   - Add milestone tasks
   - Create feature tasks
   - Set dependencies

2. Feature Planning:
   - Create feature group
   - Add component tasks
   - Set task relationships
   - Define milestones

3. Sprint Planning:
   - Create sprint group
   - Add user stories
   - Break down into tasks
   - Set priorities

Best Practices:
1. Task Organization:
   - Group related tasks
   - Maintain clear hierarchy
   - Use consistent naming
   - Set proper task types
   - Define clear boundaries

2. Dependency Management:
   - Create independent tasks first
   - Add dependencies later
   - Document relationships
   - Verify task order
   - Check for cycles

3. Status Handling:
   - Start tasks as pending
   - Update parent status
   - Track blocked tasks
   - Monitor progress
   - Handle failures

4. Error Prevention:
   - Validate task IDs
   - Check relationships
   - Verify status flow
   - Handle failures
   - Maintain consistency

Common Errors:
1. Dependency Issues:
   - Circular references
   - Missing tasks
   - Invalid order
   - Unclear rationale

2. Status Problems:
   - Invalid transitions
   - Blocked tasks
   - Parent updates
   - Progress tracking

3. Structure Issues:
   - Deep hierarchies
   - Unclear grouping
   - Poor organization
   - Missing context

Recovery Steps:
1. Dependency Errors:
   - Review task order
   - Fix circular refs
   - Update documentation
   - Verify relationships

2. Status Errors:
   - Check transitions
   - Update dependencies
   - Fix blocked tasks
   - Sync parent status

3. Structure Errors:
   - Simplify hierarchy
   - Improve organization
   - Add clear context
   - Update metadata`;
    }

    private getUpdateTaskDescription(): string {
        return `Updates an existing task with automatic status propagation and dependency validation.

Status Workflow:
1. New Task Flow:
   pending → in_progress → completed
   
2. Blocked Flow:
   pending → blocked (dependencies not met)
   blocked → in_progress (dependencies resolved)
   
3. Failed Flow:
   in_progress → failed (issues encountered)
   failed → in_progress (retry attempt)

Status Rules:
1. Parent Tasks:
   - Inherit status from children
   - Block on any blocked child
   - Fail on any failed child
   - Complete when all complete

2. Child Tasks:
   - Cannot complete before parent
   - Block when parent blocks
   - Independent progress
   - Sync with siblings

3. Dependencies:
   - Block on incomplete deps
   - Validate before completion
   - Check circular refs
   - Maintain consistency

Best Practices:
1. Status Updates:
   - Check current status
   - Verify dependencies
   - Update documentation
   - Handle failures
   - Monitor progress

2. Content Updates:
   - Keep context clear
   - Document changes
   - Update progress
   - Track blockers
   - Note time spent

3. Dependency Updates:
   - Verify task exists
   - Check for cycles
   - Document reasons
   - Update status
   - Handle blocking

4. Error Handling:
   - Validate changes
   - Handle conflicts
   - Retry operations
   - Log failures
   - Maintain state

Common Errors:
1. Status:
   - Invalid transitions
   - Dependency conflicts
   - Parent-child sync
   - Progress tracking

2. Content:
   - Missing context
   - Poor documentation
   - Unclear changes
   - Lost history

3. Dependencies:
   - Circular refs
   - Missing tasks
   - Unclear reasons
   - Status conflicts

Recovery Steps:
1. Status Issues:
   - Check transitions
   - Verify dependencies
   - Update parents
   - Fix conflicts

2. Content Problems:
   - Add context
   - Update docs
   - Track changes
   - Maintain history

3. Dependency Errors:
   - Fix cycles
   - Verify tasks
   - Document reasons
   - Update status`;
    }

    private getBulkUpdateTasksDescription(): string {
        return `Updates multiple tasks at once with automatic status propagation and validation.

Update Patterns:
1. Sprint Updates:
   - Mark completed tasks
   - Update blocked tasks
   - Progress task groups
   - Update estimates

2. Status Changes:
   - Update task flow
   - Handle blockers
   - Track progress
   - Manage failures

3. Content Updates:
   - Add sprint notes
   - Update progress
   - Modify plans
   - Track changes

Best Practices:
1. Planning:
   - Group updates
   - Check dependencies
   - Verify states
   - Document changes
   - Handle errors

2. Execution:
   - Update in order
   - Check impacts
   - Maintain consistency
   - Track progress
   - Handle failures

3. Documentation:
   - Note changes
   - Update times
   - Track decisions
   - Monitor impact
   - Keep history

Error Prevention:
1. Status:
   - Check transitions
   - Verify dependencies
   - Update parents
   - Handle conflicts
   - Track progress

2. Content:
   - Validate changes
   - Update context
   - Track history
   - Maintain docs
   - Check formats

3. Dependencies:
   - Verify tasks
   - Check cycles
   - Update status
   - Document reasons
   - Handle blocking

Recovery Steps:
1. Status Issues:
   - Review transitions
   - Fix dependencies
   - Update hierarchy
   - Handle blocks

2. Content Problems:
   - Add context
   - Fix formats
   - Update docs
   - Track changes

3. Dependency Errors:
   - Fix cycles
   - Verify tasks
   - Update status
   - Document fixes`;
    }

    private getDeleteTaskDescription(): string {
        return `Safely deletes a task and its subtasks with dependency validation and cleanup.

Deletion Rules:
1. Task State:
   - Cannot delete in_progress
   - Verify no dependents
   - Clean up references
   - Update parent status

2. Subtasks:
   - Delete recursively
   - Update references
   - Clean dependencies
   - Maintain history

3. Dependencies:
   - Update dependent tasks
   - Remove references
   - Handle blocking
   - Clean up links

Best Practices:
1. Pre-Delete:
   - Check status
   - Verify deps
   - Document reason
   - Update refs
   - Plan cleanup

2. Execution:
   - Handle subtasks
   - Update parents
   - Clean refs
   - Track changes
   - Maintain logs

3. Post-Delete:
   - Verify cleanup
   - Update docs
   - Check impacts
   - Monitor state
   - Handle errors

Common Errors:
1. Status:
   - Active tasks
   - Blocked tasks
   - Parent updates
   - Progress tracking

2. Dependencies:
   - Missing cleanup
   - Broken refs
   - Status conflicts
   - Update failures

3. Structure:
   - Incomplete cleanup
   - Lost history
   - Missing docs
   - Ref problems

Recovery Steps:
1. Status Issues:
   - Check states
   - Update deps
   - Fix parents
   - Handle blocks

2. Dependency Problems:
   - Clean refs
   - Update tasks
   - Fix status
   - Document changes

3. Structure Errors:
   - Complete cleanup
   - Update docs
   - Fix refs
   - Verify state`;
    }

    private getSubtasksDescription(): string {
        return `Retrieves all subtasks of a task with hierarchy information and status.

Usage Patterns:
1. Progress Check:
   - Monitor status
   - Track blockers
   - Check progress
   - Verify deps

2. Planning:
   - Review work
   - Check capacity
   - Plan sprints
   - Set priorities

3. Updates:
   - Track changes
   - Monitor progress
   - Handle blocks
   - Update status

Best Practices:
1. Monitoring:
   - Check daily
   - Track changes
   - Update status
   - Handle blocks
   - Note progress

2. Organization:
   - Group tasks
   - Track deps
   - Monitor progress
   - Update hierarchy
   - Maintain order

3. Documentation:
   - Note changes
   - Track decisions
   - Update status
   - Monitor impact
   - Keep history`;
    }

    private getTaskTreeDescription(): string {
        return `Retrieves the complete task hierarchy with status and relationship information.

Analysis Patterns:
1. Project Review:
   - Check structure
   - Monitor progress
   - Track blockers
   - Verify deps

2. Status Check:
   - Track completion
   - Find blocks
   - Monitor progress
   - Update status

3. Planning:
   - Review work
   - Check deps
   - Plan resources
   - Set priorities

Best Practices:
1. Regular Review:
   - Check daily
   - Track changes
   - Update status
   - Handle blocks
   - Note progress

2. Organization:
   - Group tasks
   - Track deps
   - Monitor progress
   - Update hierarchy
   - Maintain order

3. Documentation:
   - Note changes
   - Track decisions
   - Update status
   - Monitor impact
   - Keep history`;
    }

    private getTasksByStatusDescription(): string {
        return `Retrieves tasks filtered by status with full context and relationships.

Status Types:
1. pending: Not started
   - Initial state
   - Ready for work
   - No blockers
   - Dependencies met

2. in_progress: Active work
   - Being worked on
   - No blockers
   - Dependencies met
   - Progress tracked

3. completed: Done & verified
   - Work finished
   - Tests passed
   - Docs updated
   - Verified working

4. failed: Issues found
   - Problems found
   - Tests failed
   - Needs fixes
   - Blocked progress

5. blocked: Dependencies pending
   - Deps not met
   - External blocks
   - Resource issues
   - Needs unblocking

Best Practices:
1. Status Review:
   - Check daily
   - Track changes
   - Update blocked
   - Monitor progress
   - Handle failures

2. Progress Tracking:
   - Monitor completion
   - Check blockers
   - Update status
   - Track changes
   - Note issues

3. Documentation:
   - Note changes
   - Track reasons
   - Update status
   - Monitor impact
   - Keep history`;
    }
}
