import { ErrorCodes, createError } from '../errors/index.js';
import { Logger } from '../logging/index.js';

/**
 * Rules for validating task paths and project names
 */
export interface PathValidationRules {
    maxDepth: number;
    maxLength: number;
    allowedCharacters: RegExp;
    projectNamePattern: RegExp;
    maxProjectNameLength: number;
}

/**
 * Result of path validation including sanitized path if valid
 */
export interface PathValidationResult {
    isValid: boolean;
    sanitizedPath?: string;
    error?: string;
}

/**
 * Validates and sanitizes task paths and project names
 * Enforces business rules for path structure and naming
 */
export class PathValidator {
    private static logger: Logger;

    private static getLogger(): Logger {
        if (!PathValidator.logger) {
            PathValidator.logger = Logger.getInstance().child({ component: 'PathValidator' });
        }
        return PathValidator.logger;
    }
    private rules: PathValidationRules;

    constructor(rules?: Partial<PathValidationRules>) {
        this.rules = {
            maxDepth: rules?.maxDepth ?? 5,
            maxLength: rules?.maxLength ?? 255,
            allowedCharacters: rules?.allowedCharacters ?? /^[a-zA-Z0-9-_/]+$/,
            projectNamePattern: rules?.projectNamePattern ?? /^[a-zA-Z][a-zA-Z0-9-_]*$/,
            maxProjectNameLength: rules?.maxProjectNameLength ?? 50
        };
    }

    /**
     * Validates a task path against all rules
     * Returns sanitized path if valid
     */
    validatePath(path: string): PathValidationResult {
        try {
            // Check for empty path
            if (!path) {
                return {
                    isValid: false,
                    error: 'Path cannot be empty'
                };
            }

            // Check for parent directory traversal
            if (path.includes('..')) {
                return {
                    isValid: false,
                    error: 'Path cannot contain parent directory traversal (..)'
                };
            }

            // Check path length
            if (path.length > this.rules.maxLength) {
                return {
                    isValid: false,
                    error: `Path length exceeds maximum of ${this.rules.maxLength} characters`
                };
            }

            // Check path depth
            const segments = path.split('/').filter(Boolean);
            if (segments.length > this.rules.maxDepth) {
                return {
                    isValid: false,
                    error: `Path depth exceeds maximum of ${this.rules.maxDepth} levels`
                };
            }

            // Validate project name (first segment)
            const projectName = segments[0];
            if (!this.validateProjectName(projectName)) {
                return {
                    isValid: false,
                    error: `Invalid project name: ${projectName}. Must match pattern ${this.rules.projectNamePattern} and be <= ${this.rules.maxProjectNameLength} characters`
                };
            }

            // Check for invalid characters
            if (!this.rules.allowedCharacters.test(path)) {
                return {
                    isValid: false,
                    error: 'Path contains invalid characters. Only alphanumeric, dash, and underscore allowed'
                };
            }

            // Sanitize path
            const sanitizedPath = this.sanitizePath(path);
            return {
                isValid: true,
                sanitizedPath
            };
        } catch (error) {
            PathValidator.getLogger().error('Path validation error', { error, path });
            throw createError(
                ErrorCodes.VALIDATION_ERROR,
                'Path validation failed',
                'validatePath',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Validates a project name against naming rules
     */
    validateProjectName(name: string): boolean {
        if (!name) return false;
        if (name.length > this.rules.maxProjectNameLength) return false;
        return this.rules.projectNamePattern.test(name);
    }

    /**
     * Sanitizes a path by normalizing slashes and removing redundant separators
     */
    private sanitizePath(path: string): string {
        // Normalize slashes
        let sanitized = path.replace(/\\/g, '/');
        
        // Remove leading/trailing slashes
        sanitized = sanitized.replace(/^\/+|\/+$/g, '');
        
        // Normalize multiple slashes
        sanitized = sanitized.replace(/\/+/g, '/');
        
        return sanitized;
    }

    /**
     * Validates a task path and its parent path together
     * Ensures parent-child relationship is valid
     */
    validateTaskPath(path: string, parentPath?: string): PathValidationResult {
        // First validate the task path
        const pathResult = this.validatePath(path);
        if (!pathResult.isValid) {
            return pathResult;
        }

        // If no parent path, task path is valid
        if (!parentPath) {
            return pathResult;
        }

        // Validate parent path
        const parentResult = this.validatePath(parentPath);
        if (!parentResult.isValid) {
            return {
                isValid: false,
                error: `Invalid parent path: ${parentResult.error}`
            };
        }

        // Ensure task is actually a child of the parent
        const sanitizedPath = pathResult.sanitizedPath!;
        const sanitizedParent = parentResult.sanitizedPath!;
        
        if (!sanitizedPath.startsWith(`${sanitizedParent}/`)) {
            return {
                isValid: false,
                error: `Task path ${sanitizedPath} is not a child of parent path ${sanitizedParent}`
            };
        }

        // Ensure only one level of nesting from parent
        const pathDepth = sanitizedPath.split('/').length;
        const parentDepth = sanitizedParent.split('/').length;
        if (pathDepth !== parentDepth + 1) {
            return {
                isValid: false,
                error: `Task must be direct child of parent. Path ${sanitizedPath} is nested too deeply under ${sanitizedParent}`
            };
        }

        return {
            isValid: true,
            sanitizedPath: pathResult.sanitizedPath
        };
    }
}
