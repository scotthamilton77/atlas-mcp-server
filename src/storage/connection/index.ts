/**
 * Connection management module exports
 */

import type { Connection, ConnectionMetrics, ConnectionFactory } from './pool/types.js';

// Core exports
export { ConnectionManager } from './manager.js';
export { ConnectionPool } from './pool/connection-pool.js';
export { SqliteConnection } from './pool/sqlite-connection.js';
export { SqliteConnectionFactory } from './pool/sqlite-connection-factory.js';
export { ConnectionState } from './pool/types.js';

// Type exports
export type { Connection, ConnectionMetrics, ConnectionFactory };

// Event types
export interface ConnectionEvents {
  'connection:created': (connection: Connection) => void;
  'connection:active': (connection: Connection) => void;
  'connection:idle': (connection: Connection) => void;
  'connection:error': (connection: Connection, error: Error) => void;
  'connection:closed': (connection: Connection) => void;
  'metrics:updated': (metrics: ConnectionMetrics) => void;
}

// Configuration types
export interface ConnectionConfig {
  maxPoolSize: number;
  minPoolSize: number;
  acquireTimeout: number;
  idleTimeout: number;
  maxWaitingClients: number;
  healthCheckInterval: number;
  pruneInterval: number;
  sqlite: {
    filename: string;
    mode?: number;
    timeout?: number;
    verbose?: boolean;
  };
}

// Default configuration
export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  maxPoolSize: 10,
  minPoolSize: 2,
  acquireTimeout: 30000,
  idleTimeout: 60000,
  maxWaitingClients: 50,
  healthCheckInterval: 30000,
  pruneInterval: 60000,
  sqlite: {
    filename: ':memory:', // Default to in-memory database
    timeout: 5000,
    verbose: false,
  },
};
