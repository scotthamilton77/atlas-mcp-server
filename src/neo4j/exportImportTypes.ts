/**
 * Types for database export and import functionality
 */

// Node representation in the export format
export interface ExportedNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

// Relationship representation in the export format
export interface ExportedRelationship {
  id: string;
  startNode: string;
  endNode: string;
  type: string;
  properties: Record<string, any>;
}

// Complete database export format
export interface Neo4jExport {
  metadata: {
    version: string;
    exportDate: string;
    nodeCount: number;
    relationshipCount: number;
  };
  nodes: ExportedNode[];
  relationships: ExportedRelationship[];
}

// Export options
export interface ExportOptions {
  filePath?: string; // Custom file path, otherwise will use default timestamped path
}

// Import options
export interface ImportOptions {
  filePath: string; // Path to the import file
  clearDatabase?: boolean; // Whether to clear the database before import (default: true)
}

// Export result
export interface ExportResult {
  filePath: string;
  nodeCount: number;
  relationshipCount: number;
  exportTime: number; // milliseconds
}

// Import result
export interface ImportResult {
  nodeCount: number;
  relationshipCount: number;
  importTime: number; // milliseconds
  success: boolean;
}