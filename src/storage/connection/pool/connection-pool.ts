import { EventEmitter } from 'events';
import { Logger } from '../../../logging/index.js';
import { StorageErrorHandler } from '../../utils/index.js';
import { Connection, ConnectionState } from './types.js';
import type { ConnectionMetrics } from './types.js';

// Define event types that use ConnectionMetrics
interface ConnectionPoolEvents {
  'connection:active': { connection: Connection; metrics: ConnectionMetrics };
  'connection:idle': { connection: Connection; metrics: ConnectionMetrics };
  'metrics:updated': PoolMetrics;
}

// Export event types for external use
export type { ConnectionPoolEvents };

export interface PoolConfig {
  maxSize?: number;
  minSize?: number;
  acquireTimeout?: number;
  idleTimeout?: number;
  maxWaitingClients?: number;
  busyTimeout?: number;
  sharedCache?: boolean;
  pageSize?: number;
}

const DEFAULT_CONFIG: Required<PoolConfig> = {
  maxSize: 10,
  minSize: 1,
  acquireTimeout: 30000,
  idleTimeout: 60000,
  maxWaitingClients: 20,
  busyTimeout: 5000,
  sharedCache: false,
  pageSize: 4096,
};

interface PoolMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  acquireTime: number;
}

/**
 * Platform-aware connection pool implementation
 */
export class ConnectionPool extends EventEmitter {
  // Type-safe event emitter methods
  emit<E extends keyof ConnectionPoolEvents>(event: E, payload: ConnectionPoolEvents[E]): boolean {
    return super.emit(event, payload);
  }

  on<E extends keyof ConnectionPoolEvents>(
    event: E,
    listener: (payload: ConnectionPoolEvents[E]) => void
  ): this {
    return super.on(event, listener);
  }

  private connections: Map<string, Connection> = new Map();
  private idleConnections: Set<string> = new Set();
  private waitingRequests: Array<{
    resolve: (connection: Connection) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];

  private readonly logger: Logger;
  private readonly errorHandler: StorageErrorHandler;
  private readonly config: Required<PoolConfig>;

  constructor(
    config: PoolConfig,
    private readonly createConnection: () => Promise<Connection>
  ) {
    super();
    this.logger = Logger.getInstance().child({ component: 'ConnectionPool' });
    this.errorHandler = new StorageErrorHandler('ConnectionPool');

    // Apply defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    // Log platform-specific settings
    if (this.config.sharedCache) {
      this.logger.info('Pool initialized with shared cache', {
        pageSize: this.config.pageSize,
      });
    }
  }

  /**
   * Acquire connection from pool
   */
  async acquire(): Promise<Connection> {
    const startTime = Date.now();

    try {
      // Check for available idle connection
      const idleConnection = this.getIdleConnection();
      if (idleConnection) {
        this.activateConnection(idleConnection);
        this.emitMetrics(startTime);
        return idleConnection;
      }

      // Create new connection if pool not at capacity
      if (this.connections.size < this.config.maxSize) {
        const connection = await this.createConnection();
        this.connections.set(connection.id, connection);
        this.activateConnection(connection);
        this.emitMetrics(startTime);
        return connection;
      }

      // Wait for connection if under limit
      if (this.waitingRequests.length < this.config.maxWaitingClients) {
        const connection = await this.waitForConnection(startTime);
        this.emitMetrics(startTime);
        return connection;
      }

      throw this.errorHandler.handleConnectionError(new Error('Connection pool exhausted'), {
        poolSize: this.connections.size,
        waitingRequests: this.waitingRequests.length,
      });
    } catch (error) {
      this.logger.error('Failed to acquire connection', { error });
      throw error;
    }
  }

  /**
   * Release connection back to pool
   */
  release(connection: Connection): void {
    try {
      if (!this.connections.has(connection.id)) {
        throw this.errorHandler.handleConnectionError(new Error('Connection not from this pool'), {
          connectionId: connection.id,
        });
      }

      // Check for waiting requests
      if (this.waitingRequests.length > 0) {
        const request = this.waitingRequests.shift()!;
        request.resolve(connection);
        this.emitMetrics();
        return;
      }

      // Add to idle pool
      this.idleConnections.add(connection.id);
      connection.lastUsed = new Date();
      this.emitMetrics();

      // Emit idle event
      this.emit('connection:idle', {
        connection,
        metrics: connection.metrics,
      });
    } catch (error) {
      this.logger.error('Failed to release connection', {
        error,
        connectionId: connection.id,
      });
      throw error;
    }
  }

  /**
   * Close all connections and shut down pool
   */
  async close(): Promise<void> {
    try {
      // Cancel waiting requests
      for (const request of this.waitingRequests) {
        request.reject(new Error('Pool shutting down'));
      }
      this.waitingRequests = [];

      // Close all connections
      const closePromises = Array.from(this.connections.values()).map(async conn => {
        try {
          await conn.close();
        } catch (error) {
          this.logger.error('Error closing connection', {
            error,
            connectionId: conn.id,
          });
        }
      });

      await Promise.all(closePromises);

      this.connections.clear();
      this.idleConnections.clear();
      this.emitMetrics();

      this.logger.info('Connection pool closed');
    } catch (error) {
      this.logger.error('Error closing connection pool', { error });
      throw error;
    }
  }

  /**
   * Resize the pool
   */
  async resize(newSize: number): Promise<void> {
    if (newSize < this.config.minSize) {
      throw this.errorHandler.handleError(
        new Error('Pool size cannot be less than minimum'),
        'resize',
        { newSize, minSize: this.config.minSize }
      );
    }

    const oldSize = this.config.maxSize;
    this.config.maxSize = newSize;

    // Remove excess idle connections if shrinking
    if (newSize < oldSize) {
      await this.removeExcessConnections(oldSize - newSize);
    }

    this.logger.info('Pool resized', {
      oldSize,
      newSize,
      metrics: this.status(),
    });
  }

  /**
   * Get pool status
   */
  status(): PoolMetrics {
    return {
      totalConnections: this.connections.size,
      activeConnections: this.connections.size - this.idleConnections.size,
      idleConnections: this.idleConnections.size,
      waitingRequests: this.waitingRequests.length,
      acquireTime: this.calculateAverageAcquireTime(),
    };
  }

  /**
   * Get all connections
   */
  getConnections(): Connection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Remove excess idle connections
   */
  private async removeExcessConnections(count: number): Promise<void> {
    const connectionsToRemove = Array.from(this.idleConnections)
      .slice(0, count)
      .map(id => this.connections.get(id)!);

    for (const connection of connectionsToRemove) {
      try {
        await connection.close();
        this.connections.delete(connection.id);
        this.idleConnections.delete(connection.id);
      } catch (error) {
        this.logger.error('Error removing connection', {
          error,
          connectionId: connection.id,
        });
      }
    }

    this.emitMetrics();
  }

  /**
   * Get an idle connection if available
   */
  private getIdleConnection(): Connection | undefined {
    if (this.idleConnections.size === 0) return undefined;

    // Get oldest idle connection
    const [oldestId] = this.idleConnections;
    const connection = this.connections.get(oldestId)!;
    this.idleConnections.delete(oldestId);

    // Verify connection is still healthy
    if (!connection.isHealthy()) {
      this.logger.warn('Removing unhealthy idle connection', {
        connectionId: connection.id,
      });
      this.connections.delete(connection.id);
      return undefined;
    }

    return connection;
  }

  /**
   * Wait for connection to become available
   */
  private waitForConnection(startTime: number): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingRequests.findIndex(r => r.timestamp === startTime);
        if (index !== -1) {
          this.waitingRequests.splice(index, 1);
          reject(new Error('Connection acquire timeout'));
        }
      }, this.config.acquireTimeout);

      this.waitingRequests.push({
        resolve: (connection: Connection) => {
          clearTimeout(timeout);
          resolve(connection);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timestamp: startTime,
      });
    });
  }

  /**
   * Mark connection as active
   */
  private activateConnection(connection: Connection): void {
    connection.state = ConnectionState.ACTIVE;
    connection.lastUsed = new Date();
    this.emit('connection:active', {
      connection,
      metrics: connection.metrics,
    });
  }

  /**
   * Calculate average acquire time
   */
  private calculateAverageAcquireTime(): number {
    const activeConnections = Array.from(this.connections.values()).filter(
      conn => conn.state === ConnectionState.ACTIVE
    );

    if (activeConnections.length === 0) return 0;

    const totalTime = activeConnections.reduce(
      (sum, conn) => sum + (Date.now() - conn.lastUsed.getTime()),
      0
    );

    return totalTime / activeConnections.length;
  }

  /**
   * Emit updated metrics
   */
  private emitMetrics(acquireStartTime?: number): void {
    const metrics = this.status();
    if (acquireStartTime) {
      metrics.acquireTime = Date.now() - acquireStartTime;
    }
    this.emit('metrics:updated', metrics);
  }
}
