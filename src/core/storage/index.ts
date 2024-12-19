import { StorageConfig } from './types/index.js';

// Core storage components
export { FileManager } from './file-manager.js';
export { MemoryManager } from './memory-manager.js';
export { StorageTransaction } from './storage-transaction.js';
export { UnifiedEngine } from './unified-engine.js';

// Storage types
export * from './types/index.js';

// Default configuration
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  basePath: './storage',
  cacheSize: 1000,
  transactionTimeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
  validation: {
    enabled: true,
    strict: false,
    schemas: {
      task: true,
      note: true,
      metadata: true
    }
  },
  performance: {
    monitoring: true,
    metrics: {
      enabled: true,
      interval: 60000 // 1 minute
    },
    optimizations: {
      cachePreload: true,
      asyncValidation: true,
      batchProcessing: true
    }
  },
  backup: {
    enabled: true,
    schedule: '0 0 * * *', // Daily at midnight
    maxBackups: 7,
    compression: true
  }
};

// Version information
export const VERSION = {
  storage: '1.0.0',
  schema: '1.0.0',
  api: '1.0.0'
};
