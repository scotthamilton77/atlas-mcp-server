/**
 * Storage module for Atlas MCP Server
 * Handles unified task and session persistence
 */
import { Task } from '../types/task.js';
import { StorageMetrics } from '../types/storage.js';
import { UnifiedStorageError } from './unified-storage.js';

// Re-export unified storage types and implementations
export { UnifiedStorageManager, UnifiedStorageConfig, BaseUnifiedStorage } from './unified-storage.js';
export { UnifiedSqliteStorage } from './unified-sqlite-storage.js';
export { ConnectionManager } from './connection-manager.js';

// Export factory functions
export { createStorageManager, createDefaultStorageManager } from './factory.js';

// All deprecated exports have been removed - use UnifiedStorageManager and related types directly
