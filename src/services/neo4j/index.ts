/**
 * Neo4j Services Module
 * 
 * This module exports all Neo4j database services to provide a unified API for interacting
 * with the Neo4j graph database. It encapsulates the complexity of Neo4j queries and
 * transactions, providing a clean interface for application code.
 */

// Export core database driver and utilities
export { autoExportManager } from './backup_services/autoExportManager.js';
export { neo4jDriver } from './driver.js';
export { databaseEvents, DatabaseEventType } from './events.js';
export * from './helpers.js';
export { Neo4jUtils } from './utils.js';

// Export entity services
export { backupManager, BackupManager } from './backup_services/backupManager.js';
export { backupMonitor, BackupMonitor } from './backup_services/backupMonitor.js';
export { exportService, ExportService } from './backup_services/exportService.js';
export { importService, ImportService } from './backup_services/importService.js';
export { resilientConnection, ResilientConnection } from './backup_services/resilientConnection.js';
export { KnowledgeService } from './knowledgeService.js';
export { ProjectService } from './projectService.js';
export { SearchService } from './searchService.js';
export type { SearchResultItem } from './searchService.js';
export { TaskService } from './taskService.js';

// Export common types
export * from './types.js';

/**
 * Initialize the Neo4j database and related services
 * Should be called at application startup
 */
export async function initializeNeo4jServices(): Promise<void> {
  try {
    // Step 1: Initialize schema
    await initializeNeo4jSchema();
    
    // Step 2: Initialize services in the correct order to avoid circular dependencies
    const { exportService } = await import('./backup_services/exportService.js');
    const { importService } = await import('./backup_services/importService.js');
    const { autoExportManager } = await import('./backup_services/autoExportManager.js');
    const { backupManager } = await import('./backup_services/backupManager.js');
    const { backupMonitor } = await import('./backup_services/backupMonitor.js');
    
    // Initialize in correct order
    exportService.initialize();
    importService.initialize();
    
    // Connect autoExportManager with exportService
    autoExportManager.initializeWithExportService(exportService);
    
    // Initialize backupManager 
    backupManager.initialize();
    
    // Initialize backup monitor last since it depends on all other services
    backupMonitor.initialize();
    
    console.log('Neo4j services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Neo4j services', error);
    throw error;
  }
}

/**
 * Initialize the Neo4j database schema
 * Should be called at application startup
 */
export async function initializeNeo4jSchema(): Promise<void> {
  const { Neo4jUtils } = await import('./utils.js');
  return Neo4jUtils.initializeSchema();
}

/**
 * Restore the Neo4j database from the latest backup
 */
export async function restoreFromLatestBackup(forceRestore: boolean = false): Promise<{
  success: boolean;
  message: string;
  backupUsed?: string;
}> {
  const { backupManager } = await import('./backup_services/backupManager.js');
  return backupManager.initializeFromLatestBackup(forceRestore);
}

/**
 * Create a manual backup of the Neo4j database
 */
export async function createManualBackup(): Promise<string> {
  const { backupManager } = await import('./backup_services/backupManager.js');
  return backupManager.createManualBackup();
}

/**
 * Clear and reset the Neo4j database
 * WARNING: This permanently deletes all data
 */
export async function clearNeo4jDatabase(): Promise<void> {
  const { Neo4jUtils } = await import('./utils.js');
  return Neo4jUtils.clearDatabase();
}

/**
 * Close the Neo4j database connection
 * Should be called when shutting down the application
 */
export async function closeNeo4jConnection(): Promise<void> {
  const { neo4jDriver } = await import('./driver.js');
  return neo4jDriver.close();
}
