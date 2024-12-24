/**
 * Task validation module exports
 * Provides a centralized point for all task validation functionality
 */

import { z } from 'zod';
import { ValidationResult } from '../../types/index.js';

/**
 * Convert Zod validation error to ValidationResult format
 */
export function formatZodError(error: z.ZodError): ValidationResult {
    return {
        success: false,
        errors: error.errors.map(err => ({
            path: err.path.map(String),
            message: err.message,
            received: err instanceof z.ZodError ? err.code : undefined,
            expected: getExpectedValue(err)
        }))
    };
}

/**
 * Get expected value from Zod error
 */
function getExpectedValue(error: z.ZodIssue): string | undefined {
    switch (error.code) {
        case z.ZodIssueCode.invalid_type:
            return error.expected;
        case z.ZodIssueCode.invalid_enum_value:
            return error.options.join(' | ');
        case z.ZodIssueCode.too_small:
            return `${error.type === 'string' ? 'length' : 'value'} >= ${error.minimum}`;
        case z.ZodIssueCode.too_big:
            return `${error.type === 'string' ? 'length' : 'value'} <= ${error.maximum}`;
        default:
            return undefined;
    }
}

/**
 * Create a safe validator function that returns ValidationResult
 */
export function createSafeValidator<T>(schema: z.ZodType<T>) {
    return (value: unknown): ValidationResult & { value?: T } => {
        const result = schema.safeParse(value);
        if (result.success) {
            return {
                success: true,
                data: result.data
            };
        } else {
            return formatZodError(result.error);
        }
    };
}

/**
 * Create a validator function that throws on invalid input
 */
export function createValidator<T>(schema: z.ZodType<T>) {
    return (value: unknown): T => schema.parse(value);
}

/**
 * Validation error messages
 */
export const ValidationErrorMessages = {
    INVALID_INPUT: 'Invalid input provided',
    VALIDATION_FAILED: 'Validation failed',
    TYPE_ERROR: 'Type validation failed',
    CONSTRAINT_ERROR: 'Constraint validation failed',
    REQUIRED_FIELD: 'Required field is missing',
    INVALID_FORMAT: 'Invalid format',
    INVALID_VALUE: 'Invalid value provided',
    OUT_OF_RANGE: 'Value is out of allowed range',
    PATTERN_MISMATCH: 'Value does not match required pattern',
    UNIQUE_VIOLATION: 'Value must be unique',
    REFERENCE_ERROR: 'Invalid reference',
    CUSTOM_ERROR: 'Custom validation failed'
} as const;

/**
 * Validation utilities
 */
export const ValidationUtils = {
    /**
     * Check if a value is defined (not null or undefined)
     */
    isDefined: <T>(value: T | null | undefined): value is T => {
        return value !== null && value !== undefined;
    },

    /**
     * Check if a value is a non-empty string
     */
    isNonEmptyString: (value: unknown): value is string => {
        return typeof value === 'string' && value.trim().length > 0;
    },

    /**
     * Check if a value is a valid number
     */
    isValidNumber: (value: unknown): value is number => {
        return typeof value === 'number' && !isNaN(value) && isFinite(value);
    },

    /**
     * Check if a value is a valid integer
     */
    isValidInteger: (value: unknown): value is number => {
        return ValidationUtils.isValidNumber(value) && Number.isInteger(value);
    },

    /**
     * Check if a value is a valid date string
     */
    isValidDateString: (value: unknown): boolean => {
        if (typeof value !== 'string') return false;
        const date = new Date(value);
        return !isNaN(date.getTime());
    },

    /**
     * Check if a value is a valid UUID
     */
    isValidUUID: (value: unknown): boolean => {
        if (typeof value !== 'string') return false;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(value);
    },

    /**
     * Check if a value is a valid email
     */
    isValidEmail: (value: unknown): boolean => {
        if (typeof value !== 'string') return false;
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(value);
    },

    /**
     * Check if a value is a valid URL
     */
    isValidURL: (value: unknown): boolean => {
        if (typeof value !== 'string') return false;
        try {
            new URL(value);
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Check if an array contains only unique values
     */
    hasUniqueValues: <T>(array: T[]): boolean => {
        return new Set(array).size === array.length;
    },

    /**
     * Check if an object has all required properties
     */
    hasRequiredProperties: (obj: unknown, properties: string[]): boolean => {
        if (typeof obj !== 'object' || obj === null) return false;
        return properties.every(prop => prop in obj);
    }
} as const;

export {
    TaskValidator,
    isValidTaskHierarchy,
    validateTaskStatusTransition,
    detectDependencyCycle,
    validateTask,
    validateCreateTaskInput,
    validateUpdateTaskInput,
    validateTaskResponse
} from './task-validator.js';
