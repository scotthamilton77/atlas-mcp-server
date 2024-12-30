/**
 * Shared types for tools
 */
import { TaskType } from '../types/task.js';

export interface Tool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    description?: string;
  };
}

export interface ToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export interface BulkOperation {
  type: 'create' | 'update' | 'delete';
  path: string;
  data?: {
    name?: string;
    type?: TaskType;
    description?: string;
    parentPath?: string;
    dependencies?: string[];
    metadata?: Record<string, unknown>;
    notes?: string[];
    status?: string;
  };
  id?: string;
  dependencies?: string[];
}
