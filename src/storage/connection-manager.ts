/**
 * Database connection manager
 */
import { Logger } from '../logging/index.js';
import { ErrorCodes, createError } from '../errors/index.js';

interface ConnectionMetrics {
    totalConnections: number;
    activeConnectionCount: number;
    failedConnections: number;
    retryAttempts: number;
    busyTimeouts: number;
    lastError?: {
        message: string;
        code?: string;
        timestamp: number;
    };
    activeConnections: ConnectionState[];
}

interface ConnectionState {
    id: string;
    startTime: number;
    lastActivity: number;
    operationCount: number;
    context?: string;
}

export class ConnectionManager {
    private readonly logger: Logger;
    private readonly maxRetries: number;
    private readonly retryDelay: number;
    private readonly busyTimeout: number;
    private metrics: ConnectionMetrics = {
        totalConnections: 0,
        activeConnectionCount: 0,
        failedConnections: 0,
        retryAttempts: 0,
        busyTimeouts: 0,
        activeConnections: []
    };
    private activeConnections: Map<string, ConnectionState> = new Map();

    constructor(options: {
        maxRetries?: number;
        retryDelay?: number;
        busyTimeout?: number;
    } = {}) {
        this.logger = Logger.getInstance().child({ component: 'ConnectionManager' });
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.busyTimeout = options.busyTimeout || 5000;
    }

    /**
     * Gets current connection metrics
     */
    getMetrics(): ConnectionMetrics {
        return {
            ...this.metrics,
            activeConnectionCount: this.activeConnections.size,
            activeConnections: Array.from(this.activeConnections.values())
        };
    }

    /**
     * Tracks a new connection
     */
    private trackConnection(context?: string): string {
        const id = `conn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        this.activeConnections.set(id, {
            id,
            startTime: Date.now(),
            lastActivity: Date.now(),
            operationCount: 0,
            context
        });
        this.metrics.totalConnections++;
        this.metrics.activeConnectionCount = this.activeConnections.size;

        this.logger.debug('New connection tracked', {
            connectionId: id,
            context,
            metrics: this.getMetrics()
        });

        return id;
    }

    /**
     * Updates connection activity
     */
    private updateConnectionActivity(id: string): void {
        const conn = this.activeConnections.get(id);
        if (conn) {
            conn.lastActivity = Date.now();
            conn.operationCount++;
            this.activeConnections.set(id, conn);
        }
    }

    /**
     * Removes connection tracking
     */
    private untrackConnection(id: string): void {
        const conn = this.activeConnections.get(id);
        if (conn) {
            this.activeConnections.delete(id);
            this.metrics.activeConnectionCount = this.activeConnections.size;

            this.logger.debug('Connection untracked', {
                connectionId: id,
                duration: Date.now() - conn.startTime,
                operations: conn.operationCount,
                context: conn.context,
                metrics: this.getMetrics()
            });
        }
    }

    /**
     * Categorizes database errors for better logging
     */
    private categorizeError(error: Error): string {
        const message = error.message.toLowerCase();
        if (message.includes('busy') || message.includes('locked')) return 'BUSY';
        if (message.includes('permission')) return 'PERMISSION';
        if (message.includes('disk')) return 'DISK';
        if (message.includes('corrupt')) return 'CORRUPTION';
        if (message.includes('wal')) return 'WAL';
        return 'UNKNOWN';
    }

    /**
     * Executes a database operation with retries and connection tracking
     */
    async executeWithRetry<T>(
        operation: () => Promise<T>,
        context: string
    ): Promise<T> {
        const startTime = Date.now();
        const connectionId = this.trackConnection(context);
        let lastError: Error | undefined;
        let retryCount = 0;

        try {
            while (retryCount < this.maxRetries) {
                try {
                    this.updateConnectionActivity(connectionId);
                    const result = await operation();
                    
                    // Operation succeeded
                    if (retryCount > 0) {
                        this.logger.info(`Operation succeeded after ${retryCount} retries`, {
                            connectionId,
                            context,
                            duration: Date.now() - startTime
                        });
                    }
                    return result;
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    retryCount++;

                    // Update metrics
                    this.metrics.retryAttempts++;
                    if (retryCount === this.maxRetries) {
                        this.metrics.failedConnections++;
                    }

                    // Categorize and log error
                    const errorCategory = this.categorizeError(lastError);
                    const errorDetails = {
                        name: lastError.name,
                        message: lastError.message,
                        code: (lastError as any).code,
                        errno: (lastError as any).errno,
                        category: errorCategory
                    };

                    this.metrics.lastError = {
                        message: lastError.message,
                        code: (lastError as any).code,
                        timestamp: Date.now()
                    };

                    this.logger.warn(`Operation failed${retryCount < this.maxRetries ? ', retrying' : ''}`, {
                        connectionId,
                        attempt: retryCount,
                        maxRetries: this.maxRetries,
                        error: errorDetails,
                        context,
                        duration: Date.now() - startTime,
                        metrics: this.getMetrics()
                    });

                    // Check if error is WAL-related
                    const isWalError = lastError instanceof Error && 
                        (lastError.message.includes('WAL') || 
                         lastError.message.includes('journal_mode') ||
                         lastError.message.includes('Safety level'));

                    if (retryCount < this.maxRetries) {
                        // Longer delay for WAL-related errors
                        const baseDelay = isWalError ? 1000 : this.retryDelay;
                        const delay = Math.min(
                            baseDelay * Math.pow(2, retryCount - 1) * (0.5 + Math.random()),
                            isWalError ? 10000 : 5000 // Higher cap for WAL errors
                        );
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            // All retries failed
            throw createError(
                ErrorCodes.STORAGE_ERROR,
                'Operation failed',
                `Failed after ${this.maxRetries} retries: ${lastError?.message}`,
                lastError?.message
            );
        } finally {
            this.untrackConnection(connectionId);
        }
    }

    /**
     * Handles database busy state with metrics
     */
    async handleBusy(
        operation: () => Promise<void>,
        context: string
    ): Promise<void> {
        const startTime = Date.now();
        const connectionId = this.trackConnection(context);
        let busyCount = 0;

        try {
            while (true) {
                try {
                    this.updateConnectionActivity(connectionId);
                    await operation();
                    return;
                } catch (error) {
                    const elapsed = Date.now() - startTime;
                    if (elapsed >= this.busyTimeout) {
                        throw createError(
                            ErrorCodes.STORAGE_ERROR,
                            'Operation timed out',
                            `Timed out after ${elapsed}ms: ${error instanceof Error ? error.message : String(error)}`
                        );
                    }

                    busyCount++;
                    this.metrics.busyTimeouts++;
                    
                    this.logger.warn('Database busy, waiting...', {
                        connectionId,
                        elapsed,
                        timeout: this.busyTimeout,
                        context,
                        busyCount,
                        totalBusyTimeouts: this.metrics.busyTimeouts,
                        metrics: this.getMetrics()
                    });

                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        } finally {
            this.untrackConnection(connectionId);
        }
    }
}
