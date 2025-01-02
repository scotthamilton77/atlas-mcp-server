import {
  BaseQueryBuilder,
  SqlParameter,
  WhereCondition,
  JoinCondition,
  OrderByColumn,
} from './query-builder.js';
import { createError, ErrorCodes } from '../../../errors/index.js';

/**
 * SQLite-specific query builder implementation
 */
export class SqliteQueryBuilder extends BaseQueryBuilder {
  protected withClauses: Array<{
    name: string;
    builder: SqliteQueryBuilder;
  }> = [];
  private isUnion = false;
  private unionQueries: SqliteQueryBuilder[] = [];
  private isInsertOrReplace = false;

  constructor() {
    super('SqliteQueryBuilder');
  }

  /**
   * Get selected columns
   */
  getSelectedColumns(): string[] {
    return [...this.selectedColumns];
  }

  /**
   * Get from table
   */
  getFromTable(): string | undefined {
    return this.fromTable;
  }

  /**
   * Override base methods to return SqliteQueryBuilder
   */
  override select(columns: string[]): SqliteQueryBuilder {
    super.select(columns);
    return this;
  }

  override from(table: string): SqliteQueryBuilder {
    super.from(table);
    return this;
  }

  override where(conditions: WhereCondition[]): SqliteQueryBuilder {
    super.where(conditions);
    return this;
  }

  override join(conditions: JoinCondition[]): SqliteQueryBuilder {
    super.join(conditions);
    return this;
  }

  override groupBy(columns: string[]): SqliteQueryBuilder {
    super.groupBy(columns);
    return this;
  }

  override having(conditions: WhereCondition[]): SqliteQueryBuilder {
    super.having(conditions);
    return this;
  }

  override orderBy(columns: OrderByColumn[]): SqliteQueryBuilder {
    super.orderBy(columns);
    return this;
  }

  override limit(limit: number): SqliteQueryBuilder {
    super.limit(limit);
    return this;
  }

  override offset(offset: number): SqliteQueryBuilder {
    super.offset(offset);
    return this;
  }

  /**
   * Add WITH clause (Common Table Expression)
   */
  with(name: string, builder: SqliteQueryBuilder): SqliteQueryBuilder {
    this.withClauses.push({ name, builder });
    return this;
  }

  /**
   * Add UNION clause
   */
  union(builder: SqliteQueryBuilder): SqliteQueryBuilder {
    this.isUnion = true;
    this.unionQueries.push(builder);
    return this;
  }

  /**
   * Create INSERT OR REPLACE query
   */
  insertOrReplace(table: string, columns: string[]): SqliteQueryBuilder {
    this.isInsertOrReplace = true;
    this.fromTable = table;
    this.selectedColumns = columns;
    return this;
  }

  /**
   * Add RETURNING clause
   */
  returning(columns: string[]): SqliteQueryBuilder {
    if (!this.isInsertOrReplace) {
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'RETURNING clause only valid for INSERT/REPLACE',
        'returning'
      );
    }
    this.selectedColumns = columns;
    return this;
  }

  /**
   * Build query with SQLite-specific optimizations
   */
  build(): { sql: string; params: SqlParameter[] } {
    try {
      this.validateQuery();
      this.parameters = [];

      const parts: string[] = [];

      // WITH clauses
      if (this.withClauses.length > 0) {
        parts.push(this.buildWithClauses());
      }

      if (this.isInsertOrReplace) {
        parts.push(this.buildInsertOrReplace());
      } else {
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

        // UNION
        if (this.isUnion) {
          parts.push(this.buildUnionClauses());
        }

        // ORDER BY
        if (this.orderByColumns.length > 0) {
          parts.push(
            `ORDER BY ${this.orderByColumns
              .map(col => `${col.column} ${col.direction}`)
              .join(', ')}`
          );
        }

        // LIMIT & OFFSET
        if (this.limitValue !== undefined) {
          parts.push(`LIMIT ${this.limitValue}`);
        }
        if (this.offsetValue !== undefined) {
          parts.push(`OFFSET ${this.offsetValue}`);
        }
      }

      const sql = parts.join(' ');
      this.logger.debug('Built SQLite query', { sql, params: this.parameters });

      return {
        sql,
        params: this.parameters,
      };
    } catch (error) {
      this.logger.error('Failed to build SQLite query', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to build SQLite query',
        'build',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Build query with async optimizations
   */
  buildAsync?: () => Promise<{ sql: string; params: SqlParameter[] }>;

  /**
   * Build WITH clauses
   */
  private buildWithClauses(): string {
    const ctes = this.withClauses.map(({ name, builder }) => {
      const { sql, params } = builder.build();
      this.parameters.push(...params);
      return `${name} AS (${sql})`;
    });

    return `WITH ${ctes.join(', ')}`;
  }

  /**
   * Build UNION clauses
   */
  private buildUnionClauses(): string {
    return this.unionQueries
      .map(builder => {
        const { sql, params } = builder.build();
        this.parameters.push(...params);
        return `UNION ${sql}`;
      })
      .join(' ');
  }

  /**
   * Build INSERT OR REPLACE
   */
  private buildInsertOrReplace(): string {
    const parts: string[] = [];
    parts.push(`INSERT OR REPLACE INTO ${this.fromTable}`);

    if (this.selectedColumns.length > 0) {
      parts.push(`(${this.selectedColumns.join(', ')})`);

      // Add placeholders for values
      const valuePlaceholders = this.selectedColumns.map(() => '?').join(', ');
      parts.push(`VALUES (${valuePlaceholders})`);
    }

    // Add RETURNING clause if specified
    if (this.selectedColumns.length > 0) {
      parts.push(`RETURNING ${this.selectedColumns.join(', ')}`);
    }

    return parts.join(' ');
  }

  /**
   * Override to add SQLite-specific validation
   */
  protected validateQuery(): void {
    if (!this.isInsertOrReplace) {
      super.validateQuery();
    }

    // Validate UNION queries have same number of columns
    if (this.isUnion) {
      const baseColumns = this.selectedColumns.length;
      const invalidUnion = this.unionQueries.some(
        builder => builder.selectedColumns.length !== baseColumns
      );

      if (invalidUnion) {
        throw createError(
          ErrorCodes.STORAGE_ERROR,
          'UNION queries must have same number of columns',
          'validateQuery'
        );
      }
    }
  }

  /**
   * Override to add SQLite-specific optimizations
   */
  protected buildWhereClauses(type: 'WHERE' | 'HAVING'): string {
    const conditions = type === 'WHERE' ? this.whereConditions : this.havingConditions;

    // Optimize IN clauses with large number of values
    const optimizedConditions = conditions
      .map(condition => {
        if (
          (condition.operator === 'IN' || condition.operator === 'NOT IN') &&
          Array.isArray(condition.value) &&
          condition.value.length > 100
        ) {
          // Split large IN clauses into multiple smaller ones
          return this.optimizeInClause(condition);
        }
        return condition;
      })
      .flat();

    return super.buildWhereClauses(type, optimizedConditions);
  }

  /**
   * Optimize large IN clauses
   */
  private optimizeInClause(condition: WhereCondition): WhereCondition[] {
    const values = condition.value as SqlParameter[];
    const chunkSize = 100;
    const chunks = [];

    for (let i = 0; i < values.length; i += chunkSize) {
      chunks.push(values.slice(i, i + chunkSize));
    }

    return chunks.map(chunk => ({
      ...condition,
      value: chunk,
    }));
  }
}
