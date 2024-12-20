/**
 * Storage module for Atlas MCP Server
 * Handles task persistence, session management, and file operations
 */
import { Task } from '../types/task.js';
import { randomUUID, createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

export interface StorageConfig {
    baseDir: string;
    sessionId: string;
    maxRetries?: number;
    retryDelay?: number;
    maxBackups?: number;
    useSqlite?: boolean; // Whether to use SQLite storage (default: false)
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
 * Storage statistics interface
 */
export interface StorageStats {
    size: number;       // Total size in bytes
    tasks: number;      // Number of tasks
    notes?: number;     // Number of notes (optional)
    backups?: number;   // Number of backups (optional)
}

/**
 * Interface for storage implementations
 */
export interface StorageManager {
    // Core operations
    initialize(): Promise<void>;
    saveTasks(tasks: Task[]): Promise<void>;
    loadTasks(): Promise<Task[]>;
    getTasksByStatus(status: string): Promise<Task[]>;
    getSubtasks(parentId: string): Promise<Task[]>;
    close(): Promise<void>;
    maintenance(): Promise<void>;

    // Optional operations
    estimate?(): Promise<StorageStats>;
    getDirectory?(): Promise<string>;
    persist?(): Promise<boolean>;
    persisted?(): Promise<boolean>;
}

// Export storage implementations
export { SqliteStorageManager } from './sqlite-storage.js';

/**
 * Lock manager for concurrent operations
 */
interface QueuedLockRequest {
    resolve: (release: () => void) => void;
    reject: (error: Error) => void;
    timestamp: number;
    priority: number;
}

class LockManager {
    private locks: Map<string, Promise<void>> = new Map();
    private lockQueues: Map<string, QueuedLockRequest[]> = new Map();
    private timeoutHandles: Map<string, ReturnType<typeof globalThis.setTimeout>> = new Map();
    private readonly LOCK_TIMEOUT = 30000; // 30 seconds
    private readonly QUEUE_TIMEOUT = 60000; // 60 seconds queue wait timeout
    private readonly MAX_QUEUE_LENGTH = 100; // Maximum number of queued requests per lock

    /**
     * Acquires a lock with priority-based queueing and timeout
     */
    async acquireLock(key: string, priority: number = 0): Promise<() => void> {
        // Clear any existing timeout
        if (this.timeoutHandles.has(key)) {
            const existingTimeout = this.timeoutHandles.get(key);
            if (existingTimeout) {
                globalThis.clearTimeout(existingTimeout);
            }
            this.timeoutHandles.delete(key);
        }

        // If lock is held, add to queue
        if (this.locks.has(key)) {
            return this.queueLockRequest(key, priority);
        }

        return this.createLock(key);
    }

    /**
     * Creates a new lock with timeout
     */
    private createLock(key: string): Promise<() => void> {
        let releaseLock: () => void;
        const lockPromise = new Promise<void>((resolve, reject) => {
            releaseLock = () => {
                this.locks.delete(key);
                const timeoutHandle = this.timeoutHandles.get(key);
                if (timeoutHandle) {
                    globalThis.clearTimeout(timeoutHandle);
                    this.timeoutHandles.delete(key);
                }
                
                // Process next queued request if any
                this.processNextQueuedRequest(key);
                
                resolve();
            };

            // Set timeout to automatically release lock
            const timeoutHandle = globalThis.setTimeout(() => {
                this.locks.delete(key);
                this.timeoutHandles.delete(key);
                
                // Process next queued request on timeout
                this.processNextQueuedRequest(key);
                
                reject(new Error('Lock timeout'));
            }, this.LOCK_TIMEOUT);

            this.timeoutHandles.set(key, timeoutHandle);
        });

        this.locks.set(key, lockPromise);
        return Promise.resolve(releaseLock!);
    }

    /**
     * Queues a lock request with priority
     */
    private queueLockRequest(key: string, priority: number): Promise<() => void> {
        return new Promise((resolve, reject) => {
            // Initialize queue if it doesn't exist
            if (!this.lockQueues.has(key)) {
                this.lockQueues.set(key, []);
            }

            const queue = this.lockQueues.get(key)!;

            // Check queue length limit
            if (queue.length >= this.MAX_QUEUE_LENGTH) {
                reject(new Error('Lock queue full'));
                return;
            }

            // Add request to queue with priority
            const request: QueuedLockRequest = {
                resolve,
                reject,
                timestamp: Date.now(),
                priority
            };

            // Insert maintaining priority order (higher priority first)
            const insertIndex = queue.findIndex(r => r.priority < priority);
            if (insertIndex === -1) {
                queue.push(request);
            } else {
                queue.splice(insertIndex, 0, request);
            }

            // Set timeout for queued request
            globalThis.setTimeout(() => {
                const index = queue.indexOf(request);
                if (index !== -1) {
                    queue.splice(index, 1);
                    reject(new Error('Queue wait timeout'));
                }
            }, this.QUEUE_TIMEOUT);
        });
    }

    /**
     * Processes the next queued request for a lock
     */
    private processNextQueuedRequest(key: string): void {
        const queue = this.lockQueues.get(key);
        if (!queue || queue.length === 0) {
            this.lockQueues.delete(key);
            return;
        }

        const request = queue.shift()!;
        this.createLock(key).then(request.resolve).catch(request.reject);
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
export class BaseStorageManager implements StorageManager {
    // ... existing code ...

    async getTasksByStatus(status: string): Promise<Task[]> {
        const tasks = await this.loadTasks();
        return tasks.filter(task => task.status === status);
    }

    async getSubtasks(parentId: string): Promise<Task[]> {
        const tasks = await this.loadTasks();
        return tasks.filter(task => task.parentId === parentId);
    }

    async close(): Promise<void> {
        // No-op for file-based storage
    }

    async maintenance(): Promise<void> {
        // Clean up old backups
        await this.cleanupBackups();
    }
    private storageDir: string;
    private sessionFile: string;
    private lockManager: LockManager;
    private transactionManager: TransactionManager;
    private maxRetries: number;
    private retryDelay: number;
    private maxBackups: number;

    async estimate(): Promise<StorageStats> {
        const stats = await fs.stat(this.sessionFile);
        const data = await fs.readFile(this.sessionFile, 'utf-8');
        const { tasks } = JSON.parse(data);
        return {
            size: stats.size,
            tasks: tasks.length
        };
    }

    async getDirectory(): Promise<string> {
        return this.storageDir;
    }

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
                // Create base directory first
                await fs.mkdir(this.config.baseDir, { recursive: true, mode: 0o750 });
                
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
            await sleep(this.retryDelay * Math.pow(2, retryCount));
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
