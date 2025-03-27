import { z } from "zod";
import { McpToolResponse } from '../../../types/mcp.js';

/**
 * Schema for database clean operation
 * This operation requires an explicit acknowledgement to prevent accidental data loss
 */
export const AtlasDatabaseCleanSchema = z.object({
  acknowledgement: z.literal(true).describe("Explicit acknowledgement to reset the entire database (must be set to TRUE)")
}).strict();

/**
 * Schema shape for tool registration
 */
export const AtlasDatabaseCleanSchemaShape = {
  acknowledgement: z.literal(true).describe("Explicit acknowledgement to reset the entire database (must be set to TRUE)")
} as const;

/**
 * Type for database clean input (empty object)
 */
export type AtlasDatabaseCleanInput = z.infer<typeof AtlasDatabaseCleanSchema>;

/**
 * Type for database clean response
 */
export interface AtlasDatabaseCleanResponse extends McpToolResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

/**
 * Type for formatted database clean response
 */
export interface FormattedDatabaseCleanResponse {
  success: boolean;
  message: string;
  timestamp: string;
  // Removed optional 'details' field as the current implementation doesn't provide these counts
}
