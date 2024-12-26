import { LogLevel, LoggerConfig, LogEntry } from '../types/logging.js';
import { TransportManager } from './transport-manager.js';
import { ErrorFormatter } from './error-formatter.js';
import { EventManager } from '../events/event-manager.js';
import { EventTypes } from '../types/events.js';
import { ErrorFactory } from '../errors/error-factory.js';

/**
 * Enhanced logger with advanced error handling and transport management
 */
export class Logger {
    private static instance: Logger;
    private transportManager?: TransportManager;
    private eventManager?: EventManager;
    private readonly component?: string;

    private constructor(
        private readonly config: LoggerConfig,
        private readonly context: Record<string, unknown> = {}
    ) {
        // Initialize event manager from config if provided
        if (config.eventManager) {
            this.eventManager = config.eventManager;
        }
    }

    /**
     * Initializes the logger instance
     */
    static async initialize(config: LoggerConfig): Promise<Logger> {
        if (Logger.instance) {
            return Logger.instance;
        }

        const logger = new Logger(config);

        try {
            // Initialize transports first
            await logger.initializeTransports();
            
            // Set event manager in transport manager if both are available
            if (logger.eventManager && logger.transportManager) {
                logger.transportManager.setEventManager(logger.eventManager);
            }
            
            Logger.instance = logger;
            return logger;
        } catch (error) {
            console.error('Failed to initialize logger:', error);
            // Still set instance but in console-only mode
            Logger.instance = logger;
            return logger;
        }
    }

    /**
     * Gets the logger instance
     */
    static getInstance(): Logger {
        if (!Logger.instance) {
            throw ErrorFactory.createDatabaseError(
                'Logger.getInstance',
                new Error('Logger not initialized. Call Logger.initialize() first.')
            );
        }
        return Logger.instance;
    }

    /**
     * Updates the event manager after initialization
     */
    setEventManager(eventManager: EventManager): void {
        this.eventManager = eventManager;
        if (this.transportManager) {
            this.transportManager.setEventManager(eventManager);
        }
    }

    /**
     * Creates a child logger with additional context
     */
    child(context: Record<string, unknown>): Logger {
        return new Logger(this.config, {
            ...this.context,
            ...context
        });
    }

    /**
     * Initializes transport manager
     */
    private async initializeTransports(): Promise<void> {
        try {
            const transports: Record<string, any> = {};

            // Configure console transport
            if (this.config.console) {
                transports.console = {
                    type: 'console',
                    options: {
                        colors: !this.config.noColors,
                        format: 'pretty'
                    }
                };
            }

            // Configure file transport
            if (this.config.file && this.config.logDir) {
                transports.file = {
                    type: 'file',
                    options: {
                        filename: `${this.config.logDir}/combined.log`,
                        maxsize: this.config.maxFileSize || 5 * 1024 * 1024,
                        maxFiles: this.config.maxFiles || 5
                    }
                };

                // Separate error log file
                transports.errorFile = {
                    type: 'file',
                    options: {
                        filename: `${this.config.logDir}/error.log`,
                        maxsize: this.config.maxFileSize || 5 * 1024 * 1024,
                        maxFiles: this.config.maxFiles || 5
                    }
                };
            }

            // Only create transport manager if we have transports configured
            if (Object.keys(transports).length > 0) {
                // Initialize transport manager with failover
                const manager = new TransportManager(transports, {
                    enableFailover: true,
                    failoverPath: this.config.logDir ? `${this.config.logDir}/failover.log` : undefined,
                    healthChecks: true
                });

                // Wait for transport manager to initialize
                await manager.initialize();

                // Only set the transport manager after successful initialization
                this.transportManager = manager;
            } else {
                console.warn('No logging transports configured, using console-only mode');
            }
        } catch (error) {
            console.error('Failed to initialize logging transports:', error);
            // Don't throw - fall back to console logging
        }
    }

    /**
     * Logs a message at the specified level
     */
    private async log(level: LogLevel, message: string, context?: Record<string, unknown>): Promise<void> {
        // Skip if below minimum level
        if (!this.shouldLog(level)) {
            return;
        }

        const entry: LogEntry = {
            level,
            message,
            timestamp: Date.now(),
            correlationId: context?.correlationId as string,
            component: this.component,
            context: {
                ...this.context,
                ...context
            }
        };

        try {
            // Try transport manager first if available
            if (this.transportManager) {
                try {
                    await this.transportManager.write(entry);
                    return;
                } catch (error) {
                    // Transport failed, emit error and fall back to console
                    if (this.eventManager) {
                        this.eventManager.emitSystemEvent({
                            type: EventTypes.SYSTEM_ERROR,
                            timestamp: Date.now(),
                            metadata: {
                                error: error instanceof Error ? error : new Error(String(error)),
                                component: 'Logger',
                                operation: 'write'
                            }
                        });
                    }
                }
            }

            // Fallback to console logging
            const timestamp = new Date(entry.timestamp).toISOString();
            const contextStr = context ? ` ${JSON.stringify(context)}` : '';
            console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`);
        } catch (error) {
            // Last resort error logging
            console.error('Critical logging failure:', error);
            console.error('Original entry:', entry);
        }
    }

    /**
     * Checks if a log level should be recorded
     */
    private shouldLog(level: LogLevel): boolean {
        const levels = {
            error: 0,
            warn: 1,
            info: 2,
            http: 3,
            debug: 4,
            verbose: 5,
            silly: 6
        };

        // Convert level names to lowercase for comparison
        const normalizedLevel = level.toLowerCase() as keyof typeof levels;
        const normalizedMinLevel = (this.config.minLevel || 'info').toLowerCase() as keyof typeof levels;

        return levels[normalizedLevel] <= levels[normalizedMinLevel];
    }

    /**
     * Logs a debug message
     */
    debug(message: string, context?: Record<string, unknown>): void {
        this.log('debug', message, context);
    }

    /**
     * Logs an info message
     */
    info(message: string, context?: Record<string, unknown>): void {
        this.log('info', message, context);
    }

    /**
     * Logs a warning message
     */
    warn(message: string, context?: Record<string, unknown>): void {
        this.log('warn', message, context);
    }

    /**
     * Logs an error message with enhanced error formatting
     */
    error(message: string, error?: unknown, context?: Record<string, unknown>): void {
        const formattedError = error ? ErrorFormatter.format(error) : undefined;
        this.log('error', message, {
            ...context,
            error: formattedError
        });
    }

    /**
     * Logs a fatal error (maps to error level)
     */
    fatal(message: string, error?: unknown, context?: Record<string, unknown>): void {
        const formattedError = error ? ErrorFormatter.format(error, { includeStack: true }) : undefined;
        this.log('error', `FATAL: ${message}`, {
            ...context,
            error: formattedError,
            fatal: true
        });
    }

    /**
     * Closes the logger and its transports
     */
    async close(): Promise<void> {
        if (this.transportManager) {
            await this.transportManager.close();
            this.transportManager = undefined;
        }
    }
}
