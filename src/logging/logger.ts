import { promises as fs } from 'fs';
import {
  LogLevel,
  LoggerConfig,
  LogEntry,
  LogLevels,
  ITransportManager,
} from '../types/logging.js';
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
  private transportManager: ITransportManager | undefined;
  private eventManager?: EventManager;
  private readonly component?: string;

  private constructor(
    private readonly config: LoggerConfig,
    private readonly context: Record<string, unknown> = {}
  ) {
    // Don't initialize event manager in constructor to avoid circular dependency
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

      Logger.instance = logger;
      return logger;
    } catch (error) {
      // Log error to console during initialization
      console.error('Failed to initialize logger:', ErrorFormatter.summarize(error));
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
      ...context,
    });
  }

  /**
   * Initializes transport manager
   */
  private async initializeTransports(): Promise<void> {
    try {
      const transports: Record<string, any> = {};

      // Console transport disabled - all output must go to files for MCP

      // Configure file transport
      if (this.config.file && this.config.logDir) {
        // Ensure log directory exists with proper permissions
        await fs.mkdir(this.config.logDir, { recursive: true, mode: 0o755 });

        transports.file = {
          type: 'file',
          options: {
            filename: `${this.config.logDir}/combined.log`,
            maxsize: this.config.maxFileSize || 5 * 1024 * 1024,
            maxFiles: this.config.maxFiles || 5,
            minLevel: this.config.minLevel || LogLevels.DEBUG, // Default to debug
          },
        };

        // Separate error log file
        transports.errorFile = {
          type: 'file',
          options: {
            filename: `${this.config.logDir}/error.log`,
            maxsize: this.config.maxFileSize || 5 * 1024 * 1024,
            maxFiles: this.config.maxFiles || 5,
            minLevel: LogLevels.ERROR, // Error log always gets errors regardless of config
          },
        };

        // Verify files are writable
        await Promise.all([
          fs.access(`${this.config.logDir}/combined.log`, fs.constants.W_OK).catch(() => {}),
          fs.access(`${this.config.logDir}/error.log`, fs.constants.W_OK).catch(() => {}),
        ]);
      }

      // Only create transport manager if we have transports configured
      if (Object.keys(transports).length > 0) {
        // Initialize transport manager with failover
        const manager: ITransportManager = new TransportManager(transports, {
          enableFailover: true,
          failoverPath: this.config.logDir ? `${this.config.logDir}/failover.log` : undefined,
          healthChecks: true,
        });

        // Wait for transport manager to initialize
        await manager.initialize();

        // Only set the transport manager after successful initialization
        this.transportManager = manager;
      }
    } catch (error) {
      // Error will be handled by error event system
      if (this.eventManager) {
        this.eventManager.emitSystemEvent({
          type: EventTypes.SYSTEM_ERROR,
          timestamp: Date.now(),
          metadata: {
            error: ErrorFormatter.format(error),
            component: 'Logger',
            operation: 'initializeTransports',
          },
        });
      }
      // Don't throw - fall back to console logging
    }
  }

  /**
   * Logs a message at the specified level
   */
  private async log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): Promise<void> {
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
        ...context,
      },
    };

    try {
      // Try transport manager first if available
      const manager = this.transportManager;
      if (manager) {
        try {
          await manager.write(entry);
          return;
        } catch (error) {
          // Transport failed, emit error and attempt recovery
          if (this.eventManager) {
            this.eventManager.emitSystemEvent({
              type: EventTypes.SYSTEM_ERROR,
              timestamp: Date.now(),
              metadata: {
                error: ErrorFormatter.format(error),
                component: 'Logger',
                operation: 'write',
              },
            });
          }

          // Attempt to reinitialize transports
          await this.initializeTransports();

          // Retry write after recovery
          const recoveredManager = this.transportManager;
          if (recoveredManager) {
            await recoveredManager.write(entry);
            return;
          }
        }
      } else {
        // No transport manager, attempt to initialize
        await this.initializeTransports();
        const newManager = this.transportManager;
        if (newManager) {
          await newManager.write(entry);
          return;
        }
      }

      // If all else fails, write to failover log directly
      if (this.config.logDir) {
        const failoverPath = `${this.config.logDir}/failover.log`;
        await fs.appendFile(failoverPath, JSON.stringify(entry) + '\n');
      }
    } catch (error) {
      // Even critical failures should not log to console
      // They will be handled by the error event system
      if (this.eventManager) {
        this.eventManager.emitSystemEvent({
          type: EventTypes.SYSTEM_ERROR,
          timestamp: Date.now(),
          metadata: {
            error: ErrorFormatter.format(error),
            component: 'Logger',
            operation: 'log',
          },
        });
      }
    }
  }

  /**
   * Checks if a log level should be recorded
   */
  private shouldLog(level: LogLevel): boolean {
    // Map log levels to numeric values (higher = more severe)
    const levelValues: Record<LogLevel, number> = {
      [LogLevels.ERROR]: 50,
      [LogLevels.WARN]: 40,
      [LogLevels.INFO]: 30,
      [LogLevels.HTTP]: 20,
      [LogLevels.DEBUG]: 10,
      [LogLevels.VERBOSE]: 5,
      [LogLevels.SILLY]: 1,
    };

    const configLevel = this.config.minLevel || LogLevels.DEBUG;
    const minLevelValue = levelValues[configLevel] || levelValues[LogLevels.DEBUG];
    const currentLevelValue = levelValues[level];

    // Log if current level is equal or more severe than min level
    return currentLevelValue >= minLevelValue;
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
   * Logs an error message with enhanced error formatting
   */
  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    const formattedError = error ? ErrorFormatter.format(error) : undefined;
    this.log(LogLevels.ERROR, message, {
      ...context,
      error: formattedError,
    });
  }

  /**
   * Logs a fatal error (maps to error level)
   */
  fatal(message: string, error?: unknown, context?: Record<string, unknown>): void {
    const formattedError = error ? ErrorFormatter.format(error, { includeStack: true }) : undefined;
    this.log(LogLevels.ERROR, `FATAL: ${message}`, {
      ...context,
      error: formattedError,
      fatal: true,
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
