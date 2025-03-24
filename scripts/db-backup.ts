#!/usr/bin/env node

/**
 * Database Backup Script
 * =====================
 * 
 * Description:
 *   A utility script to create a manual backup of the Neo4j database.
 *   This script triggers the backupManager to export all data and store it in the atlas-backups directory.
 * 
 * Usage:
 *   - Run directly: npm run db:backup
 *   - Can be run with options:
 *     - --no-metadata: Skip metadata in the backup (npm run db:backup -- --no-metadata)
 *     - --compression=N: Set compression level (0-9) (npm run db:backup -- --compression=9)
 * 
 * Platform compatibility:
 *   - Works on all platforms (Windows, macOS, Linux) using Node.js
 */

import { backupManager } from '../src/services/neo4j/backup_services/backupManager.js';
import { neo4jDriver } from '../src/services/neo4j/driver.js';
import { logger } from '../src/utils/logger.js';

/**
 * Parse command line arguments
 */
function parseArgs(): { includeMetadata: boolean; compressionLevel?: number } {
  const args = process.argv.slice(2);
  const options = {
    includeMetadata: true,
    compressionLevel: undefined as number | undefined
  };

  for (const arg of args) {
    if (arg === '--no-metadata') {
      options.includeMetadata = false;
    } else if (arg.startsWith('--compression=')) {
      const level = Number(arg.split('=')[1]);
      if (!isNaN(level) && level >= 0 && level <= 9) {
        options.compressionLevel = level;
      } else {
        console.warn('Invalid compression level. Using default compression.');
      }
    }
  }

  return options;
}

/**
 * Main backup function
 */
const runBackup = async (): Promise<void> => {
  try {
    // Parse command line arguments
    const options = parseArgs();
    
    console.log('Starting manual database backup...');
    console.log(`Options: includeMetadata=${options.includeMetadata}, compressionLevel=${options.compressionLevel ?? 'default'}`);
    
    // Run the backup
    const backupFilePath = await backupManager.createManualBackup({
      includeMetadata: options.includeMetadata,
      compressionLevel: options.compressionLevel
    });
    
    console.log(`✓ Backup successfully created: ${backupFilePath}`);
    
    // List all backups to show available backup files
    const allBackups = await backupManager.listAllBackups();
    
    console.log('\nAvailable backups:');
    allBackups.forEach((backup, index) => {
      const sizeInMB = (backup.size / (1024 * 1024)).toFixed(2);
      const date = backup.created.toLocaleString();
      console.log(`${index + 1}. ${backup.filename} (${sizeInMB} MB) - Created: ${date}`);
    });
    
  } catch (error) {
    logger.error('Error creating database backup', { error });
    console.error(`× Error creating backup: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    // Close the database connection to ensure the process exits cleanly
    try {
      console.log('Closing database connection...');
      await neo4jDriver.close();
      console.log('Database connection closed successfully');
    } catch (closeError) {
      console.error('Error closing database connection:', closeError);
    }
  }
};

// Execute the backup function
runBackup();
