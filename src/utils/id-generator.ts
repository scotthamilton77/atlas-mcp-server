/**
 * ID Generator Utility
 * Generates short, unique identifiers for tasks, sessions, and other entities
 * 
 * Using 8 characters from a 62-character alphabet (a-z, A-Z, 0-9) gives:
 * - 62^8 = 218,340,105,584,896 possible combinations
 * - Collision probability of ~0.1% after 13.5 million IDs (birthday problem)
 * - At 1000 IDs/second, would take ~6.9 years to have a 1% collision probability
 */

import { customAlphabet } from 'nanoid';

// Constants
const ID_LENGTH = 8;
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Sequence counters for readable IDs
let sessionCounter = 1;
let taskCounter = 1;

// Create ID generator with specified alphabet and length
const generateId = customAlphabet(ALPHABET, ID_LENGTH);

/**
 * Generates a readable session ID
 * Format: session-XXX where XXX is a sequential number
 */
export function generateSessionId(): string {
    const id = `session-${sessionCounter.toString().padStart(3, '0')}`;
    sessionCounter++;
    return id;
}

/**
 * Generates a readable task ID
 * Format: task-XXX where XXX is a sequential number
 */
export function generateTaskId(): string {
    const id = `task-${taskCounter.toString().padStart(3, '0')}`;
    taskCounter++;
    return id;
}

/**
 * Generates a short, unique identifier (for other entities)
 * Format: 8 characters using [0-9A-Za-z]
 * Example: "xK7cPq2Z"
 */
export function generateShortId(): string {
    return generateId();
}

/**
 * Validates if a string matches any of the valid ID formats
 */
export function isValidShortId(value: string): boolean {
    if (!value) return false;
    return new RegExp(`^[${ALPHABET}]{${ID_LENGTH}}$`).test(value);
}

/**
 * Generates a deterministic ID for testing/development
 * @param prefix - Optional 2-character prefix
 * @param sequence - Sequence number (0-999999)
 */
export function generateTestId(prefix = 'ts', sequence = 0): string {
    const seq = sequence.toString().padStart(6, '0');
    return `${prefix}${seq}`.slice(0, ID_LENGTH);
}

// Export constants for use in validation schemas
export const ID_CONSTANTS = {
    LENGTH: ID_LENGTH,
    ALPHABET,
    PATTERN: new RegExp(`^[${ALPHABET}]{${ID_LENGTH}}$`)
} as const;
