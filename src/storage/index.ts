/**
 * Storage module for Atlas MCP Server
 * Handles task persistence, session management, and file operations
 */
import fs from 'fs/promises';
import path from 'path';
import { Task } from '../types/task.js';

export interface StorageConfig {
    baseDir: string;
    sessionId: string;
}

/**
 * Error class for storage-related errors
 */
export class StorageError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = 'StorageError';
    }
}

/**
 * Manages task persistence and session data
 */
export class StorageManager {
    private storageDir: string;
    private sessionFile: string;

    constructor(private config: StorageConfig) {
        this.storageDir = path.join(config.baseDir, 'sessions');
        this.sessionFile = this.getSessionFile();
    }

    /**
     * Gets the current session ID
     */
    getSessionId(): string {
        return this.config.sessionId;
    }

    /**
     * Initializes storage directory
     * @throws StorageError if initialization fails
     */
    async initialize(): Promise<void> {
        try {
            await fs.mkdir(this.storageDir, { recursive: true });
        } catch (error) {
            throw new StorageError(
                'Failed to initialize storage directory',
                'STORAGE_INIT_ERROR',
                error
            );
        }
    }

    /**
     * Gets the session file path
     * @returns Full path to session file
     */
    private getSessionFile(): string {
        return path.join(this.storageDir, `${this.config.sessionId}.json`);
    }

    /**
     * Loads tasks from storage
     * @returns Promise resolving to loaded tasks
     * @throws StorageError if load operation fails
     */
    async loadTasks(): Promise<Task[]> {
        try {
            const exists = await this.fileExists(this.sessionFile);
            if (!exists) {
                return [];
            }

            const data = await fs.readFile(this.sessionFile, 'utf-8');
            const tasks = JSON.parse(data);

            // Handle legacy content field
            return tasks.map((task: any) => {
                if (task.content && !task.notes) {
                    task.notes = task.content;
                    delete task.content;
                }
                return task;
            });
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new StorageError(
                    'Invalid task data format',
                    'INVALID_DATA_FORMAT',
                    error
                );
            }
            throw new StorageError(
                'Failed to load tasks',
                'LOAD_ERROR',
                error
            );
        }
    }

    /**
     * Saves tasks to storage
     * @param tasks Tasks to save
     * @throws StorageError if save operation fails
     */
    async saveTasks(tasks: Task[]): Promise<void> {
        const tempFile = `${this.sessionFile}.temp`;

        try {
            const data = JSON.stringify(tasks, null, 2);
            await fs.writeFile(tempFile, data, 'utf-8');
            await fs.rename(tempFile, this.sessionFile);
        } catch (error) {
            // Clean up temp file if it exists
            try {
                const tempExists = await this.fileExists(tempFile);
                if (tempExists) {
                    await fs.unlink(tempFile);
                }
            } catch (cleanupError) {
                console.error('Error cleaning up temp file:', cleanupError);
            }

            throw new StorageError(
                'Failed to save tasks',
                'SAVE_ERROR',
                error
            );
        }
    }

    /**
     * Checks if a file exists
     * @param filePath Path to check
     * @returns Promise resolving to boolean indicating existence
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Performs data migration if needed
     * @param tasks Tasks to migrate
     * @returns Migrated tasks
     */
    private migrateData(tasks: Task[]): Task[] {
        return tasks.map(task => ({
            ...task,
            metadata: {
                ...task.metadata,
                version: '1.0.0', // Add version tracking
            }
        }));
    }

    /**
     * Validates task data structure
     * @param tasks Tasks to validate
     * @throws StorageError if validation fails
     */
    private validateTaskData(tasks: Task[]): void {
        for (const task of tasks) {
            if (!task.id || typeof task.id !== 'string') {
                throw new StorageError(
                    'Invalid task data: missing or invalid ID',
                    'INVALID_TASK_DATA',
                    { taskId: task.id }
                );
            }
            if (!task.name || typeof task.name !== 'string') {
                throw new StorageError(
                    'Invalid task data: missing or invalid name',
                    'INVALID_TASK_DATA',
                    { taskId: task.id }
                );
            }
        }
    }

    /**
     * Backs up task data
     * @param tasks Tasks to backup
     */
    private async backupTasks(tasks: Task[]): Promise<void> {
        const backupDir = path.join(this.storageDir, 'backups');
        const backupFile = path.join(
            backupDir,
            `${this.config.sessionId}_${Date.now()}.json`
        );

        try {
            await fs.mkdir(backupDir, { recursive: true });
            await fs.writeFile(backupFile, JSON.stringify(tasks, null, 2));
        } catch (error) {
            console.error('Failed to create backup:', error);
        }
    }

    /**
     * Cleans up old backup files
     * Keeps only the last 5 backups
     */
    private async cleanupBackups(): Promise<void> {
        const backupDir = path.join(this.storageDir, 'backups');
        try {
            const files = await fs.readdir(backupDir);
            const backups = files
                .filter(f => f.startsWith(this.config.sessionId))
                .sort()
                .reverse();

            // Keep only the last 5 backups
            const toDelete = backups.slice(5);
            for (const file of toDelete) {
                await fs.unlink(path.join(backupDir, file));
            }
        } catch (error) {
            console.error('Failed to cleanup backups:', error);
        }
    }
}
