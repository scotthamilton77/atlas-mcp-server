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

/**
 * Convert an object into a proper Neo4j parameters object
 * Handles serialization of complex objects
 * @param obj The object to convert
 * @returns A Neo4j-compatible parameter object
 */
export function toNeo4jParams(obj: Record<string, any>): Record<string, any> {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    // Handle arrays, objects, and other complex types
    if (value !== null && typeof value === 'object') {
      acc[key] = JSON.parse(JSON.stringify(value));
    } else {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);
}

/**
 * Build a Neo4j update query dynamically based on provided fields
 * @param nodeLabel Neo4j node label
 * @param identifier Node identifier in the query
 * @param updates Updates to apply
 * @returns Object with setClauses and params
 */
export function buildUpdateQuery(
  nodeLabel: string,
  identifier: string,
  updates: Record<string, any>
): { setClauses: string[]; params: Record<string, any> } {
  const params: Record<string, any> = {};
  const setClauses: string[] = [];
  
  // Add update timestamp
  const now = new Date().toISOString();
  params.updatedAt = now;
  setClauses.push(`${identifier}.updatedAt = $updatedAt`);
  
  // Add update clauses for each provided field
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      params[key] = value;
      setClauses.push(`${identifier}.${key} = $${key}`);
    }
  }
  
  return { setClauses, params };
}
