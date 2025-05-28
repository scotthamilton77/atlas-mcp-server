/**
 * @fileoverview Defines types related to backup and restore functionality in the Neo4j service.
 * @module src/services/neo4j/backupRestoreService/backupRestoreTypes
 */

/**
 * Interface for the full export containing all entities and their relationships in a nested structure.
 * Nodes are stored in an object keyed by their label.
 */
export interface FullExport {
  nodes: { [label: string]: Record<string, any>[] };
  relationships: {
    startNodeId: string;
    endNodeId: string;
    type: string;
    properties: Record<string, any>;
  }[];
}
