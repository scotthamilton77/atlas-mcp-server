import { StorageConfig } from '../../types/storage.js';

export const DEFAULT_PAGE_SIZE = 4096;
export const DEFAULT_CACHE_SIZE = 2000;
export const DEFAULT_BUSY_TIMEOUT = 5000;

export interface SqliteOptions {
    journalMode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
    synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
    tempStore?: 'DEFAULT' | 'FILE' | 'MEMORY';
    lockingMode?: 'NORMAL' | 'EXCLUSIVE';
    autoVacuum?: 'NONE' | 'FULL' | 'INCREMENTAL';
}

export interface SqliteConfig extends StorageConfig {
    sqlite?: SqliteOptions;
    connection?: {
        maxRetries?: number;
        retryDelay?: number;
        busyTimeout?: number;
    };
    performance?: {
        checkpointInterval?: number;
        cacheSize?: number;
        mmapSize?: number;
        pageSize?: number;
    };
}

export const DEFAULT_CONFIG: SqliteConfig = {
    baseDir: 'atlas-tasks',
    name: 'atlas-tasks',
    sqlite: {
        journalMode: 'WAL',
        synchronous: 'NORMAL',
        tempStore: 'MEMORY',
        lockingMode: 'NORMAL',
        autoVacuum: 'NONE'
    },
    connection: {
        maxRetries: 3,
        retryDelay: 1000,
        busyTimeout: DEFAULT_BUSY_TIMEOUT
    },
    performance: {
        checkpointInterval: 60000,
        cacheSize: DEFAULT_CACHE_SIZE,
        mmapSize: 1024 * 1024 * 1024, // 1GB
        pageSize: DEFAULT_PAGE_SIZE
    }
};
