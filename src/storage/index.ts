/**
 * Storage module for Atlas MCP Server
 * Handles task persistence, session management, and file operations
 */
import fs from 'fs/promises';
import path from 'path';
import { Task } from '../types/task.js';
import { createHash } from 'crypto';
import { setTimeout } from 'timers/promises';

export interface StorageConfig {
    baseDir: string;
    sessionId: string;
    maxRetries?: number;
    retryDelay?: number;
    maxBackups?: number;
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
 * Lock manager for concurrent operations
 */
class LockManager {
    private locks: Map<string, Promise<void>> = new Map();
    private timeoutHandles: Map<string, ReturnType<typeof globalThis.setTimeout>> = new Map();
    private readonly LOCK_TIMEOUT = 30000; // 30 seconds

    async acquireLock(key: string): Promise<() => void> {
        // Clear any existing timeout
        if (this.timeoutHandles.has(key)) {
            const existingTimeout = this.timeoutHandles.get(key);
            if (existingTimeout) {
                globalThis.clearTimeout(existingTimeout);
            }
            this.timeoutHandles.delete(key);
        }

        while (this.locks.has(key)) {
            try {
                await this.locks.get(key);
            } catch (error) {
                // Lock was forcibly released due to timeout
                this.locks.delete(key);
                break;
            }
        }

        let releaseLock: () => void;
        const lockPromise = new Promise<void>((resolve, reject) => {
            releaseLock = () => {
                this.locks.delete(key);
                const timeoutHandle = this.timeoutHandles.get(key);
                if (timeoutHandle) {
                    globalThis.clearTimeout(timeoutHandle);
                    this.timeoutHandles.delete(key);
                }
                resolve();
            };

            // Set timeout to automatically release lock
            const timeoutHandle = globalThis.setTimeout(() => {
                this.locks.delete(key);
                this.timeoutHandles.delete(key);
                reject(new Error('Lock timeout'));
            }, this.LOCK_TIMEOUT);

            this.timeoutHandles.set(key, timeoutHandle);
        });

        this.locks.set(key, lockPromise);
        return releaseLock!;
    }

    async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
        const release = await this.acquireLock(key);
        try {
            return await operation();
        } finally {
            release();
        }
    }
}

/**
 * Transaction manager for atomic operations
 */
class TransactionManager {
    private transactions: Map<string, {
        tasks: Task[];
        timestamp: number;
    }> = new Map();

    startTransaction(tasks: Task[]): string {
        const transactionId = crypto.randomUUID();
        this.transactions.set(transactionId, {
            tasks,
            timestamp: Date.now()
        });
        return transactionId;
    }

    getTransaction(transactionId: string): Task[] | undefined {
        const transaction = this.transactions.get(transactionId);
        return transaction?.tasks;
    }

    commitTransaction(transactionId: string): void {
        this.transactions.delete(transactionId);
    }

    rollbackTransaction(transactionId: string): void {
        this.transactions.delete(transactionId);
    }
}

/**
 * Manages task persistence and session data
 */
export class StorageManager {
    private storageDir: string;
    private sessionFile: string;
    private lockManager: LockManager;
    private transactionManager: TransactionManager;
    private maxRetries: number;
    private retryDelay: number;
    private maxBackups: number;

    constructor(private config: StorageConfig) {
        this.storageDir = path.join(config.baseDir, 'sessions');
        this.sessionFile = this.getSessionFile();
        this.lockManager = new LockManager();
        this.transactionManager = new TransactionManager();
        this.maxRetries = config.maxRetries || 3;
        this.retryDelay = config.retryDelay || 1000;
        this.maxBackups = config.maxBackups || 5;
    }

    /**
     * Gets the current session ID
     */
    getSessionId(): string {
        return this.config.sessionId;
    }

    /**
     * Initializes storage directory with proper permissions
     */
    async initialize(): Promise<void> {
        return this.lockManager.withLock('init', async () => {
            try {
                // Create main storage directory
                await fs.mkdir(this.storageDir, { recursive: true, mode: 0o750 });
                
                // Create backup directory
                const backupDir = path.join(this.storageDir, 'backups');
                await fs.mkdir(backupDir, { recursive: true, mode: 0o750 });

                // Create temp directory for atomic operations
                const tempDir = path.join(this.storageDir, 'temp');
                await fs.mkdir(tempDir, { recursive: true, mode: 0o750 });

                // Initialize empty session file if it doesn't exist
                if (!await this.fileExists(this.sessionFile)) {
                    await this.saveTasks([]);
                }
            } catch (error) {
                throw new StorageError(
                    'Failed to initialize storage directory',
                    'STORAGE_INIT_ERROR',
                    error
                );
            }
        });
    }

    /**
     * Gets the session file path
     */
    private getSessionFile(): string {
        return path.join(this.storageDir, `${this.config.sessionId}.json`);
    }

    /**
     * Retries an operation with exponential backoff
     */
    private async withRetry<T>(
        operation: () => Promise<T>,
        retryCount = 0
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retryCount >= this.maxRetries) {
                throw error;
            }
            await setTimeout(this.retryDelay * Math.pow(2, retryCount));
            return this.withRetry(operation, retryCount + 1);
        }
    }

    /**
     * Loads tasks from storage with data validation and versioning
     */
    async loadTasks(): Promise<Task[]> {
        return this.lockManager.withLock('read', async () => {
            return this.withRetry(async () => {
                try {
                    const exists = await this.fileExists(this.sessionFile);
                    if (!exists) {
                        return [];
                    }

                    const data = await fs.readFile(this.sessionFile, 'utf-8');
                    const { tasks, checksum } = JSON.parse(data);

                    // Verify data integrity
                    const computedChecksum = this.computeChecksum(tasks);
                    if (checksum !== computedChecksum) {
                        // Attempt recovery
                        console.error('Data integrity check failed, attempting recovery');
                        return this.recoverFromBackup();
                    }

                    // Handle data migration
                    const migratedTasks = this.migrateData(tasks);
                    
                    // Validate task data
                    this.validateTaskData(migratedTasks);

                    return migratedTasks;
                } catch (error) {
                    console.error('Error loading tasks:', error);
                    // Attempt recovery on any error
                    return this.recoverFromBackup();
                }
            });
        });
    }

    /**
     * Saves tasks to storage with atomic writes and integrity checks
     */
    async saveTasks(tasks: Task[]): Promise<void> {
        return this.lockManager.withLock('write', async () => {
            const tempFile = `${this.sessionFile}.temp`;
            const transactionId = this.transactionManager.startTransaction(tasks);

            try {
                await this.withRetry(async () => {
                    // Validate before saving
                    this.validateTaskData(tasks);

                    // Create backup before saving
                    await this.backupTasks(tasks);

                    // Compute checksum for data integrity
                    const checksum = this.computeChecksum(tasks);
                    const data = JSON.stringify({
                        tasks,
                        checksum,
                        version: '1.0.0',
                        timestamp: new Date().toISOString(),
                        transactionId
                    }, null, 2);

                    // Atomic write using temp file
                    await fs.writeFile(tempFile, data, { mode: 0o640 });
                    await fs.rename(tempFile, this.sessionFile);

                    // Commit transaction
                    this.transactionManager.commitTransaction(transactionId);

                    // Cleanup old backups
                    await this.cleanupBackups();
                });
            } catch (error) {
                // Rollback transaction
                this.transactionManager.rollbackTransaction(transactionId);

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
        });
    }

    /**
     * Computes checksum for data integrity verification
     */
    private computeChecksum(tasks: Task[]): string {
        const content = JSON.stringify(tasks);
        return createHash('sha256').update(content).digest('hex');
    }

    /**
     * Checks if a file exists
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
     */
    private migrateData(tasks: Task[]): Task[] {
        return tasks.map(task => ({
            ...task,
            metadata: {
                ...task.metadata,
                version: '1.0.0',
                migrated: task.metadata.version !== '1.0.0',
                originalVersion: task.metadata.version || '0.0.0'
            }
        }));
    }

    /**
     * Validates task data structure
     */
    private validateTaskData(tasks: Task[]): void {
        const seenIds = new Set<string>();
        const seenParentIds = new Set<string>();

        for (const task of tasks) {
            // Check for duplicate IDs
            if (seenIds.has(task.id)) {
                throw new StorageError(
                    'Invalid task data: duplicate ID',
                    'INVALID_TASK_DATA',
                    { taskId: task.id }
                );
            }
            seenIds.add(task.id);

            // Basic field validation
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

            // Array validations
            if (!Array.isArray(task.dependencies)) {
                throw new StorageError(
                    'Invalid task data: invalid dependencies',
                    'INVALID_TASK_DATA',
                    { taskId: task.id }
                );
            }
            if (!Array.isArray(task.subtasks)) {
                throw new StorageError(
                    'Invalid task data: invalid subtasks',
                    'INVALID_TASK_DATA',
                    { taskId: task.id }
                );
            }

            // Metadata validation
            if (typeof task.metadata !== 'object' || !task.metadata) {
                throw new StorageError(
                    'Invalid task data: invalid metadata',
                    'INVALID_TASK_DATA',
                    { taskId: task.id }
                );
            }

            // Parent-child relationship validation
            if (task.parentId) {
                seenParentIds.add(task.parentId);
            }
        }

        // Validate all parent IDs exist
        for (const parentId of seenParentIds) {
            if (!parentId.startsWith('ROOT-') && !seenIds.has(parentId)) {
                throw new StorageError(
                    'Invalid task data: missing parent task',
                    'INVALID_TASK_DATA',
                    { parentId }
                );
            }
        }
    }

    /**
     * Creates a backup of task data
     */
    private async backupTasks(tasks: Task[]): Promise<void> {
        const backupDir = path.join(this.storageDir, 'backups');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(
            backupDir,
            `${this.config.sessionId}_${timestamp}.json`
        );

        try {
            const data = JSON.stringify({
                tasks,
                metadata: {
                    timestamp,
                    sessionId: this.config.sessionId,
                    checksum: this.computeChecksum(tasks)
                }
            }, null, 2);

            await fs.writeFile(backupFile, data, { mode: 0o640 });
        } catch (error) {
            console.error('Failed to create backup:', error);
            throw new StorageError(
                'Failed to create backup',
                'BACKUP_ERROR',
                error
            );
        }
    }

    /**
     * Cleans up old backup files
     */
    private async cleanupBackups(): Promise<void> {
        const backupDir = path.join(this.storageDir, 'backups');
        try {
            const files = await fs.readdir(backupDir);
            const backups = files
                .filter(f => f.startsWith(this.config.sessionId))
                .sort()
                .reverse();

            // Keep only the configured number of backups
            const toDelete = backups.slice(this.maxBackups);
            for (const file of toDelete) {
                await fs.unlink(path.join(backupDir, file));
            }
        } catch (error) {
            console.error('Failed to cleanup backups:', error);
        }
    }

    /**
     * Recovers from the latest valid backup if main storage is corrupted
     */
    async recoverFromBackup(): Promise<Task[]> {
        const backupDir = path.join(this.storageDir, 'backups');
        try {
            const files = await fs.readdir(backupDir);
            const backups = files
                .filter(f => f.startsWith(this.config.sessionId))
                .sort()
                .reverse();

            for (const backup of backups) {
                try {
                    const data = await fs.readFile(path.join(backupDir, backup), 'utf-8');
                    const { tasks, metadata } = JSON.parse(data);
                    
                    // Verify backup integrity
                    const checksum = this.computeChecksum(tasks);
                    if (checksum === metadata.checksum) {
                        // Restore from backup
                        await this.saveTasks(tasks);
                        console.log('Successfully recovered from backup:', backup);
                        return tasks;
                    }
                } catch (error) {
                    console.error('Failed to recover from backup:', backup, error);
                    continue;
                }
            }

            // If no valid backups found, initialize with empty state
            console.warn('No valid backups found, initializing empty state');
            await this.saveTasks([]);
            return [];
        } catch (error) {
            console.error('Recovery failed:', error);
            throw new StorageError(
                'Recovery failed',
                'RECOVERY_ERROR',
                error
            );
        }
    }
}
