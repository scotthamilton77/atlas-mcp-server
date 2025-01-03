/**
 * Unified validation constants for the entire system
 */
export const ValidationConstants = {
  path: {
    maxLength: 255,
    maxDepth: 7,
    maxSegmentLength: 50,
    patterns: {
      segment: /^[a-zA-Z][a-zA-Z0-9-_]*$/,
      allowed: /^[a-zA-Z0-9-_/]+$/,
    },
  },
  metadata: {
    maxSize: 32768, // 32KB
    maxStringLength: 1000,
    maxArrayItems: 100,
    maxNotes: 25,
  },
  task: {
    maxDependencies: 50,
    maxTags: 10,
    nameMaxLength: 200,
    descriptionMaxLength: 2000,
  },
  security: {
    maxMetadataSize: 32768,
    maxFieldLength: 10000,
    dangerousPatterns: ['script', 'eval', 'function', 'constructor'],
  },
} as const;

/**
 * Validation modes for different contexts
 */
export enum ValidationMode {
  STRICT = 'STRICT',
  LENIENT = 'LENIENT',
  REPAIR = 'REPAIR',
}

/**
 * Standard validation result interface
 */
export interface ValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
  metadata?: {
    validationTime?: number;
    mode?: ValidationMode;
    securityIssues?: string[];
  };
}
