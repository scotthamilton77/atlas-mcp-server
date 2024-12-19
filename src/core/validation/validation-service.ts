import { Logger } from '../../logging/index.js';
import {
    ValidationContext,
    ValidationResult,
    ValidationError,
    ValidationErrorCodes,
    ValidationOptions,
    ValidationServiceConfig,
    BusinessRule,
    Validator,
    ValidationCoordinator,
    createValidationContext,
    createValidationResult,
    createValidationError,
    isValidator
} from './types.js';

/**
 * Default validation service configuration
 */
const DEFAULT_CONFIG: ValidationServiceConfig = {
    validateAll: false,
    customRules: [],
    maxErrors: 100,
    stopOnFirstError: false,
    logErrors: true,
    context: createValidationContext()
};

/**
 * Validation service class
 */
export class ValidationService implements ValidationCoordinator {
    private readonly logger: Logger;
    private readonly config: ValidationServiceConfig;
    private readonly rules: Map<string, BusinessRule<unknown, ValidationError>>;

    constructor(config: Partial<ValidationServiceConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = Logger.getInstance().child({ component: 'ValidationService' });
        this.rules = new Map();

        // Register custom rules
        this.config.customRules.forEach(rule => {
            this.rules.set(rule.getName(), rule);
        });
    }

    /**
     * Validate value
     */
    async validate<T, E extends ValidationError>(
        value: T,
        validatorOrOptions: Validator<T, E> | ValidationOptions,
        context?: ValidationContext
    ): Promise<ValidationResult<E>> {
        try {
            // Create validation context
            const validationContext = createValidationContext({
                ...context,
                path: context?.path ?? [],
                metadata: context?.metadata ?? {},
                value
            });

            // Handle validator or options
            if (isValidator<T, E>(validatorOrOptions)) {
                return this.validateWithValidator(value, validatorOrOptions, validationContext);
            } else {
                return this.validateWithOptions(value, validatorOrOptions, validationContext);
            }
        } catch (error) {
            this.logger.error('Validation failed', { error, value });
            throw createValidationError(
                ValidationErrorCodes.RUNTIME_ERROR,
                'Validation failed',
                [],
                value,
                { error: error instanceof Error ? error.message : String(error) }
            );
        }
    }

    /**
     * Validate with validator
     */
    private async validateWithValidator<T, E extends ValidationError>(
        value: T,
        validator: Validator<T, E>,
        context: ValidationContext
    ): Promise<ValidationResult<E>> {
        return validator.validate(value, context);
    }

    /**
     * Validate with options
     */
    private async validateWithOptions<T, E extends ValidationError>(
        value: T,
        options: ValidationOptions,
        context: ValidationContext
    ): Promise<ValidationResult<E>> {
        const errors: E[] = [];
        const { validateAll, customRules = [], maxErrors = this.config.maxErrors } = options;

        // Run custom rules
        for (const rule of customRules) {
            const result = await rule.validate(value, context);
            if (!result.valid) {
                errors.push(...(result.errors as E[]));
                if (!validateAll && errors.length >= maxErrors) {
                    break;
                }
            }
        }

        // Run registered rules
        for (const rule of this.rules.values()) {
            const result = await rule.validate(value, context);
            if (!result.valid) {
                errors.push(...(result.errors as E[]));
                if (!validateAll && errors.length >= maxErrors) {
                    break;
                }
            }
        }

        return createValidationResult<E>(errors, {
            validator: 'ValidationService',
            context: context
        });
    }

    /**
     * Register validation rule
     */
    registerRule<T, E extends ValidationError>(rule: BusinessRule<T, E>): void {
        this.rules.set(rule.getName(), rule as BusinessRule<unknown, ValidationError>);
    }

    /**
     * Get validation rule
     */
    getRule(name: string): BusinessRule<unknown, ValidationError> | undefined {
        return this.rules.get(name);
    }

    /**
     * Get validation service configuration
     */
    getConfig(): ValidationServiceConfig {
        return { ...this.config };
    }
}

/**
 * Create validation service instance
 */
export function createValidationService(
    config?: Partial<ValidationServiceConfig>
): ValidationService {
    return new ValidationService(config);
}
