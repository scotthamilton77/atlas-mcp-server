/**
 * SQLite storage module exports
 */
export { SqliteStorage } from './storage.js';
export { 
    initializeSqliteStorage,
    verifySqliteIntegrity,
    getSqliteStats 
} from './init.js';

import type { 
    StorageConfig,
    StorageMetrics,
    TaskStorage,
    CacheStats,
    ConnectionStats,
    QueryStats,
    MonitoringMetrics
} from '../../types/storage.js';
import type { MonitoringConfig } from '../monitoring/index.js';

// Re-export types
export type {
    StorageConfig,
    StorageMetrics,
    TaskStorage,
    CacheStats,
    ConnectionStats,
    QueryStats,
    MonitoringMetrics
};

// Constants
export const DEFAULT_PAGE_SIZE = 4096;
export const DEFAULT_CACHE_SIZE = -2000; // 2MB in pages
export const DEFAULT_MMAP_SIZE = 0;
export const DEFAULT_BUSY_TIMEOUT = 5000;
export const DEFAULT_WAL_AUTOCHECKPOINT = 1000;

// SQLite-specific types
export interface SqliteStats {
    size: number;
    walSize: number;
    pageCount: number;
    pageSize: number;
}

export interface SqliteConfig extends StorageConfig {
    sqlite?: {
        // SQLite-specific settings
        journalMode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
        synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
        tempStore?: 'DEFAULT' | 'FILE' | 'MEMORY';
        lockingMode?: 'NORMAL' | 'EXCLUSIVE';
        autoVacuum?: 'NONE' | 'FULL' | 'INCREMENTAL';
    };
    monitoring?: MonitoringConfig;
}

export interface SqliteMetrics extends StorageMetrics {
    sqlite?: {
        // SQLite-specific metrics
        journalMode: string;
        synchronous: string;
        tempStore: string;
        lockingMode: string;
        autoVacuum: string;
        integrityCheck: boolean;
        lastVacuum?: number;
        lastAnalyze?: number;
        lastCheckpoint?: number;
    };
}
