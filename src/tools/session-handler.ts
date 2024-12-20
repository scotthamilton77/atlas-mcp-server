/**
 * Session Management Tool Handlers
 */

import { SessionManager } from '../types/session.js';
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';
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

export class SessionToolHandler {
    private logger: Logger;

    constructor(private sessionManager: SessionManager) {
        this.logger = Logger.getInstance().child({ component: 'SessionToolHandler' });
    }

    /**
     * Gets tool definitions for session management
     */
    getTools() {
        return [
            {
                name: 'create_session',
                description: `Creates a new session

Parameters:
- name*: Name of the session. Best practice: Use descriptive names that include purpose and date (e.g., "Feature Development - March 2024").
- metadata: Additional session metadata. Best practice: Use for tracking session objectives and outcomes.`,
                inputSchema: createSessionSchema
            },
            {
                name: 'create_task_list',
                description: `Creates a new task list in the current session

Parameters:
- name*: Name of the task list. Best practice: Use descriptive names that reflect the purpose or theme (e.g., "Q1 Feature Development", "Security Improvements").
- description: Description of the task list. Best practice: Include goals, success criteria, and any relevant timelines or constraints.
- metadata: Additional task list metadata. Best practice: Use for cross-referencing and organization.
- persistent: Whether the task list should persist across sessions. Best practice: Use true for long-term projects, false for temporary task groupings.`,
                inputSchema: createTaskListSchema
            },
            {
                name: 'switch_session',
                description: `Switches to a different session

Parameters:
- sessionId*: ID of the session to switch to. Best practice: Save any pending changes in current session before switching.`,
                inputSchema: switchSessionSchema
            },
            {
                name: 'switch_task_list',
                description: `Switches to a different task list in the current session

Parameters:
- taskListId*: ID of the task list to switch to. Best practice: Verify task list exists and contains active tasks before switching.`,
                inputSchema: switchTaskListSchema
            },
            {
                name: 'list_sessions',
                description: `Lists all available sessions

Parameters:
- includeArchived: Whether to include archived sessions. Best practice: Use for auditing or reviewing historical work patterns.`,
                inputSchema: listSessionsSchema
            },
            {
                name: 'list_task_lists',
                description: `Lists all task lists in the current session

Parameters:
- includeArchived: Whether to include archived task lists. Best practice: Use true when reviewing historical data or reactivating old projects.`,
                inputSchema: listTaskListsSchema
            },
            {
                name: 'archive_session',
                description: `Archives a session

Parameters:
- sessionId*: ID of the session to archive. Best practice: Document session outcomes and ensure all task lists are properly resolved before archiving.`,
                inputSchema: archiveSessionSchema
            },
            {
                name: 'archive_task_list',
                description: `Archives a task list

Parameters:
- taskListId*: ID of the task list to archive. Best practice: Ensure all tasks are completed or properly transferred before archiving.`,
                inputSchema: archiveTaskListSchema
            }
        ];
    }

    /**
     * Handles tool calls for session management
     */
    async handleToolCall(name: string, args: Record<string, unknown>) {
        try {
            switch (name) {
                case 'create_session':
                    return this.handleCreateSession(args);
                case 'create_task_list':
                    return this.handleCreateTaskList(args);
                case 'switch_session':
                    return this.handleSwitchSession(args);
                case 'switch_task_list':
                    return this.handleSwitchTaskList(args);
                case 'list_sessions':
                    return this.handleListSessions(args);
                case 'list_task_lists':
                    return this.handleListTaskLists(args);
                case 'archive_session':
                    return this.handleArchiveSession(args);
                case 'archive_task_list':
                    return this.handleArchiveTaskList(args);
                default:
                    throw createError(
                        ErrorCodes.INVALID_INPUT,
                        { tool: name },
                        'Unknown session management tool'
                    );
            }
        } catch (error) {
            this.logger.error('Session tool error', { tool: name, error });
            throw error;
        }
    }

    /**
     * Creates a new session
     */
    private async handleCreateSession(args: Record<string, unknown>) {
        const input = args as {
            name: string;
            metadata?: {
                tags?: string[];
                context?: string;
            };
        };

        const session = await this.sessionManager.createSession(input);
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    message: 'Session created successfully',
                    session
                }, null, 2)
            }]
        };
    }

    /**
     * Creates a new task list
     */
    private async handleCreateTaskList(args: Record<string, unknown>) {
        const input = args as {
            name: string;
            description?: string;
            metadata?: {
                tags?: string[];
                context?: string;
            };
            persistent?: boolean;
        };

        const taskList = await this.sessionManager.createTaskList(input);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    message: 'Task list created successfully',
                    taskList
                }, null, 2)
            }]
        };
    }

    /**
     * Switches to a different session
     */
    private async handleSwitchSession(args: Record<string, unknown>) {
        const { sessionId } = args as { sessionId: string };
        await this.sessionManager.switchSession(sessionId);

        const session = await this.sessionManager.getActiveSession();
        const taskList = await this.sessionManager.getActiveTaskList();

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    message: 'Switched session successfully',
                    session,
                    activeTaskList: taskList
                }, null, 2)
            }]
        };
    }

    /**
     * Switches to a different task list
     */
    private async handleSwitchTaskList(args: Record<string, unknown>) {
        const { taskListId } = args as { taskListId: string };
        await this.sessionManager.switchTaskList(taskListId);

        const taskList = await this.sessionManager.getActiveTaskList();
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    message: 'Switched task list successfully',
                    taskList
                }, null, 2)
            }]
        };
    }

    /**
     * Lists all available sessions
     */
    private async handleListSessions(args: Record<string, unknown>) {
        const { includeArchived = false } = args as { includeArchived?: boolean };
        const sessions = await this.sessionManager.listSessions(includeArchived);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    message: 'Sessions retrieved successfully',
                    sessions
                }, null, 2)
            }]
        };
    }

    /**
     * Lists all task lists in current session
     */
    private async handleListTaskLists(args: Record<string, unknown>) {
        const { includeArchived = false } = args as { includeArchived?: boolean };
        const taskLists = await this.sessionManager.listTaskLists(includeArchived);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    message: 'Task lists retrieved successfully',
                    taskLists
                }, null, 2)
            }]
        };
    }

    /**
     * Archives a session
     */
    private async handleArchiveSession(args: Record<string, unknown>) {
        const { sessionId } = args as { sessionId: string };
        await this.sessionManager.archiveSession(sessionId);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    message: 'Session archived successfully',
                    sessionId
                }, null, 2)
            }]
        };
    }

    /**
     * Archives a task list
     */
    private async handleArchiveTaskList(args: Record<string, unknown>) {
        const { taskListId } = args as { taskListId: string };
        await this.sessionManager.archiveTaskList(taskListId);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    message: 'Task list archived successfully',
                    taskListId
                }, null, 2)
            }]
        };
    }
}
