/**
 * Common type definitions
 */

/**
 * Validation result interface
 */
export interface ValidationResult<T = unknown> {
    /** Whether validation succeeded */
    success: boolean;
    /** Validated data if successful */
    data?: T;
    /** Validation errors if failed */
    errors?: Array<{
        /** Field path */
        path: string[];
        /** Error message */
        message: string;
        /** Received value */
        received?: unknown;
        /** Expected type/value */
        expected?: string;
    }>;
}

/**
 * Utility type for making all properties optional recursively
 */
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Utility type for making all properties required recursively
 */
export type DeepRequired<T> = {
    [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/**
 * Utility type for making all properties readonly recursively
 */
export type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Utility type for extracting keys of type from object
 */
export type KeysOfType<T, U> = {
    [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Utility type for omitting properties by type
 */
export type OmitByType<T, U> = {
    [K in keyof T as T[K] extends U ? never : K]: T[K];
};

/**
 * Utility type for picking properties by type
 */
export type PickByType<T, U> = {
    [K in keyof T as T[K] extends U ? K : never]: T[K];
};

/**
 * Utility type for making properties mutable
 */
export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};

/**
 * Utility type for making properties immutable
 */
export type Immutable<T> = {
    readonly [P in keyof T]: T[P];
};

/**
 * Utility type for type predicate functions
 */
export type TypePredicate = (value: unknown) => boolean;

/**
 * Utility type for async functions
 */
export type AsyncFunction<T = void> = () => Promise<T>;

/**
 * Utility type for constructor functions
 */
export type Constructor<T = object> = new (...args: any[]) => T;

/**
 * Utility type for function parameters
 */
export type Parameters<T extends (...args: any[]) => any> = T extends (...args: infer P) => any ? P : never;

/**
 * Utility type for function return type
 */
export type ReturnType<T extends (...args: any[]) => any> = T extends (...args: any[]) => infer R ? R : never;

/**
 * Utility type for promise value type
 */
export type PromiseType<T extends Promise<any>> = T extends Promise<infer U> ? U : never;

/**
 * Utility type for array element type
 */
export type ArrayElement<T extends readonly any[]> = T extends readonly (infer U)[] ? U : never;

/**
 * Utility type for object values
 */
export type ObjectValues<T> = T[keyof T];

/**
 * Utility type for object keys
 */
export type ObjectKeys<T> = keyof T;

/**
 * Utility type for non-undefined values
 */
export type NonUndefined<T> = T extends undefined ? never : T;

/**
 * Utility type for non-null values
 */
export type NonNull<T> = T extends null ? never : T;

/**
 * Utility type for non-nullable values
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Utility type for required keys
 */
export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * Utility type for optional keys
 */
export type OptionalKeys<T> = {
    [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];
