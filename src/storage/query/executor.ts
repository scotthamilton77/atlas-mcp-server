import { Logger } from '../../logging/index.js';
import { Connection } from '../connection/index.js';
import { QueryBuilder, SqlParameter } from './builder/query-builder.js';
import {
  StorageErrorHandler,
  STORAGE_CONSTANTS,
  STORAGE_ERROR_CODES,
  isTransientError,
} from '../utils/index.js';

interface QueryExecutorOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
  duration: number;
}

/**
 * Query executor for running queries with retries and error handling
 */
export class QueryExecutor {
  private readonly logger: Logger;
  private readonly errorHandler: StorageErrorHandler;
  private readonly options: Required<QueryExecutorOptions>;

  constructor(options: QueryExecutorOptions = {}) {
    this.logger = Logger.getInstance().child({ component: 'QueryExecutor' });
    this.errorHandler = new StorageErrorHandler('QueryExecutor');
    this.options = {
      maxRetries: options.maxRetries ?? STORAGE_CONSTANTS.MAX_RETRIES,
      retryDelay: options.retryDelay ?? STORAGE_CONSTANTS.RETRY_DELAY,
      timeout: options.timeout ?? STORAGE_CONSTANTS.CONNECTION_TIMEOUT,
    };
  }

  /**
   * Execute a query built by the query builder
   */
  async execute<T = unknown>(builder: QueryBuilder): Promise<QueryResult<T>> {
    try {
      // Try async build first if available
      if (builder.buildAsync) {
        const { sql, params } = await builder.buildAsync();
        return this.executeRaw<T>(sql, params);
      }

      // Fall back to sync build
      const { sql, params } = builder.build();
      return this.executeRaw<T>(sql, params);
    } catch (error) {
      return this.errorHandler.handleQueryError(error, 'execute');
    }
  }

  /**
   * Execute a raw SQL query with parameters
   */
  async executeRaw<T = unknown>(sql: string, params: SqlParameter[] = []): Promise<QueryResult<T>> {
    let attempt = 0;
    let lastError: Error | undefined;
    let retryDelay = this.options.retryDelay;

    const startTime = Date.now();

    while (attempt < this.options.maxRetries) {
      try {
        // Execute query with timeout
        const result = await Promise.race([
          this.executeQuery<T[]>(sql, params),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(STORAGE_ERROR_CODES.QUERY_TIMEOUT)),
              this.options.timeout
            )
          ),
        ]);

        const duration = Date.now() - startTime;

        this.logger.debug('Query executed successfully', {
          sql,
          params,
          rowCount: Array.isArray(result) ? result.length : 0,
          duration,
        });

        return {
          rows: Array.isArray(result) ? result : [],
          rowCount: Array.isArray(result) ? result.length : 0,
          duration,
        };
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (!isTransientError(error)) {
          break;
        }

        attempt++;
        if (attempt < this.options.maxRetries) {
          this.logger.warn('Retrying failed query', {
            sql,
            params,
            error,
            attempt,
            nextRetryDelay: retryDelay,
          });

          // Wait before retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay *= STORAGE_CONSTANTS.RETRY_MULTIPLIER;
        }
      }
    }

    // If we got here, all retries failed
    return this.errorHandler.handleQueryError(lastError, sql, params);
  }

  /**
   * Execute multiple queries in a transaction
   */
  async executeTransaction<T = unknown>(
    queries: Array<{ builder: QueryBuilder } | { sql: string; params?: SqlParameter[] }>
  ): Promise<QueryResult<T>[]> {
    try {
      const results: QueryResult<T>[] = [];

      // Start transaction
      await this.executeRaw('BEGIN TRANSACTION');

      try {
        // Execute each query
        for (const query of queries) {
          if ('builder' in query) {
            results.push(await this.execute<T>(query.builder));
          } else {
            results.push(await this.executeRaw<T>(query.sql, query.params));
          }
        }

        // Commit transaction
        await this.executeRaw('COMMIT');

        return results;
      } catch (error) {
        // Rollback on error
        await this.executeRaw('ROLLBACK').catch(rollbackError => {
          // Log rollback error but throw original error
          this.errorHandler.logWarning('Failed to rollback transaction', rollbackError, {
            originalError: error,
          });
        });

        throw error;
      }
    } catch (error) {
      return this.errorHandler.handleTransactionError(error);
    }
  }

  /**
   * Execute a single query with the current connection
   */
  private async executeQuery<T>(sql: string, params: SqlParameter[] = []): Promise<T> {
    const connection = await this.getConnection();
    return connection.execute<T>(sql, params);
  }

  /**
   * Get a connection from the pool
   */
  private async getConnection(): Promise<Connection> {
    // TODO: Implement connection pooling
    throw new Error('Connection pooling not implemented');
  }
}
