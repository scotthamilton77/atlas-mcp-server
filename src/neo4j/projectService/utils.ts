import { logger } from "../../utils/logger.js";
import { McpError, BaseErrorCode } from "../../types/errors.js";
import { Neo4jError, CustomId } from "./types.js";
import { EntityType, EntityPrefix, isValidCustomId } from "../../utils/idGenerator.js";

// Valid status transitions map
export const validStatusTransitions: Record<string, string[]> = {
  'active': ['pending', 'completed', 'archived'],
  'pending': ['active', 'archived'],
  'completed': ['archived'],
  'archived': []
};

/**
 * Validates an ID for a specific entity type
 * @param id The ID to validate
 * @param expectedType The expected entity type
 * @throws {McpError} If the ID is invalid
 */
export const validateEntityId = (id: string, expectedType: EntityType): void => {
  if (!isValidCustomId(id, expectedType)) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Invalid ${expectedType} ID format: ${id}. Expected format: ${expectedType}_XXXXXX`
    );
  }
};

/**
 * Parses a custom ID into its components
 * @param id The custom ID to parse
 * @returns The parsed ID components
 * @throws {McpError} If the ID format is invalid
 */
export const parseCustomId = (id: string): CustomId => {
  const [type, value] = id.split('_');
  const prefix = type as keyof typeof EntityPrefix;
  if (!type || !value || !EntityPrefix[prefix]) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Invalid ID format: ${id}. Expected format: TYPE_XXXXXX`
    );
  }
  return { type: prefix, value };
};

// Type guard for Neo4j constraint errors
export const isNeo4jError = (error: unknown): error is Neo4jError =>
  error instanceof Error && 'code' in error;

// Helper to handle Neo4j errors consistently
export const handleNeo4jError = (error: unknown, context: Record<string, unknown>): never => {
  logger.error("Neo4j operation failed", { error, ...context });
  
  if (isNeo4jError(error) && error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Database constraint violation: ${error.message}`,
      context
    );
  }
  
  throw new McpError(
    BaseErrorCode.INTERNAL_ERROR,
    `Database operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    context
  );
};

// Helper to validate immutable properties
export const validateImmutableProps = (updates: Record<string, unknown>, immutableProps: string[]): void => {
  const invalidProps = immutableProps.filter(prop => prop in updates);
  if (invalidProps.length > 0) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Cannot update immutable properties: ${invalidProps.join(", ")}`
    );
  }
};