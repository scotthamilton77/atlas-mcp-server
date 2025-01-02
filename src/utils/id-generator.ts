import { randomBytes } from 'crypto';

/**
 * ID generation constants
 */
export const ID_CONSTANTS = {
  // Core constants
  LENGTH: 8, // Standard length for generated IDs
  ALPHABET: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', // Allowed characters
  PATTERN: /^[a-zA-Z0-9]{8}$/, // Regex pattern for validation

  // Additional constants for specialized ID generation
  PREFIX_SEPARATOR: '_',
  HEX_LENGTH: 16,
  TIMESTAMP_BASE: 36,
  RANDOM_LENGTH: 6,
};

/**
 * Generate a unique ID with optional prefix
 */
export function generateId(prefix?: string): string {
  const uniquePart = randomBytes(8).toString('hex');
  return prefix ? `${prefix}${ID_CONSTANTS.PREFIX_SEPARATOR}${uniquePart}` : uniquePart;
}

/**
 * Generate a timestamp-based ID with optional prefix
 */
export function generateTimestampId(prefix?: string): string {
  const timestamp = Date.now().toString(ID_CONSTANTS.TIMESTAMP_BASE);
  const random = Math.random()
    .toString(ID_CONSTANTS.TIMESTAMP_BASE)
    .substring(2, ID_CONSTANTS.RANDOM_LENGTH + 2);
  return prefix
    ? `${prefix}${ID_CONSTANTS.PREFIX_SEPARATOR}${timestamp}${ID_CONSTANTS.PREFIX_SEPARATOR}${random}`
    : `${timestamp}${ID_CONSTANTS.PREFIX_SEPARATOR}${random}`;
}

/**
 * Generate a sequential ID with optional prefix
 */
export function createSequentialIdGenerator(prefix?: string) {
  let counter = 0;
  return () => {
    counter++;
    return prefix ? `${prefix}${ID_CONSTANTS.PREFIX_SEPARATOR}${counter}` : counter.toString();
  };
}
