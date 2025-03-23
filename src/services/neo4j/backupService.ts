/**
 * Neo4j Backup Service
 * 
 * This file serves as a barrel file that re-exports the modular backup service components
 * from the backup_service directory. This maintains backward compatibility with code
 * that imports from this file directly.
 */

// Re-export all types and services from the modular structure
export * from './backup_service/index.js';
