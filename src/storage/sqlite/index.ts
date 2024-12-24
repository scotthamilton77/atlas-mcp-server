/**
 * SQLite Storage Implementation
 * 
 * This module provides a SQLite-based implementation of the TaskStorage interface,
 * with support for:
 * - Task CRUD operations
 * - Transaction management
 * - Database maintenance
 * - Performance monitoring
 * - Data integrity verification
 */

// Core initialization and cleanup
export { 
    initializeSqliteStorage  // Initialize SQLite storage cleanup handlers
} from './init.js';

// Storage implementation and configuration
export { 
    SqliteStorage,           // Main storage class implementing TaskStorage interface
    SqliteConfig,            // Configuration interface for SQLite storage
    DEFAULT_PAGE_SIZE,       // Default SQLite page size (4KB)
    DEFAULT_CACHE_SIZE,      // Default cache size (2000 pages)
    DEFAULT_BUSY_TIMEOUT     // Default busy timeout (5000ms)
} from './storage.js';

// Re-export task types for convenience
export type {
    Task,
    TaskStatus,
    CreateTaskInput,
    UpdateTaskInput
} from '../../types/task.js';
