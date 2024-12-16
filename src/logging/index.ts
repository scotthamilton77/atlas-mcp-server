/**
 * Logging module
 * Provides centralized logging functionality with structured output
 */

import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';
import path from 'path';
import { BaseError, ErrorCodes } from '../errors/index.js';

/**
 * Log levels
 */
export const LogLevels = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    FATAL: 'fatal'
} as const;

export type LogLevel = typeof LogLevels[keyof typeof LogLevels];

/**
 * Log entry interface
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
    error?: {
        name: string;
        message: string;
        code?: string;
        details?: unknown;
        stack?: string;
    };
}

/**
 * Logger configuration interface
 */
export interface LoggerConfig {
    minLevel: LogLevel;
    logDir?: string;
    console?: boolean;
    file?: boolean;
    maxFiles?: number;
    maxFileSize?: number;
}

/**
 * Logger class
 * Provides structured logging with context and error handling
 */
export class Logger {
    private static instance: Logger;
    private logger: WinstonLogger;

    private constructor(config: LoggerConfig) {
        this.logger = this.createLogger(config);
    }

    /**
     * Gets the logger instance
     */
    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger({
                minLevel: LogLevels.INFO,
                console: true
            });
        }
        return Logger.instance;
    }

    /**
     * Initializes the logger with configuration
     */
    static initialize(config: LoggerConfig): void {
        if (Logger.instance) {
            throw new BaseError(
                ErrorCodes.INVALID_STATE,
                'Logger already initialized'
            );
        }
        Logger.instance = new Logger(config);
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
     * Logs a fatal error message
     */
    fatal(message: string, error?: unknown, context?: Record<string, unknown>): void {
        const errorInfo = this.formatError(error);
        this.log(LogLevels.FATAL, message, { ...context, error: errorInfo });
    }

    /**
     * Creates the Winston logger instance
     */
    private createLogger(config: LoggerConfig): WinstonLogger {
        const loggerTransports = [];

        // Console transport
        if (config.console) {
            loggerTransports.push(
                new transports.Console({
                    format: format.combine(
                        format.colorize(),
                        format.simple()
                    )
                })
            );
        }

        // File transport
        if (config.file && config.logDir) {
            loggerTransports.push(
                new transports.File({
                    filename: path.join(config.logDir, 'error.log'),
                    level: 'error',
                    maxsize: config.maxFileSize,
                    maxFiles: config.maxFiles
                }),
                new transports.File({
                    filename: path.join(config.logDir, 'combined.log'),
                    maxsize: config.maxFileSize,
                    maxFiles: config.maxFiles
                })
            );
        }

        return createLogger({
            level: config.minLevel,
            format: format.combine(
                format.timestamp(),
                format.json()
            ),
            transports: loggerTransports
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
                stack: error.stack
            };
        }

        if (error instanceof Error) {
            return {
                name: error.name,
                message: error.message,
                stack: error.stack
            };
        }

        return {
            name: 'UnknownError',
            message: String(error)
        };
    }

    /**
     * Internal log method
     */
    private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
        this.logger.log({
            level,
            message,
            ...context
        });
    }
}

/**
 * Creates a logger instance with default configuration
 */
export function createDefaultLogger(): Logger {
    try {
        return Logger.getInstance();
    } catch (error) {
        throw new BaseError(
            ErrorCodes.STORAGE_INIT,
            'Failed to create default logger',
            error
        );
    }
}
