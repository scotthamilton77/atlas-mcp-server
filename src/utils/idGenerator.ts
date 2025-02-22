import { randomBytes } from 'crypto';
import { McpError, BaseErrorCode } from '../types/errors.js';

/**
 * Valid entity types and their prefixes
 */
export const EntityPrefix = {
  PROJECT: 'PROJ',
  NOTE: 'NOTE',
  LINK: 'LINK',
  DEPENDENCY: 'DEP',
  MEMBER: 'MEMBER',
  WHITEBOARD: 'WB',
  WHITEBOARD_VERSION: 'WBV'
} as const;

export type EntityType = keyof typeof EntityPrefix;

// Reverse mapping for prefix to entity type lookup
const PrefixToEntityType = Object.entries(EntityPrefix).reduce((acc, [type, prefix]) => {
  acc[prefix] = type as EntityType;
  acc[prefix.toLowerCase()] = type as EntityType;
  return acc;
}, {} as Record<string, EntityType>);

/**
 * Generates a cryptographically secure random alphanumeric string of specified length
 * @param length The length of the random string to generate
 * @returns Random alphanumeric string
 */
const generateRandomString = (length: number): string => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(length);
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  
  return result;
};

/**
 * Generates a custom ID for an entity with format PREFIX_XXXXXX
 * @param entityType The type of entity to generate an ID for
 * @returns A unique identifier string (e.g., "PROJ_A6B3J0")
 */
export const generateCustomId = (entityType: EntityType): string => {
  const prefix = EntityPrefix[entityType];
  const randomPart = generateRandomString(6);
  return `${prefix}_${randomPart}`;
};

/**
 * Validates if a given ID matches the expected format for an entity type
 * @param id The ID to validate
 * @param entityType The expected entity type
 * @returns boolean indicating if the ID is valid
 */
export const isValidCustomId = (id: string, entityType: EntityType): boolean => {
  const prefix = EntityPrefix[entityType];
  const pattern = new RegExp(`^${prefix}_[A-Z0-9]{6}$`);
  return pattern.test(id);
};

/**
 * Strips the prefix from a custom ID
 * @param id The custom ID to strip
 * @returns The ID without the prefix
 */
export const stripCustomIdPrefix = (id: string): string => {
  return id.split('_')[1] || id;
};

/**
 * Determines the entity type from an ID
 * @param id The ID to get the entity type for
 * @returns The entity type
 * @throws {McpError} If the ID format is invalid or entity type is unknown
 */
export const getEntityType = (id: string): EntityType => {
  const parts = id.split('_');
  if (parts.length !== 2 || !parts[0]) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Invalid ID format: ${id}. Expected format: TYPE_XXXXXX`
    );
  }

  const prefix = parts[0];
  const entityType = PrefixToEntityType[prefix];
  
  if (!entityType) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Unknown entity type prefix: ${prefix}`
    );
  }

  return entityType;
};

/**
 * Normalizes an entity ID to ensure consistent uppercase format
 * @param id The ID to normalize
 * @returns The normalized ID in uppercase format
 */
export const normalizeEntityId = (id: string): string => {
  const entityType = getEntityType(id);
  const idParts = id.split('_');
  return `${EntityPrefix[entityType]}_${idParts[1].toUpperCase()}`;
};