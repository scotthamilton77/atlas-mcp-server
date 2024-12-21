/**
 * Tool Handler
 * Manages MCP tool registration and execution
 */

import { TaskManager } from '../task-manager.js';
import {
    TaskStatus,
    TaskType,
    CreateTaskInput,
    BulkCreateTaskInput,
    BulkUpdateTasksInput,
    UpdateTaskInput,
    Task,
    TaskNote,
    TaskReasoning
} from '../types/task.js';
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';
import {
    createTaskSchema,
    bulkCreateTasksSchema,
    updateTaskSchema,
    bulkUpdateTasksSchema,
    getTasksByStatusSchema,
    deleteTaskSchema,
    getSubtasksSchema,
    getTaskTreeSchema
} from './schemas.js';

import {
    createSessionSchema,
    createTaskListSchema,
    switchSessionSchema,
    switchTaskListSchema,
    listSessionsSchema,
    listTaskListsSchema,
    archiveSessionSchema,
    archiveTaskListSchema
} from './session-schemas.js';

export interface Tool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface ToolResponse {
    content: Array<{
        type: string;
        text: string;
    }>;
}

export class ToolHandler {
    private logger: Logger;
    private tools: Map<string, Tool> = new Map();
    private toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<ToolResponse>> = new Map();

    constructor(private taskManager: TaskManager) {
        this.logger = Logger.getInstance().child({ component: 'ToolHandler' });
        this.registerDefaultTools();
    }

    /**
     * Registers default task management tools
     */
    private registerDefaultTools(): void {
        const defaultTools = [
            {
                name: 'create_session',
                description: 'Creates a new session for task management. Features:\n' +
                           '- Isolated task context\n' +
                           '- Multi-list support\n' +
                           '- Session-level metadata\n\n' +
                           'IMPORTANT: Must be called first before any task operations.\n\n' +
                           'Parameters:\n' +
                           '- name (required): Name of the session. Best practice: Use descriptive names that include purpose and date (e.g., "Feature Development - March 2024").\n' +
                           '- metadata (optional): Additional session metadata. Fields:\n' +
                           '  - tags: Array of strings for categorizing the session. Best practice: Include project phase, team, and priority indicators.\n' +
                           '  - context: Additional context about the session. Best practice: Document goals, participants, and key decisions made during the session.',
                inputSchema: createSessionSchema,
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.createSession(args as any);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'create_task_list',
                description: 'Creates a new task list in the current session. Features:\n' +
                           '- Supports milestone and group hierarchies\n' +
                           '- Optional persistence across sessions\n' +
                           '- List-level metadata and organization\n\n' +
                           'IMPORTANT: Requires active session.\n\n' +
                           'Parameters:\n' +
                           '- name (required): Name of the task list. Best practice: Use descriptive names that reflect the purpose or theme (e.g., "Q1 Feature Development", "Security Improvements").\n' +
                           '- description (optional): Description of the task list. Best practice: Include goals, success criteria, and any relevant timelines or constraints.\n' +
                           '- metadata (optional): Additional task list metadata. Fields:\n' +
                           '  - tags: Array of strings for categorizing the task list. Best practice: Use consistent prefixes (e.g., "project:", "team:", "quarter:") for better organization.\n' +
                           '  - context: Additional context about the task list. Best practice: Include links to project documentation, milestones, or related resources.\n' +
                           '- persistent (optional): Whether the task list should persist across sessions. Best practice: Use true for long-term projects, false for temporary task groupings.',
                inputSchema: createTaskListSchema,
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.createTaskList(args as any);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'switch_session',
                description: 'Switches to a different session. Features:\n' +
                           '- Preserves task list context\n' +
                           '- Validates session existence\n' +
                           '- Updates active state\n\n' +
                           'IMPORTANT: Save any pending changes before switching.\n\n' +
                           'Parameters:\n' +
                           '- sessionId (required): ID of the session to switch to. Best practice: Save any pending changes in current session before switching.',
                inputSchema: switchSessionSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.sessionId || typeof args.sessionId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid sessionId'
                        );
                    }
                    await this.taskManager.switchSession(args.sessionId);
                    return this.formatResponse({ success: true });
                }
            },
            {
                name: 'switch_task_list',
                description: 'Switches to a different task list. Features:\n' +
                           '- Preserves session context\n' +
                           '- Validates task list existence\n' +
                           '- Updates active state\n\n' +
                           'IMPORTANT: Requires active session.\n\n' +
                           'Parameters:\n' +
                           '- taskListId (required): ID of the task list to switch to. Best practice: Verify task list exists and contains active tasks before switching.',
                inputSchema: switchTaskListSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.taskListId || typeof args.taskListId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid taskListId'
                        );
                    }
                    await this.taskManager.switchTaskList(args.taskListId);
                    return this.formatResponse({ success: true });
                }
            },
            {
                name: 'list_sessions',
                description: 'Lists all available sessions. Features:\n' +
                           '- Optional archived session inclusion\n' +
                           '- Session metadata and status\n' +
                           '- Active session indication\n\n' +
                           'Use for session management and auditing.\n\n' +
                           'Parameters:\n' +
                           '- includeArchived (optional): Whether to include archived sessions. Best practice: Use for auditing or reviewing historical work patterns.',
                inputSchema: listSessionsSchema,
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.listSessions(args.includeArchived as boolean);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'list_task_lists',
                description: 'Lists all task lists in current session. Features:\n' +
                           '- Optional archived list inclusion\n' +
                           '- Task list metadata and status\n' +
                           '- Active list indication\n\n' +
                           'IMPORTANT: Requires active session.\n\n' +
                           'Parameters:\n' +
                           '- includeArchived (optional): Whether to include archived task lists. Best practice: Use true when reviewing historical data or reactivating old projects.',
                inputSchema: listTaskListsSchema,
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.listTaskLists(args.includeArchived as boolean);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'archive_session',
                description: 'Archives a session. Features:\n' +
                           '- Preserves all task data\n' +
                           '- Updates session metadata\n' +
                           '- Clears active session if archived\n\n' +
                           'Best practice: Create or switch to a new session first.\n\n' +
                           'Parameters:\n' +
                           '- sessionId (required): ID of the session to archive. Best practice: Document session outcomes and ensure all task lists are properly resolved before archiving.',
                inputSchema: archiveSessionSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.sessionId || typeof args.sessionId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid sessionId'
                        );
                    }
                    await this.taskManager.archiveSession(args.sessionId);
                    return this.formatResponse({ success: true });
                }
            },
            {
                name: 'archive_task_list',
                description: 'Archives a task list. Features:\n' +
                           '- Preserves all task data\n' +
                           '- Updates task list metadata\n' +
                           '- Clears active task list if archived\n\n' +
                           'IMPORTANT: Requires active session.\n\n' +
                           'Parameters:\n' +
                           '- taskListId (required): ID of the task list to archive. Best practice: Ensure all tasks are completed or properly transferred before archiving.',
                inputSchema: archiveTaskListSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.taskListId || typeof args.taskListId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid taskListId'
                        );
                    }
                    await this.taskManager.archiveTaskList(args.taskListId);
                    return this.formatResponse({ success: true });
                }
            },
            {
                name: 'create_task',
                description: 'Creates a new task with support for hierarchical organization. Key Features:\n' +
                           '- Milestone tasks: Project phases with strict completion rules\n' +
                           '- Group tasks: Feature sets with flexible completion\n' +
                           '- Regular tasks: Individual work items\n\n' +
                           'IMPORTANT: Requires active session and task list.\n\n' +
                           'Parameters:\n' +
                           '- parentId (optional): ID of the parent task, or null for root tasks. Use this for creating hierarchical task structures. Best practice: Keep hierarchies shallow (max 3-4 levels) for better maintainability.\n' +
                           '- name (required): Name of the task (max 200 characters). Best practice: Use clear, action-oriented names that describe the outcome (e.g., "Implement user authentication" rather than "Auth work").\n' +
                           '- description (optional): Description of the task (max 2000 characters). Best practice: Include context, acceptance criteria, and any technical considerations. Use markdown for better formatting.\n' +
                           '- notes (optional): Rich notes associated with the task. Best practice: Use a combination of note types - markdown for documentation, code for examples, and JSON for structured data.\n' +
                           '- reasoning (optional): Reasoning and decision-making documentation. Best practice: Keep this documentation up-to-date as decisions evolve.\n' +
                           '- type (optional): Type of task. Options:\n' +
                           '  - milestone: Major project phases or deliverables (can contain subtasks, requires all subtasks completed for completion)\n' +
                           '  - group: Organizational containers for related tasks (can contain subtasks, allows partial completion)\n' +
                           '  - task: Individual work items (cannot contain subtasks)\n' +
                           '  Best Practices:\n' +
                           '  1. Use milestones for project phases that need strict completion requirements\n' +
                           '  2. Use groups for feature sets that can be partially completed\n' +
                           '  3. Use tasks for concrete, actionable work items\n' +
                           '- dependencies (optional): List of task IDs this task depends on. IMPORTANT: Must use actual task IDs (e.g., "xK7cPq2Z"), not task names.\n' +
                           '  Best practices:\n' +
                           '  1. Keep dependencies minimal and explicit\n' +
                           '  2. Store task IDs when creating tasks for later reference\n' +
                           '  3. Use get_task_tree to view all task IDs and relationships\n' +
                           '  4. Consider using task groups for better organization\n' +
                           '- metadata (optional): Additional task metadata. Fields:\n' +
                           '  - context: Additional context about task purpose. Best practice: Include links to relevant documentation, discussions, or requirements.\n' +
                           '  - tags: Array of strings for categorization. Best practice: Use consistent naming conventions for tags (e.g., "feature:", "tech:", "priority:").\n' +
                           '- subtasks (optional): Nested subtasks for hierarchical task organization. Options:\n' +
                           '  - Under milestones: Represent phase deliverables that must all be completed\n' +
                           '  - Under groups: Represent feature components that can be partially completed\n' +
                           '  Best Practices:\n' +
                           '  1. Break down complex tasks into manageable pieces\n' +
                           '  2. Use consistent granularity within each level\n' +
                           '  3. Keep hierarchy depth under 5 levels\n' +
                           '  4. Consider dependencies between subtasks\n' +
                           '  5. Use milestones for strict phase completion\n' +
                           '  6. Use groups for flexible feature organization',
                inputSchema: createTaskSchema,
                handler: async (args: Record<string, unknown>) => {
                    const input = this.validateCreateTaskInput(args);
                    const parentId = input.parentId || null;
                    delete input.parentId; // Remove from input since it's passed separately
                    const result = await this.taskManager.createTask(parentId, input, false);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'bulk_create_tasks',
                description: 'Creates multiple tasks at once with support for complex hierarchies. Features:\n' +
                           '- Bulk creation of related tasks\n' +
                           '- Automatic parent-child relationships\n' +
                           '- Efficient transaction handling\n\n' +
                           'IMPORTANT: Maximum 50 tasks per operation.\n\n' +
                           'Parameters:\n' +
                           '- parentId (optional): ID of the parent task. Best practice: Use for creating related tasks under a common parent.\n' +
                           '- tasks (required): Array of tasks to create. Best practice: Group related tasks together and maintain consistent structure.',
                inputSchema: bulkCreateTasksSchema,
                handler: async (args: Record<string, unknown>) => {
                    const input = this.validateBulkCreateTaskInput(args);
                    const result = await this.taskManager.bulkCreateTasks(input);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'update_task',
                description: 'Updates an existing task with smart status propagation. Features:\n' +
                           '- Different status rules for milestones vs groups\n' +
                           '- Automatic dependency validation\n' +
                           '- Parent status updates\n\n' +
                           'IMPORTANT: Requires active session.\n\n' +
                           'Parameters:\n' +
                           '- taskId (required): ID of the task to update. Best practice: Verify task exists before updating.\n' +
                           '- updates (required): Updates to apply to the task. Available fields:\n' +
                           '  - name: New task name (max 200 characters)\n' +
                           '  - description: New task description\n' +
                           '  - type: New task type (task, milestone, group)\n' +
                           '  - status: New status (pending, in_progress, completed, failed, blocked)\n' +
                           '  - dependencies: Updated task dependencies\n' +
                           '  - notes: Updated task notes\n' +
                           '  - reasoning: Updated task reasoning\n' +
                           '  - metadata: Updated task metadata. Fields:\n' +
                           '    - context: Additional context about task purpose. Best practice: Include links to relevant documentation, discussions, or requirements.\n' +
                           '    - tags: Array of strings for categorization. Best practice: Use consistent naming conventions for tags (e.g., "feature:", "tech:", "priority:").\n\n' +
                           '  Features:\n' +
                           '  - Smart status propagation based on task type\n' +
                           '  - Automatic dependency validation\n' +
                           '  - Parent task status updates\n' +
                           '  - Rich metadata management\n\n' +
                           '  Best Practices:\n' +
                           '  1. Update dependencies when marking tasks as blocked\n' +
                           '  2. Document reasons for status changes\n' +
                           '  3. Consider impact on dependent tasks\n' +
                           '  4. Follow status progression logically',
                inputSchema: updateTaskSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.taskId || typeof args.taskId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid taskId'
                        );
                    }
                    const updates = this.validateUpdateTaskInput(args.updates as Record<string, unknown>);
                    const result = await this.taskManager.updateTask(args.taskId, updates);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'bulk_update_tasks',
                description: 'Updates multiple tasks at once with transaction safety. Features:\n' +
                           '- Atomic updates across tasks\n' +
                           '- Dependency preservation\n' +
                           '- Status propagation handling\n\n' +
                           'IMPORTANT: Maximum 50 updates per operation.\n\n' +
                           'Parameters:\n' +
                           '- updates (required): Array of task updates. Each update can include:\n' +
                           '  - taskId (required): ID of the task to update\n' +
                           '  - updates (required): Updates to apply, which can include:\n' +
                           '    - name: New task name\n' +
                           '    - description: New description\n' +
                           '    - type: New task type (task, milestone, group)\n' +
                           '    - status: New status (pending, in_progress, completed, failed, blocked)\n' +
                           '    - dependencies: Updated task dependencies\n' +
                           '    - notes: Updated task notes\n' +
                           '    - reasoning: Updated task reasoning\n' +
                           '    - metadata: Updated task metadata. Fields:\n' +
                           '      - context: Additional context about task purpose. Best practice: Include links to relevant documentation, discussions, or requirements.\n' +
                           '      - tags: Array of strings for categorization. Best practice: Use consistent naming conventions for tags (e.g., "feature:", "tech:", "priority:").\n\n' +
                           '  Best practice: Group related updates together and consider dependency order.',
                inputSchema: bulkUpdateTasksSchema,
                handler: async (args: Record<string, unknown>) => {
                    const input = this.validateBulkUpdateTaskInput(args);
                    const result = await this.taskManager.bulkUpdateTasks(input);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'get_tasks_by_status',
                description: 'Retrieves tasks filtered by status with context awareness. Features:\n' +
                           '- Status-based filtering\n' +
                           '- Session and task list scoping\n' +
                           '- Progress tracking support\n\n' +
                           'Use for monitoring task progress and identifying bottlenecks.\n\n' +
                           'Parameters:\n' +
                           '- status (required): Status filter. Best practice: Use for progress tracking and identifying bottlenecks.\n' +
                           '- sessionId (optional): Optional session ID to filter by. If not provided, uses active session.\n' +
                           '- taskListId (optional): Optional task list ID to filter by. If not provided, uses active task list.',
                inputSchema: getTasksByStatusSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.status || !Object.values(TaskStatus).includes(args.status as TaskStatus)) {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Invalid task status'
                        );
                    }
                    const result = await this.taskManager.getTasksByStatus(
                        args.status as TaskStatus,
                        args.sessionId as string | undefined,
                        args.taskListId as string | undefined
                    );
                    return this.formatResponse(result);
                }
            },
            {
                name: 'delete_task',
                description: 'Deletes a task with dependency cleanup. Features:\n' +
                           '- Automatic subtask cleanup\n' +
                           '- Dependency validation\n' +
                           '- Parent task updates\n\n' +
                           'IMPORTANT: Requires active session. Check for dependent tasks first.\n\n' +
                           'Parameters:\n' +
                           '- taskId (required): Task ID to delete. Best practice: Check for dependent tasks before deletion.',
                inputSchema: deleteTaskSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.taskId || typeof args.taskId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid taskId'
                        );
                    }
                    const result = await this.taskManager.deleteTask(args.taskId);
                    return this.formatResponse(result);
                }
            },
            {
                name: 'get_subtasks',
                description: 'Retrieves subtasks of a task with hierarchy awareness. Features:\n' +
                           '- Support for milestone and group subtasks\n' +
                           '- Status inheritance information\n' +
                           '- Dependency tracking\n\n' +
                           'Use for understanding task relationships and progress.\n\n' +
                           'Parameters:\n' +
                           '- taskId (required): Parent task ID. Best practice: Use for progress tracking and dependency management.\n' +
                           '- sessionId (optional): Optional session ID to filter by. If not provided, uses parent task\'s session.\n' +
                           '- taskListId (optional): Optional task list ID to filter by. If not provided, uses parent task\'s task list.',
                inputSchema: getSubtasksSchema,
                handler: async (args: Record<string, unknown>) => {
                    if (!args.taskId || typeof args.taskId !== 'string') {
                        throw createError(
                            ErrorCodes.INVALID_INPUT,
                            'Missing or invalid taskId'
                        );
                    }
                    const result = await this.taskManager.getSubtasks(
                        args.taskId,
                        args.sessionId as string | undefined,
                        args.taskListId as string | undefined
                    );
                    return this.formatResponse(result);
                }
            },
            {
                name: 'get_task_tree',
                description: 'Retrieves the complete task hierarchy with rich context. Features:\n' +
                           '- Full parent-child relationships\n' +
                           '- Status propagation information\n' +
                           '- Dependency mappings\n\n' +
                           'Use for understanding project structure and relationships.\n\n' +
                           'Parameters:\n' +
                           '- sessionId (optional): Optional session ID to filter tasks by. If not provided, uses the active session.\n' +
                           '- taskListId (optional): Optional task list ID to filter tasks by. If not provided, uses the active task list.',
                inputSchema: getTaskTreeSchema,
                handler: async (args: Record<string, unknown>) => {
                    const result = await this.taskManager.getTaskTree(
                        args.sessionId as string | undefined,
                        args.taskListId as string | undefined
                    );
                    return this.formatResponse(result);
                }
            }
        ];

        for (const tool of defaultTools) {
            this.registerTool(tool);
        }
    }

    /**
     * Validates create task input
     */
    private validateCreateTaskInput(args: Record<string, unknown>): CreateTaskInput {
        if (!args.name || typeof args.name !== 'string') {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Missing or invalid task name'
            );
        }

        return {
            name: args.name,
            description: args.description as string | undefined,
            type: args.type as TaskType | undefined,
            parentId: args.parentId as string | null | undefined,
            dependencies: (args.dependencies as string[]) || [],
            metadata: args.metadata as Record<string, unknown> | undefined,
            notes: this.validateNotes(args.notes),
            reasoning: args.reasoning as Task['reasoning']
        };
    }

    /**
     * Validates task notes
     * Best practices:
     * 1. Validate note type enum values
     * 2. Ensure content is string and not empty
     * 3. Validate language field when required
     * 4. Sanitize content
     * 5. Validate metadata structure
     * 6. Check content length limits
     */
    private validateNotes(notes: unknown): TaskNote[] | undefined {
        if (!notes) return undefined;
        if (!Array.isArray(notes)) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Notes must be an array'
            );
        }

        const validTypes = ['text', 'code', 'json', 'markdown'];
        return notes.map((note, index) => {
            if (!note || typeof note !== 'object') {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    `Note at index ${index} must be an object`
                );
            }

            const typedNote = note as TaskNote;
            
            // Validate type
            if (!typedNote.type || !validTypes.includes(typedNote.type)) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    `Note type at index ${index} must be one of: ${validTypes.join(', ')}`
                );
            }

            // Validate content
            if (!typedNote.content || typeof typedNote.content !== 'string') {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    `Note content at index ${index} must be a non-empty string`
                );
            }

            // Content length validation
            if (typedNote.content.length > 10000) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    `Note content at index ${index} exceeds 10000 character limit`
                );
            }

            // Language validation for code notes
            if (typedNote.type === 'code') {
                if (typedNote.language && typeof typedNote.language !== 'string') {
                    throw createError(
                        ErrorCodes.INVALID_INPUT,
                        `Language for code note at index ${index} must be a string`
                    );
                }
            }

            // Metadata validation
            if (typedNote.metadata !== undefined && 
                (typeof typedNote.metadata !== 'object' || typedNote.metadata === null)) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    `Metadata for note at index ${index} must be an object`
                );
            }

            // Return sanitized note
            return {
                type: typedNote.type,
                content: typedNote.content.trim(),
                language: typedNote.language,
                metadata: typedNote.metadata
            };
        });
    }

    /**
     * Validates update task input
     * Best practices:
     * 1. Type check all fields before assignment
     * 2. Validate enum values
     * 3. Check field length limits
     * 4. Sanitize string inputs
     * 5. Validate array contents
     * 6. Ensure at least one valid update
     */
    private validateUpdateTaskInput(args: Record<string, unknown>): UpdateTaskInput {
        const updates: UpdateTaskInput = {};

        // Name validation
        if (args.name !== undefined) {
            if (typeof args.name !== 'string') {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    'Task name must be a string'
                );
            }
            if (args.name.length > 200) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    'Task name exceeds 200 character limit'
                );
            }
            updates.name = args.name.trim();
        }

        // Description validation
        if (args.description !== undefined) {
            if (typeof args.description !== 'string') {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    'Task description must be a string'
                );
            }
            updates.description = args.description.trim();
        }

        // Type validation
        if (args.type !== undefined) {
            if (!Object.values(TaskType).includes(args.type as TaskType)) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    `Invalid task type. Must be one of: ${Object.values(TaskType).join(', ')}`
                );
            }
            updates.type = args.type as TaskType;
        }

        // Status validation
        if (args.status !== undefined) {
            if (!Object.values(TaskStatus).includes(args.status as TaskStatus)) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    `Invalid task status. Must be one of: ${Object.values(TaskStatus).join(', ')}`
                );
            }
            updates.status = args.status as TaskStatus;
        }

        // Dependencies validation
        if (args.dependencies !== undefined) {
            if (!Array.isArray(args.dependencies)) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    'Dependencies must be an array'
                );
            }
            if (!args.dependencies.every(dep => typeof dep === 'string')) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    'All dependencies must be strings'
                );
            }
            updates.dependencies = args.dependencies;
        }

        // Metadata validation
        if (args.metadata !== undefined) {
            if (typeof args.metadata !== 'object' || args.metadata === null) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    'Metadata must be an object'
                );
            }
            const metadata = args.metadata as Record<string, unknown>;
            
            // Context validation
            if ('context' in metadata && typeof metadata.context !== 'string') {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    'Metadata context must be a string'
                );
            }

            // Tags validation
            if ('tags' in metadata) {
                if (!Array.isArray(metadata.tags) || 
                    !metadata.tags.every(tag => typeof tag === 'string')) {
                    throw createError(
                        ErrorCodes.INVALID_INPUT,
                        'Metadata tags must be an array of strings'
                    );
                }
            }

            updates.metadata = metadata as {
                context?: string;
                tags?: string[];
                [key: string]: unknown;
            };
        }

        // Notes validation
        if (args.notes !== undefined) {
            updates.notes = this.validateNotes(args.notes);
        }

        // Reasoning validation
        if (args.reasoning !== undefined) {
            updates.reasoning = this.validateReasoning(args.reasoning);
        }

        // Ensure at least one valid update
        if (Object.keys(updates).length === 0) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'At least one valid update field is required'
            );
        }

        return updates;
    }

    /**
     * Validates task reasoning
     * Best practices:
     * 1. Ensure all reasoning fields are strings or string arrays
     * 2. Validate array contents
     * 3. Remove empty entries
     * 4. Trim whitespace
     * 5. Check field length limits
     */
    private validateReasoning(reasoning: unknown): Task['reasoning'] | undefined {
        if (!reasoning) return undefined;
        if (typeof reasoning !== 'object' || reasoning === null) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Reasoning must be an object'
            );
        }

        const validatedReasoning: Task['reasoning'] = {};
        const reasoningObj = reasoning as Record<string, unknown>;

        // Validate approach
        if ('approach' in reasoningObj) {
            if (typeof reasoningObj.approach !== 'string') {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    'Reasoning approach must be a string'
                );
            }
            if (reasoningObj.approach.length > 1000) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    'Reasoning approach exceeds 1000 character limit'
                );
            }
            validatedReasoning.approach = reasoningObj.approach.trim();
        }

        // Validate array fields with type safety
        const validateArrayField = (field: keyof TaskReasoning, value: unknown, fieldName: string): string[] | undefined => {
            if (!Array.isArray(value)) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    `Reasoning ${fieldName} must be an array`
                );
            }
            if (!value.every(item => typeof item === 'string')) {
                throw createError(
                    ErrorCodes.INVALID_INPUT,
                    `All items in ${fieldName} must be strings`
                );
            }
            // Filter empty strings and trim
            const filtered = value
                .map(item => (item as string).trim())
                .filter(item => item.length > 0);

            // Validate individual item lengths
            filtered.forEach((item, index) => {
                if (item.length > 500) {
                    throw createError(
                        ErrorCodes.INVALID_INPUT,
                        `Item ${index} in ${fieldName} exceeds 500 character limit`
                    );
                }
            });

            return filtered.length > 0 ? filtered : undefined;
        };

        // Validate each array field
        if ('assumptions' in reasoningObj) {
            const result = validateArrayField('assumptions', reasoningObj.assumptions, 'assumptions');
            if (result) validatedReasoning.assumptions = result;
        }
        if ('alternatives' in reasoningObj) {
            const result = validateArrayField('alternatives', reasoningObj.alternatives, 'alternatives');
            if (result) validatedReasoning.alternatives = result;
        }
        if ('risks' in reasoningObj) {
            const result = validateArrayField('risks', reasoningObj.risks, 'risks');
            if (result) validatedReasoning.risks = result;
        }
        if ('tradeoffs' in reasoningObj) {
            const result = validateArrayField('tradeoffs', reasoningObj.tradeoffs, 'tradeoffs');
            if (result) validatedReasoning.tradeoffs = result;
        }
        if ('constraints' in reasoningObj) {
            const result = validateArrayField('constraints', reasoningObj.constraints, 'constraints');
            if (result) validatedReasoning.constraints = result;
        }
        if ('dependencies_rationale' in reasoningObj) {
            const result = validateArrayField('dependencies_rationale', reasoningObj.dependencies_rationale, 'dependencies_rationale');
            if (result) validatedReasoning.dependencies_rationale = result;
        }
        if ('impact_analysis' in reasoningObj) {
            const result = validateArrayField('impact_analysis', reasoningObj.impact_analysis, 'impact_analysis');
            if (result) validatedReasoning.impact_analysis = result;
        }

        return Object.keys(validatedReasoning).length > 0 ? validatedReasoning : undefined;
    }

    /**
     * Validates bulk create task input
     */
    private validateBulkCreateTaskInput(args: Record<string, unknown>): BulkCreateTaskInput {
        if (!args.tasks || !Array.isArray(args.tasks)) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Missing or invalid tasks array'
            );
        }

        return {
            parentId: args.parentId as string | null,
            tasks: args.tasks.map(task => this.validateCreateTaskInput(task as Record<string, unknown>))
        };
    }

    /**
     * Validates bulk update task input
     */
    private validateBulkUpdateTaskInput(args: Record<string, unknown>): BulkUpdateTasksInput {
        if (!args.updates || !Array.isArray(args.updates)) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                'Missing or invalid updates array'
            );
        }

        return {
            updates: args.updates.map(update => {
                if (!update || typeof update !== 'object' || !('taskId' in update)) {
                    throw createError(
                        ErrorCodes.INVALID_INPUT,
                        'Invalid update object'
                    );
                }
                return {
                    taskId: update.taskId as string,
                    updates: this.validateUpdateTaskInput(update.updates as Record<string, unknown>)
                };
            })
        };
    }

    /**
     * Formats a response into the standard tool response format
     */
    private formatResponse(result: unknown): ToolResponse {
        try {
            // Handle BigInt conversion and remove sensitive data
            const sanitizedResult = JSON.parse(JSON.stringify(result, (key, value) => {
                // Convert BigInt to string
                if (typeof value === 'bigint') {
                    return value.toString();
                }
                // Remove sensitive fields
                if (key.toLowerCase().includes('secret') || 
                    key.toLowerCase().includes('password') ||
                    key.toLowerCase().includes('token')) {
                    return undefined;
                }
                return value;
            }));

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(sanitizedResult, null, 2)
                }]
            };
        } catch (error) {
            this.logger.error('Failed to format response', { error });
            if (error instanceof Error && error.message.includes('circular')) {
                throw createError(
                    ErrorCodes.INTERNAL_ERROR,
                    'Response contains circular references'
                );
            }
            throw error;
        }
    }

    /**
     * Registers a tool
     */
    private registerTool(tool: Tool & { handler: (args: Record<string, unknown>) => Promise<ToolResponse> }): void {
        const { handler, ...toolDef } = tool;
        this.tools.set(tool.name, toolDef);
        this.toolHandlers.set(tool.name, handler);
    }

    /**
     * Adds additional tools to the handler
     */
    addTools(tools: Tool[], handler?: (name: string, args: Record<string, unknown>) => Promise<ToolResponse>): void {
        for (const tool of tools) {
            if (this.tools.has(tool.name)) {
                this.logger.warn(`Tool ${tool.name} already registered, skipping`);
                continue;
            }
            this.tools.set(tool.name, tool);
            if (handler) {
                this.toolHandlers.set(tool.name, (args) => handler(tool.name, args));
            }
        }
    }

    /**
     * Lists all available tools
     */
    async listTools(): Promise<{ tools: Tool[] }> {
        return {
            tools: Array.from(this.tools.values())
        };
    }

    /**
     * Handles a tool call
     */
    async handleToolCall(request: { params: { name: string; arguments?: Record<string, unknown> } }): Promise<{
        _meta?: Record<string, unknown>;
        content: Array<{ type: string; text: string }>;
    }> {
        const { name, arguments: args = {} } = request.params;

        const tool = this.tools.get(name);
        if (!tool) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                { tool: name },
                'Unknown tool'
            );
        }

        const handler = this.toolHandlers.get(name);
        if (!handler) {
            throw createError(
                ErrorCodes.INVALID_INPUT,
                { tool: name },
                'Tool handler not found'
            );
        }

        try {
            const result = await handler(args);
            return {
                _meta: {},
                ...result
            };
        } catch (error) {
            this.logger.error('Tool execution failed', {
                tool: name,
                error
            });
            throw error;
        }
    }
}
