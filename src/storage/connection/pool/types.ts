import { PlatformCapabilities } from '../../utils/index.js';
import { StorageConfig } from '../../../types/storage.js';

/**
 * Connection pool interface
 */
export interface ConnectionPool {
  // Pool operations
  acquire(): Promise<Connection>;
  release(connection: Connection): void;
  close(): Promise<void>;
  resize(newSize: number): Promise<void>;

  // Pool status
  status(): {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    waitingRequests: number;
    acquireTime: number;
  };
  getConnections(): Connection[];

  // Event emitter methods
  on(
    event: 'connection:active',
    listener: (event: { connection: Connection; metrics: ConnectionMetrics }) => void
  ): this;
  on(
    event: 'connection:idle',
    listener: (event: { connection: Connection; metrics: ConnectionMetrics }) => void
  ): this;
  on(event: 'metrics:updated', listener: () => void): this;
}

/**
 * Connection states
 */
export enum ConnectionState {
  IDLE = 'idle',
  ACTIVE = 'active',
  CLOSED = 'closed',
  ERROR = 'error',
}

/**
 * Connection metrics
 */
export interface ConnectionMetrics {
  queries: number;
  errors: number;
  totalTime: number;
  avgQueryTime: number;
  lastError?: Error;
  lastQuery?: string;
  memoryUsage: number;
  pageSize: number;
  cacheSize: number;
  bytesTransferred: number;
  queryLatency: number;
  lastQueryTime?: Date;
}

/**
 * Factory for creating database connections
 */
export interface ConnectionFactory {
  /**
   * Get storage configuration
   */
  readonly config: StorageConfig;

  /**
   * Create a new connection pool
   */
  createPool(options?: {
    maxSize?: number;
    minSize?: number;
    acquireTimeout?: number;
    idleTimeout?: number;
  }): Promise<ConnectionPool>;
}

/**
 * Platform-specific connection settings
 */
export interface ConnectionSettings {
  pageSize: number;
  sharedCache: boolean;
  memoryLimit: number;
  journalMode: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
  synchronous: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
  tempStore: 'DEFAULT' | 'FILE' | 'MEMORY';
}

/**
 * Base connection interface
 */
export interface Connection {
  id: string;
  state: ConnectionState;
  lastUsed: Date;
  metrics: ConnectionMetrics;
  settings: ConnectionSettings;

  // Core operations
  execute<T = any>(sql: string, params?: any[]): Promise<T>;
  close(): Promise<void>;

  // Health checks
  isHealthy(): boolean;
  ping(): Promise<boolean>;

  // Platform-specific operations
  setPragma(name: string, value: string | number): Promise<void>;
  getPragma(name: string): Promise<string>;

  // Memory management
  shrinkMemory(): Promise<void>;
  getMemoryUsage(): Promise<number>;
}

/**
 * Get default connection settings for current platform
 */
export function getDefaultConnectionSettings(): ConnectionSettings {
  const platformConfig = PlatformCapabilities.getSqliteConfig();

  return {
    pageSize: platformConfig.pageSize,
    sharedCache: platformConfig.sharedMemory,
    memoryLimit: PlatformCapabilities.getMaxMemory() / 10, // 10% of max memory per connection
    journalMode: 'WAL',
    synchronous: 'NORMAL',
    tempStore: platformConfig.sharedMemory ? 'MEMORY' : 'FILE',
  };
}

/**
 * Validate connection settings for current platform
 */
export function validateConnectionSettings(
  settings: Partial<ConnectionSettings>
): ConnectionSettings {
  const defaults = getDefaultConnectionSettings();

  return {
    ...defaults,
    ...settings,
    // Ensure memory settings are within platform limits
    memoryLimit: Math.min(
      settings.memoryLimit ?? defaults.memoryLimit,
      PlatformCapabilities.getMaxMemory() / 2 // Cap at 50% of max memory
    ),
    // Force file-based temp store if shared memory not supported
    tempStore: defaults.sharedCache ? (settings.tempStore ?? defaults.tempStore) : 'FILE',
  };
}
