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
            // Storage is handled by config manager, no need to check here

            // Check for empty input
            if (this.TOOLS_REQUIRING_INPUT.has(request.params.name) && 
                (!request.params.arguments || Object.keys(request.params.arguments).length === 0)) {
                return this.handleEmptyInputError(request.params.name);
            }

            // Validate tool exists
            if (!request.params.name) {
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    'Tool name is required',
                    'Specify a valid tool name from the available tools list.'
                );
            }

            // Execute request with validation
            const response = await this.executeToolRequest(request);
            const formattedResponse = formatResponse(response);
            return {
                success: true,
                content: [{
                    type: 'text',
                    text: formattedResponse
                }]
            };
        } catch (error) {
            // Enhanced error handling
            if (error instanceof McpError) {
                return {
                    success: false,
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            error: {
                                code: error.code,
                                message: error.message,
                                help: error.stack || 'Check configuration and try again.'
                            }
                        }, null, 2)
                    }]
                };
            }

            // Convert other errors to MCP errors
            const mcpError = new McpError(
                ErrorCode.InternalError,
                error instanceof Error ? error.message : 'An unexpected error occurred',
                this.getErrorHelp(error, request.params.name)
            );

            return {
                success: false,
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        error: {
                            code: mcpError.code,
                            message: mcpError.message,
                            help: mcpError.stack
                        }
                    }, null, 2)
                }]
            };
        }
    }

    /**
     * Get helpful error message based on error type
     */
    private getErrorHelp(error: unknown, toolName: string): string {
        if (error instanceof Error) {
            if (error.message.includes('TASK_STORAGE_DIR')) {
                return 'Environment Setup Required:\n1. Set TASK_STORAGE_DIR environment variable\n2. Ensure directory exists and is writable\n3. Restart the server';
            }
            if (error.message.includes('validation')) {
                return 'Validation Error:\n1. Check required fields\n2. Verify data types\n3. Ensure values are within limits\n4. Review schema documentation';
            }
            if (error.message.includes('UUID')) {
                return 'Invalid UUID:\n1. Ensure all IDs are valid UUIDs\n2. Check parent and dependency IDs\n3. Verify task references';
            }
        }

        // Default tool-specific help
        switch (toolName) {
            case 'create_task':
                return 'Task Creation Help:\n1. Provide required name field\n2. Check field types and limits\n3. Verify parent task exists if specified\n4. Ensure valid note formats';
            case 'update_task':
                return 'Task Update Help:\n1. Verify task exists\n2. Check status transitions\n3. Validate field updates\n4. Ensure dependency consistency';
            default:
                return 'General Help:\n1. Check input format\n2. Verify required fields\n3. Review documentation\n4. Ensure proper configuration';
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
        if (error instanceof McpError) {
            return {
                success: false,
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        error: {
                            code: error.code,
                            message: error.message,
                            help: error.message.includes('Task hierarchy') ?
                                'Task hierarchies are limited to 5 levels deep to maintain manageable complexity. Consider restructuring your tasks into smaller, more focused groups.' :
                                'Check the tool schema for required parameters and format'
                        }
                    }, null, 2)
                }]
            };
        }

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

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    error: {
                        code: ErrorCode.InternalError,
                        message: error instanceof Error ? error.message : 'An unexpected error occurred',
                        help
                    }
                }, null, 2)
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

Technical Constraints:
1. Task Structure:
   - Name: 1-200 characters (required)
   - Description: Max 2000 characters (optional)
   - Hierarchy: Maximum 5 levels deep
   - IDs: Valid UUIDs required for task/parent IDs

2. Note Types and Requirements:
   text:
   - content: Required, non-empty string
   - metadata: Optional key-value pairs
   
   code:
   - content: Required, non-empty string
   - language: Required, programming language
   - metadata: Optional key-value pairs
   
   json:
   - content: Required, valid JSON string
   - metadata: Optional key-value pairs
   
   markdown:
   - content: Required, non-empty string
   - metadata: Optional key-value pairs

3. Schema Validation:
   - Strict validation enforced
   - No additional properties allowed
   - Required fields must be present
   - All UUIDs must be valid

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

Example Task Creation:
{
  "name": "Task Name",  // Required
  "description": "Details",  // Optional, max 2000 chars
  "type": "task",  // Optional: task|milestone|group
  "notes": [{
    "type": "code",
    "content": "function example() {}",
    "language": "typescript"  // Required for code notes
  }],
  "metadata": {
    "context": "Feature implementation",
    "tags": ["api", "auth"]
  }
}

Best Practices:
1. Task Structure:
   - Use clear, action-oriented names
   - Keep descriptions focused and specific
   - Break complex tasks into subtasks
   - Group related tasks under a parent
   - Monitor hierarchy depth (max 5 levels)

2. Dependencies:
   - Create dependent tasks first
   - Use valid UUIDs for task IDs
   - Document dependency rationale
   - Avoid circular dependencies
   - Consider task order carefully

3. Content Validation:
   - Verify JSON content is valid
   - Include language for code notes
   - Keep content within length limits
   - Use appropriate note types
   - Structure markdown properly

4. Error Handling:
   - Validate all UUIDs
   - Check hierarchy depth
   - Verify note format
   - Handle status transitions
   - Monitor dependency cycles

Common Mistakes:
- Exceeding hierarchy depth limit
- Missing required fields
- Invalid JSON in notes
- Missing code languages
- Invalid UUID formats
- Circular dependencies
- Invalid status transitions
- Schema validation errors`;
    }

    private getBulkCreateTasksDescription(): string {
        return `Creates multiple tasks at once with automatic relationship management and validation.

Technical Constraints:
1. Task Structure:
   - Name: 1-200 characters (required for each task)
   - Description: Max 2000 characters (optional)
   - Hierarchy: Maximum 5 levels deep total
   - IDs: Valid UUIDs required for task/parent IDs
   - Parent ID: Must be valid UUID or null

2. Batch Validation:
   - All tasks must pass individual validation
   - Consistent note types across tasks
   - Valid parent-child relationships
   - No circular dependencies
   - Proper UUID formats

3. Schema Requirements:
   - parentId: UUID or null (optional)
   - tasks: Array of task objects (required)
   - Each task follows create_task schema

Example Batch Creation:
{
  "parentId": "parent-uuid",  // Optional
  "tasks": [
    {
      "name": "Task 1",
      "type": "milestone",
      "notes": [{
        "type": "markdown",
        "content": "# Milestone 1"
      }]
    },
    {
      "name": "Task 2",
      "type": "task",
      "dependencies": ["task-1-uuid"]
    }
  ]
}

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
   - Maintain hierarchy (max 5 levels)
   - Use consistent naming
   - Set proper task types
   - Define clear boundaries

2. Dependency Management:
   - Create independent tasks first
   - Use valid UUIDs for dependencies
   - Document relationships
   - Verify task order
   - Check for cycles

3. Validation:
   - Verify all UUIDs
   - Check note formats
   - Validate JSON content
   - Ensure required fields
   - Monitor hierarchy depth

4. Error Prevention:
   - Pre-validate task data
   - Check relationships
   - Verify status flow
   - Handle failures
   - Maintain consistency

Common Errors:
1. Schema Validation:
   - Invalid UUID formats
   - Missing required fields
   - Malformed note content
   - Invalid JSON data
   - Wrong note types

2. Hierarchy Issues:
   - Exceeding depth limit
   - Invalid parent IDs
   - Circular references
   - Broken relationships
   - Missing dependencies

3. Content Problems:
   - Invalid task names
   - Description too long
   - Wrong note formats
   - Missing languages
   - Invalid metadata

Recovery Steps:
1. Validation Errors:
   - Check UUID formats
   - Verify required fields
   - Fix note content
   - Update relationships
   - Correct metadata

2. Structure Issues:
   - Reduce hierarchy depth
   - Fix parent references
   - Update dependencies
   - Correct relationships
   - Validate task order

3. Content Fixes:
   - Trim long content
   - Fix note formats
   - Add missing fields
   - Update metadata
   - Correct JSON data`;
    }

    private getUpdateTaskDescription(): string {
        return `Updates an existing task with automatic status propagation and dependency validation.

Technical Constraints:
1. Update Structure:
   - taskId: Valid UUID (required)
   - Name: 1-200 characters if updating
   - Description: Max 2000 characters if updating
   - All UUIDs must be valid
   - Status transitions must be valid

2. Schema Requirements:
   - taskId: UUID (required)
   - updates: {
       name?: string
       description?: string
       notes?: TaskNote[]
       reasoning?: TaskReasoning
       type?: 'task' | 'milestone' | 'group'
       status?: TaskStatus
       dependencies?: UUID[]
       metadata?: {
         context?: string
         tags?: string[]
         [key: string]: unknown
       }
   }

3. Note Validation:
   text:
   - content: Required, non-empty string
   - metadata: Optional key-value pairs
   
   code:
   - content: Required, non-empty string
   - language: Required, programming language
   - metadata: Optional key-value pairs
   
   json:
   - content: Required, valid JSON string
   - metadata: Optional key-value pairs
   
   markdown:
   - content: Required, non-empty string
   - metadata: Optional key-value pairs

Example Update:
{
  "taskId": "task-uuid",
  "updates": {
    "status": "in_progress",
    "notes": [{
      "type": "text",
      "content": "Implementation started"
    }],
    "metadata": {
      "startedAt": "2024-01-20",
      "priority": "high"
    }
  }
}

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
1. Validation:
   - Verify UUID format
   - Check status transitions
   - Validate note content
   - Ensure dependencies exist
   - Monitor relationships

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
1. Schema Validation:
   - Invalid UUID format
   - Invalid status transition
   - Malformed note content
   - Invalid JSON data
   - Wrong note types

2. Status Issues:
   - Invalid transitions
   - Dependency conflicts
   - Parent-child sync
   - Progress tracking

3. Content Problems:
   - Missing context
   - Poor documentation
   - Unclear changes
   - Lost history

4. Dependencies:
   - Circular refs
   - Missing tasks
   - Unclear reasons
   - Status conflicts

Recovery Steps:
1. Validation Errors:
   - Check UUID format
   - Verify status flow
   - Fix note content
   - Update relationships
   - Correct metadata

2. Status Issues:
   - Check transitions
   - Verify dependencies
   - Update parents
   - Fix conflicts

3. Content Problems:
   - Add context
   - Update docs
   - Track changes
   - Maintain history

4. Dependency Errors:
   - Fix cycles
   - Verify tasks
   - Document reasons
   - Update status`;
    }

    private getBulkUpdateTasksDescription(): string {
        return `Updates multiple tasks at once with automatic status propagation and validation.

Technical Constraints:
1. Update Structure:
   - taskId: Valid UUID (required for each update)
   - updates: Object containing fields to update
   - Name: 1-200 characters if updating
   - Description: Max 2000 characters if updating
   - All UUIDs must be valid

2. Batch Validation:
   - All updates must pass validation
   - Status transitions must be valid
   - Dependencies must exist
   - No circular references
   - Parent-child consistency

3. Schema Requirements:
   - updates: Array of update objects (required)
   - Each update follows schema:
     {
       taskId: UUID (required)
       updates: {
         name?: string
         description?: string
         notes?: TaskNote[]
         status?: TaskStatus
         dependencies?: UUID[]
         metadata?: object
       }
     }

Example Batch Update:
{
  "updates": [
    {
      "taskId": "task-1-uuid",
      "updates": {
        "status": "in_progress",
        "notes": [{
          "type": "text",
          "content": "Started implementation"
        }]
      }
    },
    {
      "taskId": "task-2-uuid",
      "updates": {
        "status": "completed",
        "metadata": {
          "completedAt": "2024-01-20"
        }
      }
    }
  ]
}

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
1. Validation:
   - Verify all UUIDs
   - Check status transitions
   - Validate note content
   - Ensure dependencies exist
   - Monitor relationships

2. Execution:
   - Group related updates
   - Update in dependency order
   - Maintain consistency
   - Track progress
   - Handle failures

3. Documentation:
   - Note changes clearly
   - Track decisions
   - Update timestamps
   - Monitor impacts
   - Keep history

Error Prevention:
1. Status Validation:
   - Check valid transitions
   - Verify dependencies
   - Update parent status
   - Handle conflicts
   - Track progress

2. Content Validation:
   - Check note formats
   - Validate JSON content
   - Verify field lengths
   - Update metadata
   - Maintain history

3. Dependency Management:
   - Verify task existence
   - Check for cycles
   - Update status properly
   - Document changes
   - Handle blocking

Recovery Steps:
1. Validation Errors:
   - Check UUID formats
   - Verify status flows
   - Fix note content
   - Update relationships
   - Correct metadata

2. Structure Issues:
   - Fix dependencies
   - Update hierarchies
   - Correct relationships
   - Validate task order
   - Handle conflicts

3. Content Problems:
   - Fix note formats
   - Update invalid content
   - Correct metadata
   - Add missing fields
   - Document changes`;
    }

    private getDeleteTaskDescription(): string {
        return `Safely deletes a task and its subtasks with dependency validation and cleanup.

Technical Constraints:
1. Delete Requirements:
   - taskId: Valid UUID (required)
   - Task must not be in_progress
   - Task must not have dependent tasks
   - Parent task must exist if specified

2. Schema Requirements:
   - taskId: UUID (required)
   - No additional parameters allowed
   - Strict schema validation enforced

Example Delete:
{
  "taskId": "task-uuid"
}

Deletion Rules:
1. Task State Validation:
   - Cannot delete in_progress tasks
   - Cannot delete tasks with active dependents
   - Must clean up all references
   - Must update parent task status

2. Subtask Handling:
   - Recursive deletion of all subtasks
   - Update all task references
   - Clean up dependency links
   - Maintain audit history
   - Update parent aggregates

3. Dependency Management:
   - Remove from dependent tasks
   - Update blocking status
   - Clean up reference links
   - Maintain consistency
   - Handle orphaned tasks

Best Practices:
1. Pre-Delete Validation:
   - Verify UUID format
   - Check task status
   - Validate dependencies
   - Document reason
   - Plan cleanup steps

2. Execution Strategy:
   - Handle subtasks first
   - Update parent tasks
   - Clean references
   - Track changes
   - Maintain audit logs

3. Post-Delete Verification:
   - Confirm cleanup
   - Verify references
   - Check impacts
   - Monitor state
   - Handle errors

Common Errors:
1. Validation Issues:
   - Invalid UUID format
   - Task in wrong status
   - Active dependencies
   - Missing parent
   - Schema violations

2. Dependency Problems:
   - Unhandled references
   - Broken dependencies
   - Status conflicts
   - Update failures
   - Orphaned tasks

3. Structure Issues:
   - Incomplete cleanup
   - Lost references
   - Missing history
   - Parent conflicts
   - Data inconsistency

Recovery Steps:
1. Validation Errors:
   - Check UUID format
   - Verify task status
   - Clear dependencies
   - Update references
   - Fix schema issues

2. Dependency Cleanup:
   - Remove references
   - Update dependent tasks
   - Fix status issues
   - Document changes
   - Verify consistency

3. Structure Recovery:
   - Complete cleanup
   - Restore references
   - Update hierarchy
   - Fix parent links
   - Verify integrity

Error Prevention:
1. Pre-Delete Checks:
   - Validate task exists
   - Check status rules
   - Verify dependencies
   - Document changes
   - Plan rollback

2. Execution Safety:
   - Handle errors
   - Track progress
   - Maintain logs
   - Enable rollback
   - Verify results

3. Post-Delete Validation:
   - Check consistency
   - Verify cleanup
   - Update related tasks
   - Document results
   - Monitor impacts`;
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
