import { Logger } from '../../../logging/index.js';
import { Connection } from '../../connection/index.js';
import { SqliteQueryBuilder } from '../builder/sqlite-query-builder.js';
import { JoinType } from '../builder/query-builder.js';
import { StorageErrorHandler, STORAGE_CONSTANTS, PlatformCapabilities } from '../../utils/index.js';
import { QueryOptimizer } from './index.js';

interface QueryPlan {
  steps: QueryStep[];
  estimatedRows: number;
  usedIndexes: string[];
  cost: number;
}

interface QueryStep {
  type: 'scan' | 'index' | 'join' | 'filter';
  table: string;
  cost: number;
  details: {
    filterType?: 'where' | 'having';
    text?: string;
    indexUsed?: string;
    joinType?: string;
    joinColumn?: string;
    tempTable?: boolean;
    leftColumn?: string;
    rightColumn?: string;
  };
}

interface IndexSuggestion {
  table: string;
  columns: string[];
  reason: string;
  estimatedImprovement: number;
}

/**
 * SQLite query optimizer for analyzing and improving query performance
 */
export class SqliteOptimizer implements QueryOptimizer {
  private readonly logger: Logger;
  private readonly errorHandler: StorageErrorHandler;
  private readonly platformConfig = PlatformCapabilities.getSqliteConfig();
  private readonly maxMemory = PlatformCapabilities.getMaxMemory();
  private readonly isMemoryConstrained = this.maxMemory < 512 * 1024 * 1024; // Less than 512MB

  constructor(private readonly _connection: Connection) {
    this.logger = Logger.getInstance().child({ component: 'SqliteOptimizer' });
    this.errorHandler = new StorageErrorHandler('SqliteOptimizer');
  }

  /**
   * Create a new query builder with platform-specific settings
   */
  private createBuilder(): SqliteQueryBuilder {
    return new SqliteQueryBuilder();
  }

  /**
   * Create a hint query that never executes but includes a unique identifier
   * @param name Used to create unique hint identifiers in optimized queries
   */
  private createHintQuery(name: string): SqliteQueryBuilder {
    const builder = this.createBuilder();

    // Use name to create a unique identifier in the query
    const uniqueIdentifier = `hint_${name}_${Date.now()}`;

    return builder
      .select([`1 as ${uniqueIdentifier}`])
      .from('sqlite_master')
      .where([{ column: '1', operator: '=', value: 0 }]);
  }

  /**
   * Find columns that could benefit from indexes
   */
  private findIndexableColumns(step: QueryStep): string[] {
    const columns: string[] = [];

    // Extract columns from WHERE clauses
    if (step.details.filterType === 'where') {
      const whereMatch = step.details.text?.match(/WHERE (\w+)/);
      if (whereMatch) {
        columns.push(whereMatch[1]);
      }
    }

    // Extract columns from ORDER BY
    const orderMatch = step.details.text?.match(/ORDER BY (\w+)/);
    if (orderMatch) {
      columns.push(orderMatch[1]);
    }

    return columns;
  }

  /**
   * Estimate improvement from adding index
   */
  private estimateIndexImprovement(step: QueryStep): number {
    if (step.type !== 'scan') return 0;

    // Base improvement estimate
    let improvement = 50;

    // Adjust based on step details
    if (step.details.filterType === 'where') {
      improvement += 20; // WHERE clauses benefit more
    }
    if (step.details.text?.includes('ORDER BY')) {
      improvement += 10; // ORDER BY benefits from index
    }

    return Math.min(improvement, 90); // Cap at 90%
  }

  /**
   * Analyze query and generate execution plan
   */
  async analyze(builder: SqliteQueryBuilder): Promise<QueryPlan> {
    let explainSql = 'EXPLAIN QUERY PLAN';
    try {
      const query = builder.build();
      explainSql = `EXPLAIN QUERY PLAN ${query.sql}`;
      interface ExplainRow {
        detail: string;
        tbl_name: string;
      }
      const planRows = await this._connection.execute<ExplainRow[]>(explainSql);

      // Parse plan rows into structured format
      const steps = this.parsePlanRows(planRows);

      // Calculate metrics
      const estimatedRows = this.calculateEstimatedRows(steps);
      const usedIndexes = this.extractUsedIndexes(steps);
      const cost = this.calculateQueryCost(steps);

      const plan: QueryPlan = {
        steps,
        estimatedRows,
        usedIndexes,
        cost,
      };

      this.logger.debug('Query plan analyzed', { sql: query.sql, plan });

      return plan;
    } catch (error) {
      this.errorHandler.handleQueryError(error, explainSql);
    }
  }

  /**
   * Suggest indexes for query optimization
   */
  async suggestIndexes(builder: SqliteQueryBuilder): Promise<IndexSuggestion[]> {
    try {
      const suggestions: IndexSuggestion[] = [];
      const plan = await this.analyze(builder);

      // Find table scans that could benefit from indexes
      for (const step of plan.steps) {
        if (step.type === 'scan') {
          const columns = this.findIndexableColumns(step);
          if (columns.length > 0) {
            suggestions.push({
              table: step.table,
              columns,
              reason: 'Table scan detected',
              estimatedImprovement: this.estimateIndexImprovement(step),
            });
          }
        }
      }

      // Check for join operations without indexes
      const joinSteps = plan.steps.filter(step => step.type === 'join');
      for (const join of joinSteps) {
        if (!join.details.indexUsed) {
          const joinColumn = join.details.joinColumn;
          if (joinColumn) {
            suggestions.push({
              table: join.table,
              columns: [joinColumn],
              reason: 'Join without index',
              estimatedImprovement: 50, // Estimated improvement for indexed joins
            });
          }
        }
      }

      this.logger.debug('Generated index suggestions', { suggestions });

      return suggestions;
    } catch (error) {
      throw this.errorHandler.handleError(error, 'suggestIndexes');
    }
  }

  /**
   * Rewrite query for better performance
   */
  async rewrite(builder: SqliteQueryBuilder): Promise<SqliteQueryBuilder> {
    try {
      const plan = await this.analyze(builder);

      // Apply optimizations based on analysis
      const optimized = this.applyOptimizations(plan);

      // Copy original query properties
      optimized.select(builder.getSelectedColumns());
      if (builder.getFromTable()) {
        optimized.from(builder.getFromTable()!);
      }

      this.logger.debug('Query rewritten', {
        original: builder.build().sql,
        optimized: optimized.build().sql,
      });

      return optimized;
    } catch (error) {
      this.errorHandler.handleError(error, 'rewrite');
    }
  }

  /**
   * Parse SQLite explain plan rows into structured format
   */
  private parsePlanRows(rows: { detail?: string; tbl_name?: string }[]): QueryStep[] {
    return rows.map(row => {
      const details: QueryStep['details'] = {};
      let type: QueryStep['type'] = 'scan';

      // Parse SQLite plan output format
      const planText = row.detail || '';

      if (planText.includes('USING INDEX')) {
        type = 'index';
        details.indexUsed = planText.match(/USING INDEX (\w+)/)?.[1];
      } else if (planText.includes('JOIN')) {
        type = 'join';
        details.joinType = planText.match(/(\w+ JOIN)/)?.[1];
        details.joinColumn = planText.match(/USING (\w+)/)?.[1];
      } else if (planText.includes('FILTER')) {
        type = 'filter';
        details.filterType = planText.includes('WHERE') ? 'where' : 'having';
      }

      return {
        type,
        table: row.tbl_name || '',
        cost: this.estimateStepCost(type, planText),
        details,
      };
    });
  }

  /**
   * Calculate estimated number of rows
   */
  private calculateEstimatedRows(steps: QueryStep[]): number {
    // Use highest row estimate from steps
    // Use platform-specific page size for better estimates
    const pageSize = this.platformConfig.pageSize;
    const maxRowsPerPage = Math.floor(pageSize / 100); // Assume average row size of 100 bytes

    return Math.max(
      ...steps.map(step => {
        switch (step.type) {
          case 'scan':
            return maxRowsPerPage * 100; // Assume 100 pages for table scan
          case 'index':
            return maxRowsPerPage * 10; // Assume 10 pages for index scan
          case 'filter':
            return maxRowsPerPage; // Assume 1 page for filtered results
          default:
            return 1;
        }
      })
    );
  }

  /**
   * Extract used indexes from plan
   */
  private extractUsedIndexes(steps: QueryStep[]): string[] {
    return steps
      .filter(step => step.type === 'index')
      .map(step => step.details.indexUsed)
      .filter((index): index is string => !!index);
  }

  /**
   * Calculate overall query cost
   */
  private calculateQueryCost(steps: QueryStep[]): number {
    // Adjust costs based on platform capabilities
    const platformMultiplier = this.isMemoryConstrained ? 1.5 : 1.0;

    return steps.reduce((total, step) => {
      let stepCost = step.cost;

      // Increase cost for memory-intensive operations on constrained devices
      if (this.isMemoryConstrained) {
        if (step.type === 'scan' && !step.details.indexUsed) {
          stepCost *= 2; // Full table scans are more expensive
        }
        if (step.details.tempTable) {
          stepCost *= 1.5; // Temp tables are more expensive
        }
      }

      // Adjust for platform-specific optimizations
      if (this.platformConfig.sharedMemory && step.type === 'index') {
        stepCost *= 0.8; // Indexes are more efficient with shared memory
      }

      return total + stepCost * platformMultiplier;
    }, 0);
  }

  /**
   * Estimate cost for a plan step
   */
  private estimateStepCost(type: QueryStep['type'], planText: string): number {
    // Base costs adjusted for platform capabilities
    const baseCosts = {
      scan: this.isMemoryConstrained ? 150 : 100,
      index: this.platformConfig.sharedMemory ? 8 : 10,
      join: {
        indexed: this.platformConfig.sharedMemory ? 15 : 20,
        nonIndexed: this.isMemoryConstrained ? 75 : 50,
      },
      filter: this.isMemoryConstrained ? 8 : 5,
    };

    switch (type) {
      case 'scan': {
        // Adjust scan cost based on estimated table size
        const estimatedRows = this.extractRowEstimate(planText);
        const rowCost = this.isMemoryConstrained ? 0.1 : 0.05;
        return baseCosts.scan + estimatedRows * rowCost;
      }

      case 'index':
        // Adjust index cost based on index type
        if (planText.includes('COVERING INDEX')) {
          return baseCosts.index * 0.8; // Covering indexes are more efficient
        }
        return baseCosts.index;

      case 'join':
        if (planText.includes('USING INDEX')) {
          return baseCosts.join.indexed;
        }
        // Nested loop joins are especially expensive on memory-constrained devices
        if (planText.includes('NESTED LOOP') && this.isMemoryConstrained) {
          return baseCosts.join.nonIndexed * 1.5;
        }
        return baseCosts.join.nonIndexed;

      case 'filter':
        // Adjust filter cost based on operation type
        if (planText.includes('LIKE') || planText.includes('GLOB')) {
          return baseCosts.filter * 1.5; // Pattern matching is more expensive
        }
        return baseCosts.filter;

      default:
        return 1;
    }
  }

  /**
   * Extract estimated number of rows from plan text
   */
  private extractRowEstimate(planText: string): number {
    const match = planText.match(/rows=(\d+)/i);
    return match ? parseInt(match[1], 10) : 1000; // Default estimate
  }

  /**
   * Apply platform-specific optimizations to query
   */
  private applyOptimizations(plan: QueryPlan): SqliteQueryBuilder {
    const optimizedBuilder = this.createBuilder();

    // Reorder joins based on cost
    const joinSteps = plan.steps.filter(step => step.type === 'join');
    joinSteps.sort((a, b) => a.cost - b.cost);

    // Apply optimized join order
    for (const step of joinSteps) {
      optimizedBuilder.join([
        {
          type: (step.details.joinType?.replace(' JOIN', '') || 'INNER') as JoinType,
          table: step.table,
          on: {
            leftColumn: step.details.leftColumn || '',
            rightColumn: step.details.rightColumn || '',
          },
        },
      ]);
    }

    // Add index hints where beneficial
    const indexSteps = plan.steps.filter(step => step.type === 'index');
    for (const step of indexSteps) {
      if (step.details.indexUsed) {
        const indexHint = this.createHintQuery(`idx_${step.details.indexUsed}`);
        optimizedBuilder.with(`idx_${step.details.indexUsed}`, indexHint);
      }
    }

    // Handle large result sets based on platform capabilities
    if (plan.estimatedRows > STORAGE_CONSTANTS.MAX_VARIABLES) {
      const tempTable = this.createBuilder();

      if (this.isMemoryConstrained) {
        // Use disk-based temp tables on memory-constrained devices
        tempTable.from('temp.large_results');

        // Add chunking hints
        const chunkSize = Math.floor(this.maxMemory / (plan.estimatedRows * 100));
        const hintBuilder = this.createHintQuery(`chunk_size_${chunkSize}`);

        optimizedBuilder
          .with(`chunk_size_${chunkSize}`, hintBuilder)
          .with('temp_large_result', tempTable);
      } else if (this.platformConfig.sharedMemory) {
        // Use memory tables with shared memory
        tempTable.from('temp.large_results');
        const memoryHint = this.createHintQuery('memory_table');

        optimizedBuilder.with('memory_table', memoryHint).with('temp_large_result', tempTable);
      } else {
        // Use regular temp tables
        const diskHint = this.createHintQuery('disk_table');

        optimizedBuilder.with('disk_table', diskHint).with('temp_large_result', tempTable);
      }
    }

    return optimizedBuilder;
  }
}
