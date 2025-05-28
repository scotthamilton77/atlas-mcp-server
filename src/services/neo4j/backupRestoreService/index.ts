/**
 * @fileoverview Main entry point for the Neo4j Backup and Restore Service.
 * This module exports the primary functions for database backup and restore operations.
 * @module src/services/neo4j/backupRestoreService/index
 */

import { _exportDatabase } from "./exportLogic.js";
import { _importDatabase } from "./importLogic.js";
import { FullExport } from "./backupRestoreTypes.js";

// Re-export types
export { FullExport } from "./backupRestoreTypes.js";

/**
 * Exports the current Neo4j database to a timestamped directory.
 * Manages backup rotation.
 * @returns {Promise<string>} Path to the backup directory.
 * @throws Error if export fails.
 */
export const exportDatabase = async (): Promise<string> => {
  return _exportDatabase();
};

/**
 * Imports data from a specified backup directory into the Neo4j database,
 * overwriting existing data.
 * @param {string} backupDirInput - Path to the backup directory.
 * @returns {Promise<void>}
 * @throws Error if import fails or backup directory is invalid.
 */
export const importDatabase = async (backupDirInput: string): Promise<void> => {
  return _importDatabase(backupDirInput);
};
