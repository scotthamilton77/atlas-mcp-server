import { Driver, SessionConfig } from 'neo4j-driver';
import { logger } from '../../../utils/logger.js';
import { neo4jDriver } from '../driver.js';
import { databaseEvents, DatabaseEventType } from '../events.js';

/**
 * ResilientConnection provides a wrapper around Neo4j driver operations
 * with automatic retries, connection monitoring, and error handling.
 * 
 * It helps make database operations more resilient against transient failures.
 */
export class ResilientConnection {
  private static instance: ResilientConnection;
  private isInitialized: boolean = false;
  private connectionHealthy: boolean = true;
  private lastHealthCheck: Date = new Date();
  private healthCheckIntervalId: NodeJS.Timeout | null = null;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): ResilientConnection {
    if (!ResilientConnection.instance) {
      ResilientConnection.instance = new ResilientConnection();
    }
    return ResilientConnection.instance;
  }

  /**
   * Initialize the resilient connection service
   */
  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Start periodic health checks (every 5 minutes)
    this.startHealthCheck(5 * 60 * 1000);

    // Listen for database errors to track connection health
    databaseEvents.subscribe(DatabaseEventType.ERROR, (data: any) => {
      if (data.error && typeof data.error === 'string' && 
          (data.error.includes('connection') || data.error.includes('timeout'))) {
        this.connectionHealthy = false;
        logger.warn('Neo4j connection issue detected', { error: data.error });
      }
    });

    this.isInitialized = true;
    logger.info('Resilient connection service initialized');
  }

  /**
   * Start periodic database connection health checks
   * @param interval Time between health checks in milliseconds
   */
  private startHealthCheck(interval: number): void {
    // Clear any existing interval
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
    }

    // Set up new interval
    this.healthCheckIntervalId = setInterval(() => {
      this.checkConnectionHealth()
        .catch(error => logger.error('Error during connection health check', { error }));
    }, interval);

    // Run a health check immediately
    this.checkConnectionHealth()
      .catch(error => logger.error('Error during initial connection health check', { error }));
  }

  /**
   * Check the health of the database connection
   */
  private async checkConnectionHealth(): Promise<void> {
    try {
      const driver = await neo4jDriver.getDriver();
      await driver.verifyConnectivity();
      
      this.connectionHealthy = true;
      this.lastHealthCheck = new Date();
      logger.debug('Neo4j connection health check passed');
    } catch (error) {
      this.connectionHealthy = false;
      logger.error('Neo4j connection health check failed', { error });
      
      // Publish error event
      databaseEvents.publish(DatabaseEventType.ERROR, {
        operation: 'connection-check',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Execute a database query with retry logic
   * @param operation Function that performs the database operation
   * @param maxRetries Maximum number of retry attempts
   * @returns Result of the operation
   */
  public async executeWithRetry<T>(
    operation: (driver: Driver) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let retries = 0;
    let lastError: any;

    while (retries <= maxRetries) {
      try {
        // Check connection health before attempting operation
        if (!this.connectionHealthy && retries === 0) {
          await this.checkConnectionHealth();
        }

        // If still unhealthy after check, wait before retry
        if (!this.connectionHealthy && retries === 0) {
          retries++;
          const delay = 1000 * Math.pow(2, retries);
          logger.info(`Database connection unhealthy, delaying retry for ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Perform the operation
        const driver = await neo4jDriver.getDriver();
        return await operation(driver);
      } catch (error) {
        retries++;
        lastError = error;
        
        // Only retry on connection-related errors
        const isConnectionError = this.isRetryableError(error);
        if (!isConnectionError) {
          logger.error('Non-retryable database error', { error });
          throw error;
        }
        
        if (retries > maxRetries) {
          logger.error(`Database operation failed after ${maxRetries} retries`, { error });
          throw error;
        }
        
        // Exponential backoff
        const delay = 1000 * Math.pow(2, retries);
        logger.warn(`Database operation failed, retry ${retries}/${maxRetries} in ${delay}ms`, { error });
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Mark connection as unhealthy for this operation
        this.connectionHealthy = false;
      }
    }

    // Should never get here, but TypeScript requires it
    throw lastError;
  }

  /**
   * Get a session with retry logic
   * @param config Neo4j session configuration
   * @returns Neo4j session
   */
  public async getSession(config?: SessionConfig) {
    return this.executeWithRetry(async (driver) => {
      return driver.session(config);
    });
  }

  /**
   * Determine if an error is retryable
   * @param error The error to check
   * @returns True if the error is retryable, false otherwise
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error instanceof Error 
      ? error.message 
      : String(error);
    
    const retryablePatterns = [
      'connection refused',
      'connection reset',
      'connection timeout',
      'socket hang up',
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'server is unavailable',
      'failed to establish connection',
      'write EPIPE',
      'network unreachable'
    ];
    
    return retryablePatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Stop the health check service
   */
  public stop(): void {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
    
    this.isInitialized = false;
    logger.info('Resilient connection service stopped');
  }
}

// Export singleton instance
export const resilientConnection = ResilientConnection.getInstance();
// Do not auto-initialize - will be initialized by initializeNeo4jServices() in the correct order
