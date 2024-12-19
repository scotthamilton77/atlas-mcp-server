import { Logger } from '../../../logging/index.js';
import { ValidationError } from '../types.js';

/**
 * Base validator configuration
 */
export interface BaseValidatorConfig {
    strict: boolean;
    maxErrors: number;
    logErrors: boolean;
}

/**
 * Default validator configuration
 */
export const DEFAULT_VALIDATOR_CONFIG: BaseValidatorConfig = {
    strict: true,
    maxErrors: 100,
    logErrors: true
};

/**
 * Base validator class
 */
export abstract class BaseValidator<T, E extends ValidationError> {
    protected readonly logger: Logger;
    protected readonly config: BaseValidatorConfig;

    constructor(config: Partial<BaseValidatorConfig> = {}) {
        this.config = { ...DEFAULT_VALIDATOR_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: this.constructor.name });
    }

    /**
     * Validate value
     */
    async validate(value: T, path: string[] = []): Promise<E[]> {
        try {
            // Validate value
            const errors: E[] = [];
            await this.validateValue(value, path, errors);

            // Check max errors
            if (errors.length > this.config.maxErrors) {
                errors.length = this.config.maxErrors;
            }

            // Log errors
            if (this.config.logErrors && errors.length > 0) {
                this.logger.error('Validation errors', { errors });
            }

            return errors;
        } catch (error) {
            this.logger.error('Validation failed', { error, value });
            throw error;
        }
    }

    /**
     * Create validation error
     */
    protected createError(
        type: string,
        message: string,
        path: string[],
        value: T,
        metadata: Record<string, unknown> = {}
    ): E {
        return {
            type,
            message,
            path: [...path],
            value,
            metadata: {
                ...metadata,
                error: message
            }
        } as unknown as E;
    }

    /**
     * Validate value implementation
     */
    protected abstract validateValue(
        value: T,
        path: string[],
        errors: E[]
    ): Promise<void>;

    /**
     * Add validation error
     */
    protected addError(
        errors: E[],
        type: string,
        message: string,
        path: string[],
        value: T,
        metadata: Record<string, unknown> = {}
    ): void {
        if (errors.length >= this.config.maxErrors) {
            return;
        }

        const error = this.createError(type, message, path, value, metadata);
        errors.push(error);

        if (this.config.strict) {
            throw error;
        }
    }

    /**
     * Get validator name
     */
    getName(): string {
        return this.constructor.name;
    }

    /**
     * Get validator configuration
     */
    getConfig(): BaseValidatorConfig {
        return { ...this.config };
    }

    /**
     * Get validator statistics
     */
    getStats(): Record<string, unknown> {
        return {
            name: this.getName(),
            config: this.getConfig()
        };
    }
}
