/**
 * Unified SQLite storage implementation combining task and session storage
 */
import { Database } from 'sqlite';
import { Task, TaskNote, TaskStatus, TaskType } from '../types/task.js';
import { Session, TaskList } from '../types/session.js';
import { StorageMetrics } from '../types/storage.js';
import { Logger } from '../logging/index.js';
import { ConnectionManager } from './connection-manager.js';
import { BaseUnifiedStorage, UnifiedStorageConfig, UnifiedStorageError } from './unified-storage.js';
import { generateShortId } from '../utils/id-generator.js';
import path from 'path';
import { promises as fs, statSync } from 'fs';
import { createHash } from 'crypto';

interface TaskRow {
    id: string;
    name: string;
    description: string | null;
    type: string;
    status: string;
    parent_id: string | null;
    metadata: string;
    notes: string;
    dependencies: string;
    created_at: number;
    updated_at: number;
    checksum: string;
}

export class UnifiedSqliteStorage extends BaseUnifiedStorage {
    private db: Database | null = null;
    private logger: Logger;
    private dbPath: string;
    private initialized: boolean = false;

    constructor(private config: UnifiedStorageConfig) {
        super();
        this.logger = Logger.getInstance().child({ component: 'UnifiedSqliteStorage' });
        this.dbPath = path.join(config.baseDir, `${config.sessionId}.db`);
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // Ensure storage directory exists
            await this.getDirectory();

            // Get database connection from connection manager
            this.db = await ConnectionManager.getInstance().getConnection(
                this.dbPath,
                this.config.maxRetries,
                this.config.retryDelay
            );

            // Import MigrationManager here to avoid circular dependencies
            const { MigrationManager } = await import('./migrations/migration-manager.js');
            const migrationManager = new MigrationManager(this.db);

            // Run migrations
            await migrationManager.migrateUp();

            // Log migration status
            const status = await migrationManager.status();
            this.logger.info('Migration status', {
                applied: status.applied,
                pending: status.pending,
                lastApplied: status.lastApplied
            });

            this.initialized = true;
            this.logger.info('Unified SQLite storage initialized', { path: this.dbPath });
        } catch (error) {
            this.logger.error('Failed to initialize unified SQLite storage', { error });
            throw new UnifiedStorageError(
                'Failed to initialize unified SQLite storage',
                'STORAGE_INIT_ERROR',
                error
            );
        }
    }

    // Task Storage Methods
    async saveTasks(tasks: Task[]): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        await this.db.run('BEGIN TRANSACTION');

        try {
            for (const task of tasks) {
                const checksum = this.computeChecksum(task);
                
                await this.db.run(`
                    INSERT INTO tasks (
                        id, name, description, type, status, parent_id,
                        metadata, created_at, updated_at, checksum
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        description = excluded.description,
                        type = excluded.type,
                        status = excluded.status,
                        parent_id = excluded.parent_id,
                        metadata = excluded.metadata,
                        updated_at = excluded.updated_at,
                        checksum = excluded.checksum
                `, [
                    task.id,
                    task.name,
                    task.description,
                    task.type,
                    task.status,
                    task.parentId,
                    JSON.stringify(task.metadata),
                    task.metadata.created,
                    task.metadata.updated,
                    checksum
                ]);

                await this.db.run('DELETE FROM notes WHERE task_id = ?', task.id);
                
                if (task.notes && task.notes.length > 0) {
                    for (const note of task.notes) {
                        await this.db.run(`
                            INSERT INTO notes (
                                id, task_id, type, content, language, metadata, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        `, [
                            generateShortId(),
                            task.id,
                            note.type,
                            note.content,
                            note.language,
                            note.metadata ? JSON.stringify(note.metadata) : null,
                            Date.now()
                        ]);
                    }
                }

                if (task.dependencies?.length > 0) {
                    await this.db.run('DELETE FROM dependencies WHERE task_id = ?', task.id);
                    
                    for (const depId of task.dependencies) {
                        await this.db.run(`
                            INSERT INTO dependencies (task_id, depends_on, created_at)
                            VALUES (?, ?, ?)
                        `, [task.id, depId, Date.now()]);
                    }
                }
            }

            await this.db.run('COMMIT');
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw new UnifiedStorageError(
                'Failed to save tasks',
                'SAVE_ERROR',
                error
            );
        }
    }

    async loadTasks(): Promise<Task[]> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            const tasks = await this.db.all(`
                SELECT 
                    t.*,
                    COALESCE(
                        json_group_array(
                            DISTINCT json_object(
                                'type', n.type,
                                'content', n.content,
                                'language', n.language,
                                'metadata', json(n.metadata)
                            )
                        ) FILTER (WHERE n.id IS NOT NULL),
                        '[]'
                    ) as notes,
                    COALESCE(
                        json_group_array(DISTINCT d.depends_on) FILTER (WHERE d.depends_on IS NOT NULL),
                        '[]'
                    ) as dependencies
                FROM tasks t
                LEFT JOIN notes n ON t.id = n.task_id
                LEFT JOIN dependencies d ON t.id = d.task_id
                GROUP BY t.id
            `);

            return tasks.map(this.mapTaskRow);
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to load tasks',
                'LOAD_ERROR',
                error
            );
        }
    }

    async getTasksByStatus(status: string): Promise<Task[]> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            const tasks = await this.db.all(`
                SELECT 
                    t.*,
                    COALESCE(
                        json_group_array(
                            DISTINCT json_object(
                                'type', n.type,
                                'content', n.content,
                                'language', n.language,
                                'metadata', json(n.metadata)
                            )
                        ) FILTER (WHERE n.id IS NOT NULL),
                        '[]'
                    ) as notes,
                    COALESCE(
                        json_group_array(DISTINCT d.depends_on) FILTER (WHERE d.depends_on IS NOT NULL),
                        '[]'
                    ) as dependencies
                FROM tasks t
                LEFT JOIN notes n ON t.id = n.task_id
                LEFT JOIN dependencies d ON t.id = d.task_id
                WHERE t.status = ?
                GROUP BY t.id
            `, status);

            return tasks.map(this.mapTaskRow);
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to get tasks by status',
                'QUERY_ERROR',
                error
            );
        }
    }

    async getSubtasks(parentId: string): Promise<Task[]> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            const tasks = await this.db.all(`
                WITH RECURSIVE subtasks AS (
                    SELECT t.*, 0 as depth
                    FROM tasks t
                    WHERE t.parent_id = ?
                    
                    UNION ALL
                    
                    SELECT t.*, s.depth + 1
                    FROM tasks t
                    JOIN subtasks s ON t.parent_id = s.id
                    WHERE s.depth < 5
                )
                SELECT 
                    s.*,
                    COALESCE(
                        json_group_array(
                            DISTINCT json_object(
                                'type', n.type,
                                'content', n.content,
                                'language', n.language,
                                'metadata', json(n.metadata)
                            )
                        ) FILTER (WHERE n.id IS NOT NULL),
                        '[]'
                    ) as notes,
                    COALESCE(
                        json_group_array(DISTINCT d.depends_on) FILTER (WHERE d.depends_on IS NOT NULL),
                        '[]'
                    ) as dependencies
                FROM subtasks s
                LEFT JOIN notes n ON s.id = n.task_id
                LEFT JOIN dependencies d ON s.id = d.task_id
                GROUP BY s.id
                ORDER BY s.depth, s.created_at
            `, parentId);

            return tasks.map(this.mapTaskRow);
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to get subtasks',
                'QUERY_ERROR',
                error
            );
        }
    }

    // Session Storage Methods
    async saveSession(session: Session): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            await this.db.run(`
                INSERT OR REPLACE INTO sessions (
                    id, name, metadata, active_task_list_id,
                    task_list_ids, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                session.id,
                session.name,
                JSON.stringify(session.metadata),
                session.activeTaskListId || null,
                JSON.stringify(session.taskListIds),
                new Date(session.metadata.created).getTime(),
                new Date(session.metadata.updated).getTime()
            ]);

            this.logger.debug('Session saved', { sessionId: session.id });
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to save session',
                'SAVE_ERROR',
                error
            );
        }
    }

    async loadSession(sessionId: string): Promise<Session> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            const row = await this.db.get(`
                SELECT * FROM sessions WHERE id = ?
            `, sessionId);

            if (!row) {
                throw new UnifiedStorageError(
                    `Session ${sessionId} not found`,
                    'NOT_FOUND_ERROR',
                    { sessionId }
                );
            }

            return {
                id: row.id,
                name: row.name,
                metadata: JSON.parse(row.metadata),
                activeTaskListId: row.active_task_list_id,
                taskListIds: JSON.parse(row.task_list_ids)
            };
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to load session',
                'LOAD_ERROR',
                error
            );
        }
    }

    async loadAllSessions(): Promise<Session[]> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            const rows = await this.db.all('SELECT * FROM sessions');
            return rows.map(row => ({
                id: row.id,
                name: row.name,
                metadata: JSON.parse(row.metadata),
                activeTaskListId: row.active_task_list_id,
                taskListIds: JSON.parse(row.task_list_ids)
            }));
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to load all sessions',
                'LOAD_ERROR',
                error
            );
        }
    }

    async deleteSession(sessionId: string): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            await this.db.run('DELETE FROM sessions WHERE id = ?', sessionId);
            this.logger.debug('Session deleted', { sessionId });
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to delete session',
                'DELETE_ERROR',
                error
            );
        }
    }

    async saveTaskList(taskList: TaskList): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            await this.db.run(`
                INSERT OR REPLACE INTO task_lists (
                    id, name, description, metadata,
                    root_task_ids, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                taskList.id,
                taskList.name,
                taskList.description || null,
                JSON.stringify(taskList.metadata),
                JSON.stringify(taskList.rootTaskIds),
                new Date(taskList.metadata.created).getTime(),
                new Date(taskList.metadata.updated).getTime()
            ]);

            this.logger.debug('Task list saved', { taskListId: taskList.id });
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to save task list',
                'SAVE_ERROR',
                error
            );
        }
    }

    async loadTaskList(taskListId: string): Promise<TaskList> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            const row = await this.db.get(`
                SELECT * FROM task_lists WHERE id = ?
            `, taskListId);

            if (!row) {
                throw new UnifiedStorageError(
                    `Task list ${taskListId} not found`,
                    'NOT_FOUND_ERROR',
                    { taskListId }
                );
            }

            return {
                id: row.id,
                name: row.name,
                description: row.description,
                metadata: JSON.parse(row.metadata),
                rootTaskIds: JSON.parse(row.root_task_ids)
            };
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to load task list',
                'LOAD_ERROR',
                error
            );
        }
    }

    async loadAllTaskLists(): Promise<TaskList[]> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            const rows = await this.db.all('SELECT * FROM task_lists');
            return rows.map(row => ({
                id: row.id,
                name: row.name,
                description: row.description,
                metadata: JSON.parse(row.metadata),
                rootTaskIds: JSON.parse(row.root_task_ids)
            }));
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to load all task lists',
                'LOAD_ERROR',
                error
            );
        }
    }

    async deleteTaskList(taskListId: string): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            await this.db.run('DELETE FROM task_lists WHERE id = ?', taskListId);
            this.logger.debug('Task list deleted', { taskListId });
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to delete task list',
                'DELETE_ERROR',
                error
            );
        }
    }

    async saveActiveState(state: {
        activeSessionId?: string;
        activeTaskListId?: string;
    }): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            await this.db.run(`
                UPDATE active_state
                SET active_session_id = ?,
                    active_task_list_id = ?,
                    updated_at = unixepoch()
                WHERE id = 1
            `, [
                state.activeSessionId || null,
                state.activeTaskListId || null
            ]);

            this.logger.debug('Active state saved', state);
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to save active state',
                'SAVE_ERROR',
                error
            );
        }
    }

    async loadActiveState(): Promise<{
        activeSessionId?: string;
        activeTaskListId?: string;
    }> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            const row = await this.db.get('SELECT * FROM active_state WHERE id = 1');
            return {
                activeSessionId: row?.active_session_id,
                activeTaskListId: row?.active_task_list_id
            };
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to load active state',
                'LOAD_ERROR',
                error
            );
        }
    }

    // Common Operations
    async close(): Promise<void> {
        if (this.db) {
            await ConnectionManager.getInstance().closeConnection(this.dbPath);
            this.db = null;
            this.initialized = false;
        }
    }

    async maintenance(): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            await this.db.exec('ANALYZE');
            await this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
            await this.db.exec('VACUUM');
            this.logger.info('Database maintenance completed');
        } catch (error) {
            this.logger.error('Database maintenance failed', { error });
        }
    }

    async estimate(): Promise<StorageMetrics> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            const [
                stats,
                walStats,
                taskCounts,
                notesCount,
                depsCount,
                sessionCounts,
                taskListCount,
                backupInfo,
                pageInfo
            ] = await Promise.all([
                fs.stat(this.dbPath),
                fs.stat(this.dbPath + '-wal').catch(() => ({ size: 0 })),
                this.db.all<{ status: string; count: number }[]>(
                    'SELECT status, COUNT(*) as count FROM tasks GROUP BY status'
                ),
                this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM notes'),
                this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM dependencies'),
                this.db.all<{ active: number; count: number }[]>(
                    `SELECT 
                        CASE WHEN id IN (SELECT active_session_id FROM active_state WHERE active_session_id IS NOT NULL)
                        THEN 1 ELSE 0 END as active,
                        COUNT(*) as count 
                    FROM sessions 
                    GROUP BY active`
                ),
                this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM task_lists'),
                fs.readdir(path.join(path.dirname(this.dbPath), 'backups'))
                    .then(files => ({
                        count: files.length,
                        lastBackup: files.length > 0 
                            ? new Date(Math.max(...files.map(f => 
                                statSync(path.join(path.dirname(this.dbPath), 'backups', f)).mtime.getTime()
                              ))).toISOString()
                            : undefined
                    }))
                    .catch(() => ({ count: 0, lastBackup: undefined })),
                this.db.get<{ page_size: number, page_count: number }>(
                    'PRAGMA page_size; PRAGMA page_count;'
                )
            ]);

            // Calculate task metrics
            const byStatus: Record<string, number> = {};
            let totalTasks = 0;
            for (const { status, count } of taskCounts) {
                byStatus[status] = count;
                totalTasks += count;
            }

            // Calculate session metrics
            const activeSessions = sessionCounts.find(s => s.active === 1)?.count || 0;
            const totalSessions = sessionCounts.reduce((sum, s) => sum + s.count, 0);

            return {
                tasks: {
                    total: totalTasks,
                    byStatus,
                    noteCount: notesCount?.count || 0,
                    dependencyCount: depsCount?.count || 0
                },
                sessions: {
                    total: totalSessions,
                    active: activeSessions,
                    taskListCount: taskListCount?.count || 0
                },
                storage: {
                    totalSize: stats.size,
                    walSize: walStats.size,
                    backupCount: backupInfo.count,
                    lastBackup: backupInfo.lastBackup,
                    pageSize: pageInfo?.page_size || 4096,
                    pageCount: pageInfo?.page_count || 0
                }
            };
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to estimate storage size',
                'ESTIMATE_ERROR',
                error
            );
        }
    }

    async getDirectory(): Promise<string> {
        const dirPath = path.dirname(this.dbPath);
        const backupsPath = path.join(dirPath, 'backups');
        
        await Promise.all([
            fs.mkdir(dirPath, { recursive: true }),
            fs.mkdir(backupsPath, { recursive: true })
        ]);
        
        return dirPath;
    }

    async persist(): Promise<boolean> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            await this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
            const fd = await fs.open(this.dbPath, 'r');
            try {
                await fd.sync();
            } finally {
                await fd.close();
            }
            this.logger.info('Database persisted to disk');
            return true;
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to persist database',
                'PERSIST_ERROR',
                error
            );
        }
    }

    async persisted(): Promise<boolean> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            const result = await this.db.get<{ busy: number }>('PRAGMA wal_checkpoint');
            return (result?.busy ?? 0) === 0;
        } catch (error) {
            throw new UnifiedStorageError(
                'Failed to check persistence status',
                'PERSIST_CHECK_ERROR',
                error
            );
        }
    }

    private computeChecksum(task: Task): string {
        const content = JSON.stringify({
            id: task.id,
            name: task.name,
            description: task.description,
            type: task.type,
            status: task.status,
            parentId: task.parentId,
            notes: task.notes,
            dependencies: task.dependencies,
            metadata: task.metadata
        });
        return createHash('sha256').update(content).digest('hex');
    }

    private mapTaskRow(row: TaskRow): Task {
        return {
            id: row.id,
            name: row.name,
            description: row.description || undefined,
            type: row.type as TaskType,
            status: row.status as TaskStatus,
            parentId: row.parent_id,
            notes: JSON.parse(row.notes) as TaskNote[],
            dependencies: JSON.parse(row.dependencies) as string[],
            metadata: JSON.parse(row.metadata),
            subtasks: []
        };
    }
}
