import { promises as fs } from 'fs';
import { dirname } from 'path';
import { createWriteStream, WriteStream } from 'fs';
import { LogEntry, LoggerTransportConfig } from '../types/logging.js';
import { ErrorFactory } from '../errors/error-factory.js';

/**
 * Manages file-based logging with advanced features
 */
export class FileTransport {
    private writeStream?: WriteStream;
    private writeQueue: Array<{ entry: LogEntry; resolve: () => void; reject: (error: Error) => void }> = [];
    private isProcessingQueue = false;
    private lastRotateCheck = 0;
    private currentFileSize = 0;
    private readonly ROTATE_CHECK_INTERVAL = 5000; // 5 seconds

    constructor(
        private readonly config: LoggerTransportConfig['options'] & {
            filename: string; // Make filename required
            maxsize: number; // Make maxsize required
        }
    ) {}

    /**
     * Initializes the file transport
     */
    async initialize(): Promise<void> {
        try {
            // Ensure directory exists
            await fs.mkdir(dirname(this.config.filename), { recursive: true });

            // Get current file size if exists
            try {
                const stats = await fs.stat(this.config.filename);
                this.currentFileSize = stats.size;
            } catch {
                this.currentFileSize = 0;
            }

            // Create write stream
            await this.createWriteStream();
        } catch (error) {
            throw ErrorFactory.createDatabaseError(
                'FileTransport.initialize',
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }

    /**
     * Creates or recreates the write stream
     */
    private async createWriteStream(): Promise<void> {
        // Close existing stream if any
        if (this.writeStream) {
            await this.closeStream();
        }

        this.writeStream = createWriteStream(this.config.filename, { flags: 'a' });

        // Handle stream errors
        this.writeStream.on('error', (error) => {
            // Handle error through event system instead of console
            this.handleStreamError(error);
            this.handleStreamError(error);
        });

        // Update file size on write
        this.writeStream.on('finish', () => {
            this.currentFileSize = 0;
        });
    }

    /**
     * Writes a log entry to file
     */
    async write(entry: LogEntry): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // Add to queue
            this.writeQueue.push({ entry, resolve, reject });

            // Start processing if not already running
            if (!this.isProcessingQueue) {
                this.processQueue().catch(reject);
            }
        });
    }

    /**
     * Processes the write queue
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.writeQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        try {
            while (this.writeQueue.length > 0) {
                // Check if rotation needed
                await this.checkRotation();

                const { entry, resolve, reject } = this.writeQueue[0];
                
                try {
                    await this.writeEntry(entry);
                    this.writeQueue.shift(); // Remove processed entry
                    resolve();
                } catch (error) {
                    this.writeQueue.shift(); // Remove failed entry
                    reject(error instanceof Error ? error : new Error(String(error)));
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    /**
     * Writes a single log entry
     */
    private async writeEntry(entry: LogEntry): Promise<void> {
        if (!this.writeStream) {
            throw new Error('Write stream not initialized');
        }

        const line = JSON.stringify(entry) + '\n';
        const buffer = Buffer.from(line);

        return new Promise<void>((resolve, reject) => {
            if (!this.writeStream) {
                reject(new Error('Write stream not initialized'));
                return;
            }

            this.writeStream.write(buffer, (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                this.currentFileSize += buffer.length;
                resolve();
            });
        });
    }

    /**
     * Checks if log rotation is needed
     */
    private async checkRotation(): Promise<void> {
        const now = Date.now();

        // Only check periodically
        if (now - this.lastRotateCheck < this.ROTATE_CHECK_INTERVAL) {
            return;
        }

        this.lastRotateCheck = now;

        if (this.currentFileSize >= this.config.maxsize) {
            await this.rotateLog();
        }
    }

    /**
     * Rotates log files
     */
    private async rotateLog(): Promise<void> {
        if (!this.writeStream) {
            return;
        }

        // Close current stream
        await this.closeStream();

        // Rotate files
        for (let i = this.config.maxFiles || 5; i > 0; i--) {
            const fromFile = i === 1 
                ? this.config.filename 
                : `${this.config.filename}.${i - 1}`;
            const toFile = `${this.config.filename}.${i}`;

            try {
                await fs.rename(fromFile, toFile);
            } catch {
                // Ignore errors if files don't exist
            }
        }

        // Create new stream
        await this.createWriteStream();
        this.currentFileSize = 0;
    }

    /**
     * Handles stream errors
     */
    private async handleStreamError(error: Error): Promise<void> {
        // No direct console logging - handled by error event

        // Try to recreate stream
        try {
            await this.createWriteStream();
        } catch (recreateError) {
            // Error will be handled by event system
        }
    }

    /**
     * Closes the write stream
     */
    private async closeStream(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.writeStream) {
                resolve();
                return;
            }

            this.writeStream.end(() => {
                this.writeStream = undefined;
                resolve();
            });

            // Handle potential errors during close
            this.writeStream.on('error', reject);
        });
    }

    /**
     * Closes the transport
     */
    async close(): Promise<void> {
        // Process remaining entries
        if (this.writeQueue.length > 0) {
            await this.processQueue();
        }

        // Close stream
        await this.closeStream();
    }

    /**
     * Gets current transport status
     */
    async getStatus(): Promise<{
        active: boolean;
        currentFileSize: number;
        queueLength: number;
        error?: string;
    }> {
        try {
            const stats = await fs.stat(this.config.filename);
            return {
                active: !!this.writeStream,
                currentFileSize: stats.size,
                queueLength: this.writeQueue.length
            };
        } catch (error) {
            return {
                active: false,
                currentFileSize: 0,
                queueLength: this.writeQueue.length,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
