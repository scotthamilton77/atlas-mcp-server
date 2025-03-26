import { randomUUID } from 'crypto';

/**
 * Helper functions for the Neo4j service
 */

/**
 * Generate a unique ID string
 * @returns A unique string ID (without hyphens)
 */
export function generateId(): string {
  return randomUUID().replace(/-/g, '');
}

/**
 * Generate a timestamped ID with an optional prefix
 * @param prefix Optional prefix for the ID
 * @returns A unique ID with timestamp and random component
 */
export function generateTimestampedId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

// Removed unused toNeo4jParams function

/**
 * Build a Neo4j update query dynamically based on provided fields
 * @param nodeLabel Neo4j node label
 * @param identifier Node identifier in the query (e.g., 'n')
 * @param updates Updates to apply
 * @returns Object with setClauses and params
 */
export function buildUpdateQuery(
  nodeLabel: string, // Keep nodeLabel for potential future use or context
  identifier: string,
  updates: Record<string, any>
): { setClauses: string[]; params: Record<string, any> } {
  const params: Record<string, any> = {};
  const setClauses: string[] = [];
  
  // Add update timestamp automatically
  const now = new Date().toISOString();
  params.updatedAt = now;
  setClauses.push(`${identifier}.updatedAt = $updatedAt`);
  
  // Add update clauses for each provided field in the updates object
  for (const [key, value] of Object.entries(updates)) {
    // Ensure we don't try to overwrite the id or createdAt
    if (key !== 'id' && key !== 'createdAt' && value !== undefined) {
      params[key] = value;
      setClauses.push(`${identifier}.${key} = $${key}`);
    }
  }
  
  return { setClauses, params };
}
