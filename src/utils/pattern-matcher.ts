import { sep, posix } from 'path';

/**
 * Pattern matching utilities for task paths with cross-platform support
 */

/**
 * Normalizes path separators to forward slashes for consistent pattern matching
 */
function normalizePath(path: string): string {
    return path.split(sep).join(posix.sep);
}

/**
 * Converts a glob pattern to a regular expression with platform-agnostic path handling
 * Supports:
 * - * for single level matching
 * - ** for recursive matching
 * - ? for single character matching
 */
export function globToRegex(pattern: string): RegExp {
    // Normalize path separators first
    const normalizedPattern = normalizePath(pattern);
    
    const escapedPattern = normalizedPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
        .replace(/\*\*/g, '{{RECURSIVE}}') // Temp placeholder for **
        .replace(/\*/g, `[^${posix.sep}]+`) // * matches anything except path separator
        .replace(/\?/g, '.') // ? matches single char
        .replace(/{{RECURSIVE}}/g, '.*'); // ** matches anything including path separator

    return new RegExp(`^${escapedPattern}$`);
}

/**
 * Converts a glob pattern to an SQL LIKE/GLOB pattern with platform-agnostic path handling
 */
export function globToSqlPattern(pattern: string): string {
    // Normalize path separators first
    const normalizedPattern = normalizePath(pattern);
    
    return normalizedPattern
        .replace(/\*\*/g, '%') // ** for recursive match
        .replace(/\*/g, '%') // * for single level match
        .replace(/\?/g, '_'); // ? for single character
}

/**
 * Generates all possible glob patterns for a given path with platform-agnostic handling
 * Example: "a/b/c" generates:
 * - "a/b/c"
 * - "a/b/*"
 * - "a/*\/c"
 * - "a/**"
 * - "*\/b/c"
 * - etc.
 */
export function generatePathPatterns(path: string): string[] {
    // Normalize path separators first
    const normalizedPath = normalizePath(path);
    const segments = normalizedPath.split(posix.sep);
    const patterns: Set<string> = new Set();

    // Add exact path
    patterns.add(normalizedPath);

    // Add single wildcard patterns
    for (let i = 0; i < segments.length; i++) {
        const pattern = [
            ...segments.slice(0, i),
            '*',
            ...segments.slice(i + 1)
        ].join(posix.sep);
        patterns.add(pattern);
    }

    // Add recursive patterns
    for (let i = 0; i < segments.length - 1; i++) {
        const pattern = [...segments.slice(0, i), '**'].join(posix.sep);
        patterns.add(pattern);
    }

    // Add combinations of * and **
    for (let i = 0; i < segments.length - 1; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            const pattern = [
                ...segments.slice(0, i),
                '*',
                ...segments.slice(i + 1, j),
                '**'
            ].join(posix.sep);
            patterns.add(pattern);
        }
    }

    return Array.from(patterns);
}

/**
 * Tests if a path matches a glob pattern with platform-agnostic path handling
 */
export function matchesPattern(path: string, pattern: string): boolean {
    // Normalize both path and pattern before matching
    return globToRegex(pattern).test(normalizePath(path));
}
