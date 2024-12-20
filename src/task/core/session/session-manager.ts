/**
 * Session Manager Implementation
 * Handles session and task list management with persistence
 */

import { randomUUID } from 'crypto';
import { 
    Session, 
    SessionManager, 
    SessionStorage, 
    TaskList,
    CreateSessionInput,
    CreateTaskListInput
} from '../../../types/session.js';
import { Logger } from '../../../logging/index.js';
import { ErrorCodes, createError } from '../../../errors/index.js';

export class DefaultSessionManager implements SessionManager {
    private logger: Logger;
    private activeSession: Session | null = null;
    private activeTaskList: TaskList | null = null;

    constructor(private storage: SessionStorage) {
        this.logger = Logger.getInstance().child({ component: 'SessionManager' });
    }

    /**
     * Initializes the session manager and restores active state
     */
    async initialize(): Promise<void> {
        try {
            // Load active state
            const state = await this.storage.loadActiveState();
            
            if (state.activeSessionId) {
                this.activeSession = await this.storage.loadSession(state.activeSessionId);
                
                if (state.activeTaskListId) {
                    this.activeTaskList = await this.storage.loadTaskList(state.activeTaskListId);
                }
            }

            this.logger.info('Session manager initialized', {
                activeSession: this.activeSession?.id,
                activeTaskList: this.activeTaskList?.id
            });
        } catch (error) {
            this.logger.error('Failed to initialize session manager', { error });
            throw createError(ErrorCodes.STORAGE_INIT, error);
        }
    }

    /**
     * Creates a new session
     */
    async createSession(input: CreateSessionInput): Promise<Session> {
        try {
            const now = Date.now();
            const session: Session = {
                id: randomUUID(),
                name: input.name,
                metadata: {
                    created: now,
                    updated: now,
                    ...(input.metadata || {})
                },
                taskListIds: []
            };

            await this.storage.saveSession(session);
            
            // Set as active if no active session
            if (!this.activeSession) {
                this.activeSession = session;
                await this.storage.saveActiveState({ activeSessionId: session.id });
            }

            this.logger.info('Session created', { sessionId: session.id });
            return session;
        } catch (error) {
            this.logger.error('Failed to create session', { error });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Gets a session by ID
     */
    async getSession(sessionId: string): Promise<Session> {
        try {
            return await this.storage.loadSession(sessionId);
        } catch (error) {
            this.logger.error('Failed to get session', { error });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Switches to a different session
     */
    async switchSession(sessionId: string): Promise<void> {
        try {
            const session = await this.storage.loadSession(sessionId);
            this.activeSession = session;
            this.activeTaskList = null;

            // Load active task list if set
            if (session.activeTaskListId) {
                this.activeTaskList = await this.storage.loadTaskList(session.activeTaskListId);
            }

            await this.storage.saveActiveState({
                activeSessionId: session.id,
                activeTaskListId: this.activeTaskList?.id
            });

            this.logger.info('Switched session', {
                sessionId,
                activeTaskList: this.activeTaskList?.id
            });
        } catch (error) {
            this.logger.error('Failed to switch session', { error });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Lists all available sessions
     */
    async listSessions(includeArchived = false): Promise<Session[]> {
        try {
            const sessions = await this.storage.loadAllSessions();
            return includeArchived 
                ? sessions 
                : sessions.filter(s => !s.metadata.archived);
        } catch (error) {
            this.logger.error('Failed to list sessions', { error });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Archives a session
     */
    async archiveSession(sessionId: string): Promise<void> {
        try {
            const session = await this.storage.loadSession(sessionId);
            
            const updatedSession: Session = {
                ...session,
                metadata: {
                    ...session.metadata,
                    archived: true,
                    updated: Date.now()
                }
            };

            await this.storage.saveSession(updatedSession);

            // Clear active session if archived
            if (this.activeSession?.id === sessionId) {
                this.activeSession = null;
                this.activeTaskList = null;
                await this.storage.saveActiveState({});
            }

            this.logger.info('Session archived', { sessionId });
        } catch (error) {
            this.logger.error('Failed to archive session', { error });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Gets the currently active session
     */
    async getActiveSession(): Promise<Session | null> {
        return this.activeSession;
    }

    /**
     * Creates a new task list
     */
    async createTaskList(input: CreateTaskListInput): Promise<TaskList> {
        if (!this.activeSession) {
            throw createError(
                ErrorCodes.INVALID_STATE,
                'No active session'
            );
        }

        try {
            const now = Date.now();
            const taskList: TaskList = {
                id: randomUUID(),
                name: input.name,
                description: input.description,
                metadata: {
                    created: now,
                    updated: now,
                    persistent: input.persistent ?? true,
                    ...(input.metadata || {})
                },
                rootTaskIds: []
            };

            await this.storage.saveTaskList(taskList);

            // Update session
            const updatedSession: Session = {
                ...this.activeSession,
                taskListIds: [...this.activeSession.taskListIds, taskList.id],
                metadata: {
                    ...this.activeSession.metadata,
                    updated: Date.now()
                }
            };

            await this.storage.saveSession(updatedSession);
            this.activeSession = updatedSession;

            // Set as active if no active task list
            if (!this.activeTaskList) {
                this.activeTaskList = taskList;
                await this.storage.saveActiveState({
                    activeSessionId: this.activeSession.id,
                    activeTaskListId: taskList.id
                });
            }

            this.logger.info('Task list created', {
                taskListId: taskList.id,
                sessionId: this.activeSession.id
            });

            return taskList;
        } catch (error) {
            this.logger.error('Failed to create task list', { error });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Gets a task list by ID
     */
    async getTaskList(taskListId: string): Promise<TaskList> {
        try {
            return await this.storage.loadTaskList(taskListId);
        } catch (error) {
            this.logger.error('Failed to get task list', { error });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Switches to a different task list
     */
    async switchTaskList(taskListId: string): Promise<void> {
        if (!this.activeSession) {
            throw createError(
                ErrorCodes.INVALID_STATE,
                'No active session'
            );
        }

        try {
            const taskList = await this.storage.loadTaskList(taskListId);
            this.activeTaskList = taskList;

            // Update session
            const updatedSession: Session = {
                ...this.activeSession,
                activeTaskListId: taskList.id,
                metadata: {
                    ...this.activeSession.metadata,
                    updated: Date.now()
                }
            };

            await this.storage.saveSession(updatedSession);
            this.activeSession = updatedSession;

            await this.storage.saveActiveState({
                activeSessionId: this.activeSession.id,
                activeTaskListId: taskList.id
            });

            this.logger.info('Switched task list', {
                taskListId,
                sessionId: this.activeSession.id
            });
        } catch (error) {
            this.logger.error('Failed to switch task list', { error });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Lists all available task lists
     */
    async listTaskLists(includeArchived = false): Promise<TaskList[]> {
        if (!this.activeSession) {
            throw createError(
                ErrorCodes.INVALID_STATE,
                'No active session'
            );
        }

        try {
            const taskLists = await Promise.all(
                this.activeSession.taskListIds.map(id => 
                    this.storage.loadTaskList(id)
                )
            );

            return includeArchived
                ? taskLists
                : taskLists.filter(t => !t.metadata.archived);
        } catch (error) {
            this.logger.error('Failed to list task lists', { error });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Archives a task list
     */
    async archiveTaskList(taskListId: string): Promise<void> {
        if (!this.activeSession) {
            throw createError(
                ErrorCodes.INVALID_STATE,
                'No active session'
            );
        }

        try {
            const taskList = await this.storage.loadTaskList(taskListId);
            
            const updatedTaskList: TaskList = {
                ...taskList,
                metadata: {
                    ...taskList.metadata,
                    archived: true,
                    updated: Date.now()
                }
            };

            await this.storage.saveTaskList(updatedTaskList);

            // Clear active task list if archived
            if (this.activeTaskList?.id === taskListId) {
                this.activeTaskList = null;
                
                const updatedSession: Session = {
                    ...this.activeSession,
                    activeTaskListId: undefined,
                    metadata: {
                        ...this.activeSession.metadata,
                        updated: Date.now()
                    }
                };

                await this.storage.saveSession(updatedSession);
                this.activeSession = updatedSession;

                await this.storage.saveActiveState({
                    activeSessionId: this.activeSession.id
                });
            }

            this.logger.info('Task list archived', {
                taskListId,
                sessionId: this.activeSession.id
            });
        } catch (error) {
            this.logger.error('Failed to archive task list', { error });
            throw createError(ErrorCodes.OPERATION_FAILED, error);
        }
    }

    /**
     * Gets the currently active task list
     */
    async getActiveTaskList(): Promise<TaskList | null> {
        return this.activeTaskList;
    }
}
