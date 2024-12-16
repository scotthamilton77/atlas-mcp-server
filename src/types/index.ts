/**
 * Central type definitions export
 * Provides a single point of access for all type definitions
 */

// Re-export all types
export * from './task.js';
export * from './error.js';
export * from './config.js';
export * from './logging.js';

// Additional type utilities and helpers

/**
 * Deep partial type
 * Makes all properties of T optional recursively
 */
export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;

/**
 * Readonly deep type
 * Makes all properties of T readonly recursively
 */
export type DeepReadonly<T> = T extends object ? {
    readonly [P in keyof T]: DeepReadonly<T[P]>;
} : T;

/**
 * Required deep type
 * Makes all properties of T required recursively
 */
export type DeepRequired<T> = T extends object ? {
    [P in keyof T]-?: DeepRequired<T[P]>;
} : T;

/**
 * Mutable deep type
 * Removes readonly from all properties recursively
 */
export type DeepMutable<T> = T extends object ? {
    -readonly [P in keyof T]: DeepMutable<T[P]>;
} : T;

/**
 * NonNullable deep type
 * Removes null and undefined from all properties recursively
 */
export type DeepNonNullable<T> = T extends object ? {
    [P in keyof T]: DeepNonNullable<NonNullable<T[P]>>;
} : NonNullable<T>;

/**
 * Async function type helper
 */
export type AsyncFunction<T = void> = () => Promise<T>;

/**
 * Async method type helper
 */
export type AsyncMethod<T = void, Args extends any[] = any[]> = (...args: Args) => Promise<T>;

/**
 * Constructor type helper
 */
export type Constructor<T = {}, Args extends any[] = any[]> = new (...args: Args) => T;

/**
 * Primitive type helper
 */
export type Primitive = string | number | boolean | null | undefined;

/**
 * JSON value type helper
 */
export type JsonValue = Primitive | JsonArray | JsonObject;
export interface JsonArray extends Array<JsonValue> {}
export interface JsonObject extends Record<string, JsonValue> {}

/**
 * Validation result type
 */
export interface ValidationResult {
    valid: boolean;
    errors?: {
        path: string;
        message: string;
        value?: unknown;
    }[];
}

/**
 * Type guard helper
 */
export type TypeGuard<T> = (value: unknown) => value is T;

/**
 * Type predicate helper
 */
export type TypePredicate<T> = (value: unknown) => boolean;

/**
 * Validator type
 */
export type Validator<T> = (value: unknown) => ValidationResult & { value: T };

/**
 * Transform function type
 */
export type Transform<T, U> = (value: T) => U;

/**
 * Error handler type
 */
export type ErrorHandler<T = unknown> = (error: T) => void;

/**
 * Middleware type
 */
export type Middleware<T = unknown, U = unknown> = (
    context: T,
    next: () => Promise<U>
) => Promise<U>;

/**
 * Plugin type
 */
export type Plugin<T = unknown> = {
    name: string;
    version: string;
    install: (context: T) => Promise<void> | void;
};

/**
 * Record with required keys
 */
export type RequiredRecord<K extends keyof any, T> = {
    [P in K]: T;
};

/**
 * Awaited type helper (for pre-TypeScript 4.5)
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Function parameters type helper
 */
export type Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;

/**
 * Function return type helper
 */
export type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : never;

/**
 * Instance type helper
 */
export type InstanceType<T extends new (...args: any) => any> = T extends new (...args: any) => infer R ? R : never;

/**
 * Mutable keys of type
 */
export type MutableKeys<T> = {
    [P in keyof T]: Equal<{ -readonly [K in P]: T[K] }, { [K in P]: T[K] }> extends true ? P : never;
}[keyof T];

/**
 * Equal type helper
 */
type Equal<X, Y> =
    (<T>() => T extends X ? 1 : 2) extends
    (<T>() => T extends Y ? 1 : 2) ? true : false;
