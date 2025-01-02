import { EventEmitter } from 'events';
import { Logger } from '../../logging/index.js';
import { createError, ErrorCodes } from '../../errors/index.js';
import {
  Connection,
  ConnectionPool,
  ConnectionFactory,
  ConnectionState,
  ConnectionMetrics,
  validateConfig,
} from './pool/index.js';

interface ManagerConfig {
  maxPoolSize: number;
  minPoolSize: number;
  acquireTimeout: number;
  idleTimeout: number;
  maxWaitingClients: number;
  healthCheckInterval: number;
  pruneInterval: number;
}

interface ManagerMetrics {
  pools: number;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  failedRequests: number;
  avgAcquireTime: number;
}

interface ConnectionEvent {
  connection: Connection;
  metrics: ConnectionMetrics;
}

/**
 * Connection manager for coordinating connection pools
 */
export class ConnectionManager extends EventEmitter {
  private pools: Map<string, ConnectionPool> = new Map();
  private healthCheckTimer?: NodeJS.Timeout;
  private pruneTimer?: NodeJS.Timeout;
  private metrics: ManagerMetrics = {
    pools: 0,
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    waitingRequests: 0,
    failedRequests: 0,
    avgAcquireTime: 0,
  };

  private readonly logger: Logger;

  constructor(
    private readonly config: ManagerConfig,
    private readonly connectionFactory: ConnectionFactory
  ) {
    super();
    this.logger = Logger.getInstance().child({
      component: 'ConnectionManager',
    });
  }

  /**
   * Initialize connection manager
   */
  async initialize(): Promise<void> {
    try {
      // Validate factory configuration
      validateConfig(this.connectionFactory.config);

      // Create initial pool
      await this.createPool('default');

      // Start health checks
      this.startHealthChecks();

      // Start idle connection pruning
      this.startPruning();

      this.logger.info('Connection manager initialized');
    } catch (error) {
      this.logger.error('Failed to initialize connection manager', { error });
      throw error;
    }
  }

  /**
   * Acquire connection from pool
   */
  async acquire(poolName = 'default'): Promise<Connection> {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw createError(ErrorCodes.STORAGE_ERROR, `Pool ${poolName} not found`, 'acquire');
    }

    try {
      const connection = await pool.acquire();
      this.updateMetrics();
      return connection;
    } catch (error) {
      this.metrics.failedRequests++;
      throw error;
    }
  }

  /**
   * Release connection back to pool
   */
  release(connection: Connection, poolName = 'default'): void {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw createError(ErrorCodes.STORAGE_ERROR, `Pool ${poolName} not found`, 'release');
    }

    pool.release(connection);
    this.updateMetrics();
  }

  /**
   * Create new connection pool
   */
  async createPool(name: string): Promise<void> {
    if (this.pools.has(name)) {
      throw createError(ErrorCodes.STORAGE_ERROR, `Pool ${name} already exists`, 'createPool');
    }

    const pool = await this.connectionFactory.createPool({
      maxSize: this.config.maxPoolSize,
      minSize: this.config.minPoolSize,
      acquireTimeout: this.config.acquireTimeout,
      idleTimeout: this.config.idleTimeout,
    });

    // Set up pool event handlers
    pool.on('connection:active', this.handleConnectionActive.bind(this));
    pool.on('connection:idle', this.handleConnectionIdle.bind(this));
    pool.on('metrics:updated', this.handlePoolMetricsUpdate.bind(this));

    this.pools.set(name, pool);
    this.metrics.pools++;

    this.logger.info('Created new connection pool', { name });
  }

  /**
   * Remove connection pool
   */
  async removePool(name: string): Promise<void> {
    const pool = this.pools.get(name);
    if (!pool) {
      throw createError(ErrorCodes.STORAGE_ERROR, `Pool ${name} not found`, 'removePool');
    }

    if (name === 'default') {
      throw createError(ErrorCodes.STORAGE_ERROR, 'Cannot remove default pool', 'removePool');
    }

    await pool.close();
    this.pools.delete(name);
    this.metrics.pools--;

    this.logger.info('Removed connection pool', { name });
  }

  /**
   * Get manager metrics
   */
  getMetrics(): ManagerMetrics {
    return { ...this.metrics };
  }

  /**
   * Shutdown connection manager
   */
  async shutdown(): Promise<void> {
    // Stop health checks and pruning
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
    }

    // Close all pools
    const closePromises = Array.from(this.pools.values()).map(pool => pool.close());
    await Promise.all(closePromises);

    this.pools.clear();
    this.updateMetrics();

    this.logger.info('Connection manager shut down');
  }

  /**
   * Start health check interval
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => this.checkHealth(), this.config.healthCheckInterval);
  }

  /**
   * Start idle connection pruning
   */
  private startPruning(): void {
    this.pruneTimer = setInterval(() => this.pruneIdleConnections(), this.config.pruneInterval);
  }

  /**
   * Check health of all connections
   */
  private async checkHealth(): Promise<void> {
    for (const [name, pool] of this.pools) {
      const connections = pool.getConnections();
      const activeConnections = connections.filter(conn => conn.state === ConnectionState.ACTIVE);

      const unhealthyCount = activeConnections.filter(conn => !conn.isHealthy()).length;

      if (unhealthyCount > 0) {
        this.logger.warn('Unhealthy connections detected', {
          pool: name,
          unhealthyCount,
        });
      }
    }
  }

  /**
   * Prune idle connections
   */
  private async pruneIdleConnections(): Promise<void> {
    for (const [name, pool] of this.pools) {
      const status = pool.status();
      if (status.idleConnections > this.config.minPoolSize) {
        const excessConnections = status.idleConnections - this.config.minPoolSize;
        await pool.resize(this.config.maxPoolSize - excessConnections);

        this.logger.debug('Pruned idle connections', {
          pool: name,
          pruned: excessConnections,
        });
      }
    }
  }

  /**
   * Update manager metrics
   */
  private updateMetrics(): void {
    const poolMetrics = Array.from(this.pools.values()).map(pool => pool.status());

    this.metrics = {
      pools: this.pools.size,
      totalConnections: poolMetrics.reduce((sum, m) => sum + m.totalConnections, 0),
      activeConnections: poolMetrics.reduce((sum, m) => sum + m.activeConnections, 0),
      idleConnections: poolMetrics.reduce((sum, m) => sum + m.idleConnections, 0),
      waitingRequests: poolMetrics.reduce((sum, m) => sum + m.waitingRequests, 0),
      failedRequests: this.metrics.failedRequests,
      avgAcquireTime: poolMetrics.reduce((sum, m) => sum + m.acquireTime, 0) / this.pools.size,
    };

    this.emit('metrics:updated', this.metrics);
  }

  /**
   * Handle connection active event
   */
  private handleConnectionActive(event: ConnectionEvent): void {
    this.emit('connection:active', event);
  }

  /**
   * Handle connection idle event
   */
  private handleConnectionIdle(event: ConnectionEvent): void {
    this.emit('connection:idle', event);
  }

  /**
   * Handle pool metrics update
   */
  private handlePoolMetricsUpdate(): void {
    this.updateMetrics();
  }
}
