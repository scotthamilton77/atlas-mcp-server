import neo4j, { Driver, ManagedTransaction, Session } from 'neo4j-driver';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Neo4j connection management singleton
 * Responsible for creating and managing the Neo4j driver connection
 */
class Neo4jDriver {
  private static instance: Neo4jDriver;
  private driver: Driver | null = null;
  private connectionPromise: Promise<Driver> | null = null;

  private constructor() {}

  /**
   * Get the Neo4jDriver singleton instance
   */
  public static getInstance(): Neo4jDriver {
    if (!Neo4jDriver.instance) {
      Neo4jDriver.instance = new Neo4jDriver();
    }
    return Neo4jDriver.instance;
  }

  /**
   * Initialize the Neo4j driver connection
   * @returns Promise that resolves to the Neo4j driver
   */
  private async initDriver(): Promise<Driver> {
    if (this.driver) {
      return this.driver;
    }

    try {
      const { neo4jUri, neo4jUser, neo4jPassword } = config;
      
      if (!neo4jUri || !neo4jUser || !neo4jPassword) {
        throw new Error('Neo4j connection details are not properly configured');
      }

      logger.info('Initializing Neo4j driver connection');
      
      this.driver = neo4j.driver(
        neo4jUri,
        neo4j.auth.basic(neo4jUser, neo4jPassword),
        {
          maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
          maxConnectionPoolSize: 50,
          connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
          disableLosslessIntegers: true
        }
      );

      // Verify connection
      await this.driver.verifyConnectivity();
      
      logger.info('Neo4j driver connection established successfully');
      return this.driver;
    } catch (error) {
      logger.error('Failed to initialize Neo4j driver', { error });
      throw new Error(`Failed to initialize Neo4j connection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the Neo4j driver instance, initializing it if necessary
   * @returns Promise that resolves to the Neo4j driver
   */
  public async getDriver(): Promise<Driver> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.initDriver();
    }
    return this.connectionPromise;
  }

  /**
   * Create a new Neo4j session
   * @param database Optional database name
   * @returns Promise that resolves to a new Neo4j session
   */
  public async getSession(database?: string): Promise<Session> {
    const driver = await this.getDriver();
    return driver.session({
      database: database || undefined,
      defaultAccessMode: neo4j.session.WRITE
    });
  }

  /**
   * Execute a query with a transaction
   * @param cypher Cypher query to execute
   * @param params Parameters for the query
   * @param database Optional database name
   * @returns Promise that resolves to the query result
   */
  public async executeQuery<T = any>(
    cypher: string,
    params: Record<string, any> = {},
    database?: string
  ): Promise<T> {
    const session = await this.getSession(database);
    
    try {
      const result = await session.executeWrite(async (tx: ManagedTransaction) => {
        const queryResult = await tx.run(cypher, params);
        return queryResult.records;
      });
      
      return result as unknown as T;
    } catch (error) {
      logger.error('Error executing Neo4j query', { 
        error, 
        query: cypher,
        params: JSON.stringify(params)
      });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a read-only query
   * @param cypher Cypher query to execute
   * @param params Parameters for the query
   * @param database Optional database name
   * @returns Promise that resolves to the query result
   */
  public async executeReadQuery<T = any>(
    cypher: string,
    params: Record<string, any> = {},
    database?: string
  ): Promise<T> {
    const session = await this.getSession(database);
    
    try {
      const result = await session.executeRead(async (tx: ManagedTransaction) => {
        const queryResult = await tx.run(cypher, params);
        return queryResult.records;
      });
      
      return result as unknown as T;
    } catch (error) {
      logger.error('Error executing Neo4j read query', { 
        error, 
        query: cypher,
        params: JSON.stringify(params)
      });
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Close the Neo4j driver connection
   */
  public async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      this.connectionPromise = null;
      logger.info('Neo4j driver connection closed');
    }
  }
}

// Export the singleton instance
export const neo4jDriver = Neo4jDriver.getInstance();
