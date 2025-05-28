/**
 * @fileoverview Defines types related to search functionality in the Neo4j service.
 * @module src/services/neo4j/searchService/searchTypes
 */

/**
 * Type for search result items - Made generic
 */
export type SearchResultItem = {
  id: string;
  type: string; // Node label
  entityType?: string; // Optional: Specific classification (e.g., taskType, domain)
  title: string; // Best guess title (name, title, truncated text)
  description?: string; // Optional: Full description or text
  matchedProperty: string;
  matchedValue: string; // Potentially truncated
  createdAt?: string; // Optional
  updatedAt?: string; // Optional
  projectId?: string; // Optional
  projectName?: string; // Optional
  score: number;
};
