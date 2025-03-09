#!/usr/bin/env node

/**
 * Neo4j Database Export/Import CLI Tool
 * 
 * This script provides command line access to export and import functionality 
 * for the Neo4j database used by the Atlas MCP Server.
 * 
 * Usage:
 *   npm run db:export               - Export database to default timestamped file
 *   npm run db:export -- --file=path/to/file.json - Export to specific file
 *   npm run db:import -- --file=path/to/file.json - Import from file
 *   npm run db:list                 - List available exports
 */

import { program } from 'commander';
import path from 'path';
import { 
  exportDatabase, 
  importDatabase, 
  listDatabaseExports 
} from '../src/neo4j/exportImport.js';
import { logger } from '../src/utils/logger.js';
import { closeDriver } from '../src/neo4j/driver.js';

// Configure the CLI
program
  .name('db-export-import')
  .description('Neo4j database export and import tools for Atlas MCP Server')
  .version('1.0.0');

// Export command
program
  .command('export')
  .description('Export the Neo4j database to a JSON file')
  .option('-f, --file <path>', 'Custom file path for the export')
  .action(async (options) => {
    try {
      const filePath = options.file ? path.resolve(options.file) : undefined;
      const result = await exportDatabase({ filePath });
      console.log('Export completed successfully:');
      console.log(`  File: ${result.filePath}`);
      console.log(`  Nodes: ${result.nodeCount}`);
      console.log(`  Relationships: ${result.relationshipCount}`);
      console.log(`  Time: ${result.exportTime}ms`);
    } catch (error) {
      console.error('Export failed:', error);
      process.exit(1);
    } finally {
      await closeDriver();
    }
  });

// Import command
program
  .command('import')
  .description('Import a Neo4j database from a JSON file')
  .requiredOption('-f, --file <path>', 'Path to the export file to import')
  .option('--no-clear', 'Do not clear the database before import')
  .action(async (options) => {
    try {
      const filePath = path.resolve(options.file);
      const result = await importDatabase({ 
        filePath, 
        clearDatabase: options.clear !== false 
      });
      
      console.log('Import completed successfully:');
      console.log(`  Nodes: ${result.nodeCount}`);
      console.log(`  Relationships: ${result.relationshipCount}`);
      console.log(`  Time: ${result.importTime}ms`);
    } catch (error) {
      console.error('Import failed:', error);
      process.exit(1);
    } finally {
      await closeDriver();
    }
  });

// List exports command
program
  .command('list')
  .description('List available database exports')
  .action(async () => {
    try {
      const exports = await listDatabaseExports();
      
      if (exports.length === 0) {
        console.log('No database exports found.');
        return;
      }
      
      console.log('Available database exports:');
      console.log('--------------------------');
      
      exports.forEach((exp, index) => {
        const { filename, path, size, createdAt, metadata } = exp;
        console.log(`${index + 1}. ${filename}`);
        console.log(`   Path: ${path}`);
        console.log(`   Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Created: ${createdAt.toLocaleString()}`);
        
        if (metadata) {
          console.log(`   Nodes: ${metadata.nodeCount || 'unknown'}`);
          console.log(`   Relationships: ${metadata.relationshipCount || 'unknown'}`);
        }
        
        console.log('');
      });
    } catch (error) {
      console.error('Failed to list exports:', error);
      process.exit(1);
    } finally {
      await closeDriver();
    }
  });

// Parse command line arguments
program.parse();

// If no arguments, show help
if (process.argv.length <= 2) {
  program.help();
}