import { BaseError } from './base-error.js';
import { ErrorCode, ErrorContext, ErrorSeverity } from '../types/error.js';

/**
 * Configuration-specific error class
 */
export class ConfigError extends BaseError {
    constructor(
        code: Extract<ErrorCode, 'CONFIG_MISSING' | 'CONFIG_INVALID' | 'CONFIG_TYPE' | 'CONFIG_VALIDATION' | 'CONFIG_REQUIRED'>,
        message: string,
        context: ErrorContext,
        configPath?: string
    ) {
        // Add config path to metadata if provided
        const enrichedContext: ErrorContext = {
            ...context,
            metadata: {
                ...context.metadata,
                ...(configPath && { configPath })
            }
        };

        super(code, message, enrichedContext);
        this.name = 'ConfigError';
    }

    /**
     * Gets the configuration path if available
     */
    getConfigPath(): string | undefined {
        return this.getMetadata()?.configPath as string | undefined;
    }

    /**
     * Creates a string representation of the config error
     */
    toString(): string {
        const configPath = this.getConfigPath();
        return `${this.name} [${this.code}]${configPath ? ` at ${configPath}` : ''}: ${this.message}${
            this.getUserMessage() !== this.message ? ` (${this.getUserMessage()})` : ''
        }`;
    }

    /**
     * Converts the config error to a JSON-serializable object
     */
    toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            configPath: this.getConfigPath()
        };
    }

    /**
     * Creates a missing config error
     */
    static missing(
        path: string,
        operation: string,
        userMessage?: string,
        metadata?: Record<string, unknown>
    ): ConfigError {
        const error = new ConfigError(
            'CONFIG_MISSING',
            `Missing required configuration at ${path}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.HIGH,
                metadata: {
                    ...metadata,
                    configPath: path
                }
            },
            path
        );
        if (userMessage) {
            error.setUserMessage(userMessage);
        }
        return error;
    }

    /**
     * Creates an invalid config error
     */
    static invalid(
        path: string,
        reason: string,
        operation: string,
        userMessage?: string,
        metadata?: Record<string, unknown>
    ): ConfigError {
        const error = new ConfigError(
            'CONFIG_INVALID',
            `Invalid configuration at ${path}: ${reason}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.HIGH,
                metadata: {
                    ...metadata,
                    configPath: path,
                    reason
                }
            },
            path
        );
        if (userMessage) {
            error.setUserMessage(userMessage);
        }
        return error;
    }

    /**
     * Creates a type error for config values
     */
    static type(
        path: string,
        expected: string,
        received: string,
        operation: string,
        userMessage?: string,
        metadata?: Record<string, unknown>
    ): ConfigError {
        const error = new ConfigError(
            'CONFIG_TYPE',
            `Invalid type at ${path}: expected ${expected}, received ${received}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.HIGH,
                metadata: {
                    ...metadata,
                    configPath: path,
                    expected,
                    received
                }
            },
            path
        );
        if (userMessage) {
            error.setUserMessage(userMessage);
        }
        return error;
    }

    /**
     * Creates a validation error for config values
     */
    static validation(
        path: string,
        errors: string[],
        operation: string,
        userMessage?: string,
        metadata?: Record<string, unknown>
    ): ConfigError {
        const error = new ConfigError(
            'CONFIG_VALIDATION',
            `Configuration validation failed at ${path}: ${errors.join('; ')}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.HIGH,
                metadata: {
                    ...metadata,
                    configPath: path,
                    validationErrors: errors
                }
            },
            path
        );
        if (userMessage) {
            error.setUserMessage(userMessage);
        }
        return error;
    }

    /**
     * Creates a required config error
     */
    static required(
        path: string,
        operation: string,
        userMessage?: string,
        metadata?: Record<string, unknown>
    ): ConfigError {
        const error = new ConfigError(
            'CONFIG_REQUIRED',
            `Required configuration missing at ${path}`,
            {
                operation,
                timestamp: Date.now(),
                severity: ErrorSeverity.HIGH,
                metadata: {
                    ...metadata,
                    configPath: path
                }
            },
            path
        );
        if (userMessage) {
            error.setUserMessage(userMessage);
        }
        return error;
    }
}
