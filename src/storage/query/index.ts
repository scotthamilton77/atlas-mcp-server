/**
 * Query module exports
 */

import { Connection } from '../connection/index.js';
import { Logger } from '../../logging/index.js';
import { createError, ErrorCodes } from '../../errors/index.js';
import { SqliteQueryBuilder } from './builder/sqlite-query-builder.js';
import { SqliteOptimizer } from './optimizer/sqlite-optimizer.js';

// Core exports
export { QueryExecutor } from './executor.js';
export { BaseQueryBuilder } from './builder/query-builder.js';
export { SqliteQueryBuilder } from './builder/sqlite-query-builder.js';
export { SqliteOptimizer } from './optimizer/index.js';

// Type exports
export type {
  QueryBuilder,
  SqlParameter,
  SqlOperator,
  JoinType,
  OrderDirection,
  WhereCondition,
  JoinCondition,
  OrderByColumn,
} from './builder/query-builder.js';

export type { QueryPlan, QueryStep, IndexSuggestion, QueryOptimizer } from './optimizer/index.js';

export interface QueryExecutorOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  duration: number;
}

// Default configuration
export const DEFAULT_EXECUTOR_OPTIONS: Required<QueryExecutorOptions> = {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
};

/**
 * Factory for creating optimized query builders
 */
export class QueryBuilderFactory {
  private readonly logger: Logger;

  constructor(private readonly connection: Connection) {
    this.logger = Logger.getInstance().child({ component: 'QueryBuilderFactory' });
  }

  /**
   * Create an optimized SQLite query builder
   */
  createSqliteBuilder(): SqliteQueryBuilder {
    try {
      const builder = new SqliteQueryBuilder();
      const optimizer = new SqliteOptimizer(this.connection);

      // Add async build method with optimizations
      builder.buildAsync = async () => {
        try {
          // Get optimized version of query
          const optimized = await optimizer.rewrite(builder);
          return optimized.build();
        } catch (error) {
          this.logger.warn('Query optimization failed, using original query', { error });
          return builder.build();
        }
      };

      return builder;
    } catch (error) {
      this.logger.error('Failed to create query builder', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to create query builder',
        'createSqliteBuilder',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Get optimizer instance
   */
  getOptimizer(): SqliteOptimizer {
    return new SqliteOptimizer(this.connection);
  }
}
