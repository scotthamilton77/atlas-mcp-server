/**
 * Query optimizer exports
 */

import { SqliteQueryBuilder } from '../builder/sqlite-query-builder.js';
export { SqliteOptimizer } from './sqlite-optimizer.js';

export interface QueryPlan {
  steps: QueryStep[];
  estimatedRows: number;
  usedIndexes: string[];
  cost: number;
}

export interface QueryStep {
  type: 'scan' | 'index' | 'join' | 'filter';
  table: string;
  cost: number;
  details: Record<string, any>;
}

export interface IndexSuggestion {
  table: string;
  columns: string[];
  reason: string;
  estimatedImprovement: number;
}

export interface QueryOptimizer {
  analyze(query: SqliteQueryBuilder): Promise<QueryPlan>;
  suggestIndexes(query: SqliteQueryBuilder): Promise<IndexSuggestion[]>;
  rewrite(query: SqliteQueryBuilder): Promise<SqliteQueryBuilder>;
}
