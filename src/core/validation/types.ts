/**
 * Base validation error interface
 */
export interface ValidationError {
    type: string;
    message: string;
    path: string[];
    value: unknown;
    metadata: Record<string, unknown>;
}

/**
 * Task validation error interface
 */
export interface TaskValidationError extends ValidationError {
    value: {
        id?: string;
        [key: string]: unknown;
    };
    metadata: {
        error: string;
        field?: string;
        expected?: unknown;
        actual?: unknown;
        [key: string]: unknown;
    };
}

/**
 * Validation result interface
 */
export interface ValidationResult<E extends ValidationError> {
    valid: boolean;
    success: boolean;
    errors: E[];
    error?: E;
    metadata: {
        duration: number;
        timestamp: string;
        validator: string;
        context?: Record<string, unknown>;
    };
}

/**
 * Base validation context interface
 */
export interface BaseValidationContext {
    path: string[];
    metadata: Record<string, unknown>;
}

/**
 * Extended validation context interface
 */
export interface ValidationContext extends BaseValidationContext {
    operation?: string;
    shared?: Map<string, unknown>;
    results?: Map<string, ValidationResult<ValidationError>>;
    value?: unknown;
    taskStore?: {
        getTask(id: string): Promise<any>;
    };
}

/**
 * Create validation context
 */
export function createValidationContext(
    partial: Partial<ValidationContext> = {}
): ValidationContext {
    return {
        path: partial.path ?? [],
        metadata: partial.metadata ?? {},
        operation: partial.operation,
        shared: partial.shared,
        results: partial.results,
        value: partial.value
    };
}

/**
 * Validation options interface
 */
export interface ValidationOptions {
    validateAll?: boolean;
    customRules?: BusinessRule<unknown, ValidationError>[];
    maxErrors?: number;
    stopOnFirstError?: boolean;
    logErrors?: boolean;
    context?: ValidationContext;
}

/**
 * Validation service configuration
 */
export interface ValidationServiceConfig extends Required<Omit<ValidationOptions, 'context'>> {
    validateAll: boolean;
    customRules: BusinessRule<unknown, ValidationError>[];
    maxErrors: number;
    stopOnFirstError: boolean;
    logErrors: boolean;
    context?: ValidationContext;
}

/**
 * Business rule interface
 */
export interface BusinessRule<T, E extends ValidationError> {
    validate(value: T, context: ValidationContext): Promise<ValidationResult<E>>;
    getName(): string;
}

/**
 * Abstract business rule class
 */
export abstract class AbstractBusinessRule<T, E extends ValidationError> implements BusinessRule<T, E> {
    abstract validate(value: T, context: ValidationContext): Promise<ValidationResult<E>>;
    getName(): string {
        return this.constructor.name;
    }

    protected createError(
        type: string,
        message: string,
        path: string[],
        value: T,
        metadata: Record<string, unknown> = {}
    ): E {
        return createValidationError<E>(type, message, path, value, metadata);
    }
}

/**
 * Validator interface
 */
export interface Validator<T, E extends ValidationError> {
    validate(value: T, context?: ValidationContext): Promise<ValidationResult<E>>;
    getName(): string;
}

/**
 * Validation coordinator interface
 */
/**
 * Runtime validator interface
 */
export interface RuntimeValidator {
    validate(
        context: ValidationContext,
        data: unknown,
        options?: ValidationOptions
    ): Promise<ValidationResult<ValidationError>>;
    addChecker(checker: RuntimeChecker): void;
    removeChecker(checkerId: string): void;
    getChecker(checkerId: string): RuntimeChecker | undefined;
}

/**
 * Runtime checker interface
 */
export interface RuntimeChecker {
    id: string;
    name: string;
    description: string;
    check(
        context: ValidationContext,
        data: unknown,
        options?: ValidationOptions
    ): Promise<ValidationResult<ValidationError>>;
}

/**
 * Validation rule interface
 */
export interface ValidationRule {
    name: string;
    dependencies?: string[];
    validate(value: unknown, context: ValidationContext): Promise<ValidationResult<ValidationError>>;
}

export interface ValidationCoordinator {
    validate<T, E extends ValidationError>(
        value: T,
        validatorOrOptions: Validator<T, E> | ValidationOptions,
        context?: ValidationContext
    ): Promise<ValidationResult<E>>;
}

/**
 * Validation operations enum
 */
export enum ValidationOperations {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    VALIDATE = 'validate'
}

/**
 * Validation error codes
 */
export enum ValidationErrorCodes {
    INVALID_VALUE = 'INVALID_VALUE',
    MISSING_FIELD = 'MISSING_FIELD',
    TYPE_ERROR = 'TYPE_ERROR',
    FORMAT_ERROR = 'FORMAT_ERROR',
    CONSTRAINT_ERROR = 'CONSTRAINT_ERROR',
    DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
    RELATIONSHIP_ERROR = 'RELATIONSHIP_ERROR',
    STATUS_ERROR = 'STATUS_ERROR',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    RUNTIME_ERROR = 'RUNTIME_ERROR',
    BUSINESS_RULE_ERROR = 'BUSINESS_RULE_ERROR',
    INVALID_REFERENCE = 'INVALID_REFERENCE',
    INVALID_STATE = 'INVALID_STATE'
}

/**
 * Default service configuration
 */
export const DEFAULT_SERVICE_CONFIG: ValidationServiceConfig = {
    validateAll: false,
    customRules: [],
    maxErrors: 100,
    stopOnFirstError: false,
    logErrors: true,
    context: createValidationContext()
};

/**
 * Create validation error
 */
export function createValidationError<E extends ValidationError>(
    type: string,
    message: string,
    path: string[],
    value: unknown,
    metadata: Record<string, unknown> = {}
): E {
    const error: ValidationError = {
        type,
        message,
        path: [...path],
        value,
        metadata: {
            ...metadata,
            error: message
        }
    };
    return error as unknown as E;
}

/**
 * Create validation result
 */
export function createValidationResult<E extends ValidationError>(
    errors: E[],
    metadata: Record<string, unknown> = {}
): ValidationResult<E> {
    const valid = errors.length === 0;
    return {
        valid,
        success: valid,
        errors,
        error: errors[0],
        metadata: {
            duration: metadata.duration as number || 0,
            timestamp: new Date().toISOString(),
            validator: metadata.validator as string || 'unknown',
            context: metadata.context as Record<string, unknown> | undefined,
            ...metadata
        }
    };
}

/**
 * Create valid result
 */
export function createValidResult<E extends ValidationError>(
    metadata: Record<string, unknown> = {}
): ValidationResult<E> {
    return createValidationResult<E>([], metadata);
}

/**
 * Create invalid result
 */
export function createInvalidResult<E extends ValidationError>(
    error: E,
    metadata: Record<string, unknown> = {}
): ValidationResult<E> {
    return createValidationResult<E>([error], metadata);
}

/**
 * Type guard for validation error
 */
export function isValidationError(error: unknown): error is ValidationError {
    return (
        typeof error === 'object' &&
        error !== null &&
        'type' in error &&
        'message' in error &&
        'path' in error &&
        'value' in error &&
        'metadata' in error
    );
}

/**
 * Type guard for validation result
 */
export function isValidationResult<E extends ValidationError>(
    result: unknown
): result is ValidationResult<E> {
    return (
        typeof result === 'object' &&
        result !== null &&
        'valid' in result &&
        'success' in result &&
        'errors' in result &&
        'metadata' in result
    );
}

/**
 * Type guard for validation options
 */
export function isValidationOptions(options: unknown): options is ValidationOptions {
    return (
        typeof options === 'object' &&
        options !== null &&
        Object.keys(options).every(key =>
            ['validateAll', 'customRules', 'maxErrors', 'stopOnFirstError', 'logErrors', 'context'].includes(key)
        )
    );
}

/**
 * Type guard for validator
 */
export function isValidator<T, E extends ValidationError>(value: unknown): value is Validator<T, E> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'validate' in value &&
        'getName' in value &&
        typeof (value as Validator<T, E>).validate === 'function' &&
        typeof (value as Validator<T, E>).getName === 'function'
    );
}
