// Re-export all storage types
export * from './operations.js';
export * from './results.js';
export * from './errors.js';

// Additional type utilities
export type StorageId = string;

/**
 * Storage configuration options
 */
export interface StorageConfig {
  basePath: string;
  cacheSize?: number;
  backupPath?: string;
  transactionTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  validation?: {
    enabled: boolean;
    strict?: boolean;
    schemas?: {
      task?: boolean;
      note?: boolean;
      metadata?: boolean;
    };
  };
  performance?: {
    monitoring?: boolean;
    metrics?: {
      enabled: boolean;
      interval?: number;
    };
    optimizations?: {
      cachePreload?: boolean;
      asyncValidation?: boolean;
      batchProcessing?: boolean;
    };
  };
  backup?: {
    enabled: boolean;
    schedule?: string; // cron expression
    maxBackups?: number;
    compression?: boolean;
  };
}

/**
 * Storage capabilities
 */
export interface StorageCapabilities {
  transactions: boolean;
  caching: boolean;
  backup: boolean;
  validation: boolean;
  monitoring: boolean;
  batchProcessing: boolean;
}

/**
 * Storage initialization options
 */
export interface StorageInitOptions {
  validateExisting?: boolean;
  repairCorrupted?: boolean;
  preloadCache?: boolean;
  clearStaleData?: boolean;
  timeout?: number;
}

/**
 * Storage component lifecycle states
 */
export enum StorageState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error',
  SHUTTING_DOWN = 'shutting_down',
  SHUTDOWN = 'shutdown'
}

/**
 * Storage component dependencies
 */
export interface StorageDependencies {
  validation?: {
    validateTask: (task: unknown) => Promise<boolean>;
    validateNote: (note: unknown) => Promise<boolean>;
    validateMetadata: (metadata: unknown) => Promise<boolean>;
  };
  monitoring?: {
    recordMetric: (name: string, value: number, tags?: Record<string, string>) => void;
    reportHealth: (status: 'healthy' | 'degraded' | 'unhealthy', details?: unknown) => void;
  };
  logging?: {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
}
