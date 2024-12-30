/**
 * Storage module exports
 */

// Export storage creation functions
export { createStorage } from './sqlite/init.js';
export { createDefaultStorage } from './factory.js';

// Re-export types
export type { StorageConfig, TaskStorage, StorageMetrics } from '../types/storage.js';
