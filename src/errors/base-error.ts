import { ErrorCode, ErrorContext, ErrorSeverity } from '../types/error.js';

/**
 * Base error class for consistent error handling
 */
export class BaseError extends Error {
    public readonly code: ErrorCode;
    public readonly details?: unknown;
    private readonly context: ErrorContext;
    private userMessage?: string;

    constructor(code: ErrorCode, message: string, context: ErrorContext, details?: unknown) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.context = context;
        this.details = details;

        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, new.target.prototype);

        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Gets the severity level of the error
     */
    getSeverity(): ErrorSeverity {
        return this.context.severity;
    }

    /**
     * Gets the timestamp when the error occurred
     */
    getTimestamp(): number {
        return this.context.timestamp;
    }

    /**
     * Gets the operation where the error occurred
     */
    getOperation(): string {
        return this.context.operation;
    }

    /**
     * Gets the correlation ID if available
     */
    getCorrelationId(): string | undefined {
        return this.context.correlationId;
    }

    /**
     * Gets any metadata associated with the error
     */
    getMetadata(): Record<string, unknown> | undefined {
        return this.context.metadata;
    }

    /**
     * Sets a user-friendly message for the error
     */
    setUserMessage(message: string): void {
        this.userMessage = message;
    }

    /**
     * Gets the user-friendly message if set, otherwise returns the technical message
     */
    getUserMessage(): string {
        return this.userMessage || this.message;
    }

    /**
     * Gets the stack trace if available
     */
    getStackTrace(): string | undefined {
        return this.context.stackTrace;
    }

    /**
     * Gets the error details if available
     */
    getDetails(): unknown | undefined {
        return this.details;
    }

    /**
     * Converts the error to a JSON-serializable object
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            userMessage: this.userMessage,
            context: {
                operation: this.context.operation,
                timestamp: this.context.timestamp,
                severity: this.context.severity,
                correlationId: this.context.correlationId,
                metadata: this.context.metadata
            },
            stack: this.stack,
            details: this.details
        };
    }

    /**
     * Creates a string representation of the error
     */
    toString(): string {
        return `${this.name} [${this.code}]: ${this.message}${
            this.userMessage ? ` (${this.userMessage})` : ''
        }`;
    }
}
