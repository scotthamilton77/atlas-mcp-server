import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { Task, TaskNote, TaskStatus, TaskType } from '../types/task.js';
import { StorageConfig, StorageError, StorageStats, StorageManager } from './index.js';
import { Logger } from '../logging/index.js';
import path from 'path';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';

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

interface NoteRow {
    id: string;
    task_id: string;
    type: string;
    content: string;
    language: string | null;
    metadata: string | null;
    created_at: number;
}

/**
 * SQLite-backed storage manager for improved scalability
 */
export class SqliteStorageManager implements StorageManager {
    private db: Database | null = null;
    private logger: Logger;
    private dbPath: string;
    private initialized: boolean = false;

    constructor(private config: StorageConfig) {
        this.logger = Logger.getInstance().child({ component: 'SqliteStorageManager' });
        this.dbPath = path.join(config.baseDir, `${config.sessionId}.db`);
    }

    // Required methods from StorageManager interface
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // Open database with WAL mode for better concurrency
            this.db = await open({
                filename: this.dbPath,
                driver: sqlite3.Database
            });

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
            this.logger.info('SQLite storage initialized', { path: this.dbPath });
        } catch (error) {
            this.logger.error('Failed to initialize SQLite storage', { error });
            throw new StorageError(
                'Failed to initialize SQLite storage',
                'STORAGE_INIT_ERROR',
                error
            );
        }
    }

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
                            crypto.randomUUID(),
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
            throw new StorageError(
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

            return tasks.map((row: TaskRow) => ({
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
            }));
        } catch (error) {
            throw new StorageError(
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

            return tasks.map((row: TaskRow) => ({
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
            }));
        } catch (error) {
            throw new StorageError(
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

            return tasks.map((row: TaskRow) => ({
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
            }));
        } catch (error) {
            throw new StorageError(
                'Failed to get subtasks',
                'QUERY_ERROR',
                error
            );
        }
    }

    async close(): Promise<void> {
        if (this.db) {
            await this.db.close();
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

    // Optional methods from StorageManager interface
    estimate?(): Promise<StorageStats> {
        if (!this.db) throw new Error('Database not initialized');

        return Promise.all([
            fs.stat(this.dbPath),
            this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM tasks'),
            this.db.get<{ count: number }>('SELECT COUNT(*) as count FROM notes'),
            fs.readdir(path.join(path.dirname(this.dbPath), 'backups'))
                .then(files => files.length)
                .catch(() => 0)
        ]).then(([stats, taskCount, noteCount, backupCount]) => ({
            size: stats.size,
            tasks: taskCount?.count || 0,
            notes: noteCount?.count || 0,
            backups: backupCount
        })).catch(error => {
            throw new StorageError(
                'Failed to estimate storage size',
                'ESTIMATE_ERROR',
                error
            );
        });
    }

    getDirectory?(): Promise<string> {
        const dirPath = path.dirname(this.dbPath);
        return fs.mkdir(dirPath, { recursive: true }).then(() => dirPath);
    }

    async persist?(): Promise<boolean> {
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
            throw new StorageError(
                'Failed to persist database',
                'PERSIST_ERROR',
                error
            );
        }
    }

    async persisted?(): Promise<boolean> {
        if (!this.db) throw new Error('Database not initialized');

        try {
            const result = await this.db.get<{ busy: number }>('PRAGMA wal_checkpoint');
            return (result?.busy ?? 0) === 0;
        } catch (error) {
            throw new StorageError(
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
}
