/**
 * Tool types and interfaces
 */
import { JSONSchema7, JSONSchema7Definition } from 'json-schema';

export interface Tool {
  name: string;
  description?: string;
  inputSchema: JSONSchema7;
}

export interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  _meta?: Record<string, unknown>;
}

export interface StorageMetrics {
  tasks: {
    total: number;
    byStatus: {
      PENDING: number;
      IN_PROGRESS: number;
      COMPLETED: number;
      CANCELLED: number;
      BLOCKED: number;
    };
    noteCount: number;
    dependencyCount: number;
  };
  storage: {
    totalSize: number;
    pageSize: number;
    pageCount: number;
    walSize: number;
    cache: {
      hitRate: number;
      memoryUsage: number;
      entryCount: number;
    };
  };
}

export interface TaskMetadata {
  dependencies?: string[];
  [key: string]: unknown;
}

export interface ToolDefinition extends Tool {
  handler: (args: Record<string, unknown>) => Promise<ToolResponse>;
}

export interface SchemaProperties {
  [key: string]: JSONSchema7Definition;
}

export interface InputSchema extends JSONSchema7 {
  properties: SchemaProperties;
}
