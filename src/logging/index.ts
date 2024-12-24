/**
 * Logging module
 * Provides centralized logging functionality with structured output
 */

import { createLogger, format, transports, Logger as WinstonLogger, config as winstonConfig } from 'winston';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { BaseError, ErrorCodes } from '../errors/index.js';
import { LogLevel, LogLevels, LoggerConfig } from '../types/logging.js';

/**
 * Logger class
 * Provides structured logging with context and error handling
 */
export class Logger {
    private static instance: Logger;
    private logger: WinstonLogger;

    private config: LoggerConfig;
    private isShuttingDown = false;

    private constructor(config: LoggerConfig) {
        this.config = config;
        this.logger = this.createLogger(config);
        
        // Handle process events
        process.on('SIGINT', () => this.handleShutdown());
        process.on('SIGTERM', () => this.handleShutdown());
        process.on('exit', () => this.handleShutdown());
    }

    /**
     * Handle graceful shutdown
     */
    private handleShutdown(): void {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        // Close transports
        this.logger.close();
    }

    /**
     * Recreate logger if needed
     */
    private lastHealthCheck = 0;
    private readonly HEALTH_CHECK_INTERVAL = 5000; // 5 seconds

    private ensureLogger(): void {
        if (this.isShuttingDown) return;

        const now = Date.now();
        // Only check every 5 seconds to reduce memory pressure
        if (now - this.lastHealthCheck < this.HEALTH_CHECK_INTERVAL) {
            return;
        }
        
        try {
            // Test if logger is working
            this.logger.log({
                level: 'debug',
                message: 'Logger health check'
            });
            this.lastHealthCheck = now;
        } catch (error) {
            const err = error as Error;
            if (err?.message?.includes('EPIPE')) {
                // Recreate logger with same config
                this.logger = this.createLogger(this.config);
                this.lastHealthCheck = now;
            }
        }
    }

    /**
     * Gets the logger instance
     */
    private static initializationPromise: Promise<Logger> | null = null;

    static getInstance(): Logger {
        if (!Logger.instance) {
            throw new BaseError({
                code: ErrorCodes.INVALID_STATE,
                message: 'Logger not initialized. Call Logger.initialize() first.'
            });
        }
        return Logger.instance;
    }

    /**
     * Initializes the logger with configuration
     */
    static async initialize(config: LoggerConfig): Promise<Logger> {
        // Return existing instance if available
        if (Logger.instance) {
            return Logger.instance;
        }

        // If initialization is in progress, wait for it
        if (Logger.initializationPromise) {
            return Logger.initializationPromise;
        }

        // Start new initialization with mutex
        Logger.initializationPromise = (async () => {
            try {
                // Double-check instance hasn't been created while waiting
                if (Logger.instance) {
                    return Logger.instance;
                }

                Logger.instance = new Logger(config);
                return Logger.instance;
            } catch (error) {
                throw new BaseError({
                    code: ErrorCodes.STORAGE_INIT,
                    message: 'Failed to initialize logger',
                    details: { error: error instanceof Error ? error.message : String(error) }
                });
            } finally {
                Logger.initializationPromise = null;
            }
        })();

        return Logger.initializationPromise;
    }

    /**
     * Creates a child logger with additional context
     */
    child(context: Record<string, unknown>): Logger {
        const childLogger = new Logger({
            minLevel: LogLevels.INFO,
            console: true
        });
        childLogger.logger = this.logger.child(context);
        return childLogger;
    }

    /**
     * Logs a debug message
     */
    debug(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevels.DEBUG, message, context);
    }

    /**
     * Logs an info message
     */
    info(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevels.INFO, message, context);
    }

    /**
     * Logs a warning message
     */
    warn(message: string, context?: Record<string, unknown>): void {
        this.log(LogLevels.WARN, message, context);
    }

    /**
     * Logs an error message
     */
    error(message: string, error?: unknown, context?: Record<string, unknown>): void {
        const errorInfo = this.formatError(error);
        this.log(LogLevels.ERROR, message, { ...context, error: errorInfo });
    }

    /**
     * Logs a fatal error message (maps to error level for Winston compatibility)
     */
    fatal(message: string, error?: unknown, context?: Record<string, unknown>): void {
        const errorInfo = this.formatError(error);
        this.log(LogLevels.ERROR, message, { ...context, error: errorInfo });
    }

    /**
     * Creates the Winston logger instance
     */
    private createLogger(config: LoggerConfig): WinstonLogger {
        const loggerTransports = [];

        // Console transport
        if (config.console) {
            const formats = [format.simple()];
            if (!config.noColors) {
                formats.unshift(format.colorize());
            }
            loggerTransports.push(
                new transports.Console({
                    format: format.combine(...formats)
                })
            );
        }

        // File transport
        if (config.file && config.logDir) {
            // Ensure log directory exists with platform-appropriate permissions
            mkdirSync(config.logDir, { 
                recursive: true, 
                // Skip mode on Windows as it's ignored
                ...(process.platform !== 'win32' && { mode: 0o755 })
            });

            const errorLogPath = join(config.logDir, 'error.log');
            const combinedLogPath = join(config.logDir, 'combined.log');

            loggerTransports.push(
                new transports.File({
                    filename: errorLogPath,
                    level: LogLevels.ERROR,
                    maxsize: config.maxFileSize,
                    maxFiles: config.maxFiles,
                    tailable: true // Ensure logs can be read while being written
                }),
                new transports.File({
                    filename: combinedLogPath,
                    maxsize: config.maxFileSize,
                    maxFiles: config.maxFiles,
                    tailable: true
                })
            );
        }

        return createLogger({
            level: config.minLevel,
            format: format.combine(
                format.timestamp(),
                format.json()
            ),
            transports: loggerTransports,
            levels: winstonConfig.npm.levels // Use standard npm levels
        });
    }

    /**
     * Formats an error for logging
     */
    private formatError(error: unknown): Record<string, unknown> | undefined {
        if (!error) return undefined;

        if (error instanceof BaseError) {
            return {
                name: error.name,
                message: error.message,
                code: error.code,
                details: error.details,
                stack: error.stack,
                operation: error.operation,
                timestamp: Date.now()
            };
        }

        if (error instanceof Error) {
            return {
                name: error.name,
                message: error.message,
                stack: error.stack,
                timestamp: Date.now()
            };
        }

        if (error && typeof error === 'object') {
            try {
                return {
                    name: 'ObjectError',
                    message: JSON.stringify(error, null, 2),
                    raw: error,
                    timestamp: Date.now()
                };
            } catch (e) {
                return {
                    name: 'UnserializableError',
                    message: 'Error object could not be stringified',
                    type: typeof error,
                    timestamp: Date.now()
                };
            }
        }

        return {
            name: 'UnknownError',
            message: String(error),
            type: typeof error,
            timestamp: Date.now()
        };
    }

    /**
     * Internal log method
     */
    private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
        if (this.isShuttingDown) return;

        try {
            // Ensure logger is working
            this.ensureLogger();

            // Ensure context is properly stringified
            const safeContext = context ? this.sanitizeContext(context) : undefined;
            
            this.logger.log({
                level,
                message,
                timestamp: Date.now(),
                ...safeContext
            });
        } catch (error) {
            // If logging fails, write to stderr as fallback
            const fallbackMessage = JSON.stringify({
                level,
                message,
                timestamp: Date.now(),
                error: this.formatError(error)
            });
            process.stderr.write(fallbackMessage + '\n');
        }
    }

    /**
     * Sanitizes context objects for logging
     */
    private sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
        const sanitized: Record<string, unknown> = {};
        
        for (const [key, value] of Object.entries(context)) {
            if (value instanceof Error || (value && typeof value === 'object')) {
                sanitized[key] = this.formatError(value);
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }
}

/**
 * Creates a logger instance with default configuration
 */
export function createDefaultLogger(): Logger {
    try {
        return Logger.getInstance();
    } catch (error) {
        throw new BaseError({
            code: ErrorCodes.STORAGE_INIT,
            message: 'Failed to create default logger',
            details: { error: error instanceof Error ? error.message : String(error) }
        });
    }
}

/**
 * Re-export types
 */
export type { LogLevel, LoggerConfig } from '../types/logging.js';
export { LogLevels } from '../types/logging.js';
