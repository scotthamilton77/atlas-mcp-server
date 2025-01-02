import { Logger } from '../../../logging/index.js';
import { createError, ErrorCodes } from '../../../errors/index.js';

/**
 * SQL parameter types
 */
export type SqlParameter = string | number | boolean | null | Date;

/**
 * SQL operator types
 */
export type SqlOperator =
  | '='
  | '<>'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'IN'
  | 'NOT IN'
  | 'LIKE'
  | 'NOT LIKE'
  | 'IS NULL'
  | 'IS NOT NULL'
  | 'BETWEEN';

/**
 * SQL join types
 */
export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

/**
 * SQL order direction
 */
export type OrderDirection = 'ASC' | 'DESC';

/**
 * Where condition
 */
export interface WhereCondition {
  column: string;
  operator: SqlOperator;
  value?: SqlParameter | SqlParameter[];
}

/**
 * Join condition
 */
export interface JoinCondition {
  type: JoinType;
  table: string;
  on: {
    leftColumn: string;
    rightColumn: string;
  };
}

/**
 * Order by column
 */
export interface OrderByColumn {
  column: string;
  direction: OrderDirection;
}

/**
 * Query builder interface
 */
export interface QueryBuilder {
  select(columns: string[]): QueryBuilder;
  from(table: string): QueryBuilder;
  where(conditions: WhereCondition[]): QueryBuilder;
  join(conditions: JoinCondition[]): QueryBuilder;
  groupBy(columns: string[]): QueryBuilder;
  having(conditions: WhereCondition[]): QueryBuilder;
  orderBy(columns: OrderByColumn[]): QueryBuilder;
  limit(limit: number): QueryBuilder;
  offset(offset: number): QueryBuilder;
  /**
   * Build query synchronously
   */
  build(): { sql: string; params: SqlParameter[] };

  /**
   * Build query with async optimizations
   */
  buildAsync?(): Promise<{ sql: string; params: SqlParameter[] }>;
}

/**
 * Base query builder implementation
 */
export class BaseQueryBuilder implements QueryBuilder {
  protected selectedColumns: string[] = ['*'];
  protected fromTable?: string;
  protected whereConditions: WhereCondition[] = [];
  protected joinConditions: JoinCondition[] = [];
  protected groupByColumns: string[] = [];
  protected havingConditions: WhereCondition[] = [];
  protected orderByColumns: OrderByColumn[] = [];
  protected limitValue?: number;
  protected offsetValue?: number;
  protected parameters: SqlParameter[] = [];

  protected readonly logger: Logger;

  constructor(component = 'QueryBuilder') {
    this.logger = Logger.getInstance().child({ component });
  }

  /**
   * Set columns to select
   */
  select(columns: string[]): QueryBuilder {
    this.selectedColumns = columns;
    return this;
  }

  /**
   * Set table to select from
   */
  from(table: string): QueryBuilder {
    this.fromTable = table;
    return this;
  }

  /**
   * Add where conditions
   */
  where(conditions: WhereCondition[]): QueryBuilder {
    this.whereConditions.push(...conditions);
    return this;
  }

  /**
   * Add join conditions
   */
  join(conditions: JoinCondition[]): QueryBuilder {
    this.joinConditions.push(...conditions);
    return this;
  }

  /**
   * Set group by columns
   */
  groupBy(columns: string[]): QueryBuilder {
    this.groupByColumns = columns;
    return this;
  }

  /**
   * Add having conditions
   */
  having(conditions: WhereCondition[]): QueryBuilder {
    this.havingConditions.push(...conditions);
    return this;
  }

  /**
   * Set order by columns
   */
  orderBy(columns: OrderByColumn[]): QueryBuilder {
    this.orderByColumns = columns;
    return this;
  }

  /**
   * Set limit value
   */
  limit(limit: number): QueryBuilder {
    this.limitValue = limit;
    return this;
  }

  /**
   * Set offset value
   */
  offset(offset: number): QueryBuilder {
    this.offsetValue = offset;
    return this;
  }

  /**
   * Build query
   */
  build(): { sql: string; params: SqlParameter[] } {
    try {
      this.validateQuery();
      this.parameters = [];

      const parts: string[] = [];

      // SELECT
      parts.push(`SELECT ${this.selectedColumns.join(', ')}`);

      // FROM
      parts.push(`FROM ${this.fromTable}`);

      // JOIN
      if (this.joinConditions.length > 0) {
        parts.push(this.buildJoinClauses());
      }

      // WHERE
      if (this.whereConditions.length > 0) {
        parts.push(this.buildWhereClauses('WHERE'));
      }

      // GROUP BY
      if (this.groupByColumns.length > 0) {
        parts.push(`GROUP BY ${this.groupByColumns.join(', ')}`);
      }

      // HAVING
      if (this.havingConditions.length > 0) {
        parts.push(this.buildWhereClauses('HAVING'));
      }

      // ORDER BY
      if (this.orderByColumns.length > 0) {
        parts.push(
          `ORDER BY ${this.orderByColumns.map(col => `${col.column} ${col.direction}`).join(', ')}`
        );
      }

      // LIMIT & OFFSET
      if (this.limitValue !== undefined) {
        parts.push(`LIMIT ${this.limitValue}`);
      }
      if (this.offsetValue !== undefined) {
        parts.push(`OFFSET ${this.offsetValue}`);
      }

      const sql = parts.join(' ');
      this.logger.debug('Built query', { sql, params: this.parameters });

      return {
        sql,
        params: this.parameters,
      };
    } catch (error) {
      this.logger.error('Failed to build query', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to build query',
        'build',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Validate query
   */
  protected validateQuery(): void {
    if (!this.fromTable) {
      throw createError(ErrorCodes.STORAGE_ERROR, 'FROM clause is required', 'validateQuery');
    }
  }

  /**
   * Build join clauses
   */
  protected buildJoinClauses(): string {
    return this.joinConditions
      .map(
        join => `${join.type} JOIN ${join.table} ON ${join.on.leftColumn} = ${join.on.rightColumn}`
      )
      .join(' ');
  }

  /**
   * Build where/having clauses
   */
  protected buildWhereClauses(type: 'WHERE' | 'HAVING', conditions?: WhereCondition[]): string {
    const clauseConditions =
      conditions || (type === 'WHERE' ? this.whereConditions : this.havingConditions);

    const clauses = clauseConditions.map(condition => {
      const { column, operator, value } = condition;
      let clause: string;

      switch (operator) {
        case 'IS NULL':
        case 'IS NOT NULL':
          clause = `${column} ${operator}`;
          break;

        case 'IN':
        case 'NOT IN': {
          if (!Array.isArray(value)) {
            throw createError(
              ErrorCodes.STORAGE_ERROR,
              `${operator} requires array value`,
              'buildWhereClauses'
            );
          }
          const placeholders = value.map(() => '?').join(', ');
          this.parameters.push(...value);
          clause = `${column} ${operator} (${placeholders})`;
          break;
        }

        case 'BETWEEN': {
          if (!Array.isArray(value) || value.length !== 2) {
            throw createError(
              ErrorCodes.STORAGE_ERROR,
              'BETWEEN requires array of 2 values',
              'buildWhereClauses'
            );
          }
          this.parameters.push(value[0], value[1]);
          clause = `${column} BETWEEN ? AND ?`;
          break;
        }

        default:
          this.parameters.push(value as SqlParameter);
          clause = `${column} ${operator} ?`;
          break;
      }

      return clause;
    });

    return `${type} ${clauses.join(' AND ')}`;
  }
}
