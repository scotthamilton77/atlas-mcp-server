#!/usr/bin/env node
import { importDatabase } from '../src/services/neo4j/backupRestoreService.js';
import { closeNeo4jConnection } from '../src/services/neo4j/index.js';
import { logger } from '../src/utils/logger.js';
import { existsSync, lstatSync } from 'fs';
import path from 'path';

/**
 * Validates the provided backup directory path.
 * @param backupDir Path to the backup directory.
 * @returns True if valid, false otherwise.
 */
const isValidBackupDir = (backupDir: string): boolean => {
  if (!existsSync(backupDir) || !lstatSync(backupDir).isDirectory()) {
    logger.error(`Invalid backup directory: Path does not exist or is not a directory: ${backupDir}`);
    return false;
  }

  // Check for expected JSON files (optional, but good practice)
  const expectedFiles = ['projects.json', 'tasks.json', 'knowledge.json'];
  for (const file of expectedFiles) {
    const filePath = path.join(backupDir, file);
    if (!existsSync(filePath)) {
      // Log a warning but don't necessarily fail, maybe some are empty
      logger.warn(`Expected backup file not found: ${filePath}. Import might be incomplete.`);
    }
  }
  return true;
};

/**
 * Manual import script entry point.
 */
const runManualImport = async () => {
  const args = process.argv.slice(2); // Get command line arguments, excluding node and script path

  if (args.length !== 1) {
    logger.error('Usage: npm run db:import <path_to_backup_directory>');
    process.exit(1);
  }

  const backupDir = path.resolve(args[0]); // Resolve to absolute path

  logger.info(`Starting manual database import from: ${backupDir}`);
  logger.warn('!!! THIS WILL OVERWRITE ALL EXISTING DATA IN THE DATABASE !!!');

  if (!isValidBackupDir(backupDir)) {
    process.exit(1);
  }

  try {
    await importDatabase(backupDir);
    logger.info(`Manual import from ${backupDir} completed successfully.`);
    // Removed the warning about relationships not being restored.
  } catch (error) {
    logger.error('Manual database import failed:', { error });
    process.exitCode = 1; // Indicate failure
  } finally {
    // Ensure the Neo4j connection is closed after the script runs
    logger.info('Closing Neo4j connection...');
    await closeNeo4jConnection();
    logger.info('Neo4j connection closed.');
  }
};

// Execute the import process
runManualImport();
