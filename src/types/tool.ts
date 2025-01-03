/**
 * Tool-related type definitions
 */
import { TaskType } from './task.js';
import { TemplateVariable, TemplateTask } from './template.js';

/**
 * Agent builder template creation parameters
 */
export interface AgentBuilderTemplateParams {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  variables: TemplateVariable[];
  tasks: TemplateTask[];
}

/**
 * Agent builder template validation result
 */
export interface AgentBuilderValidationResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Tool definition interface
 */
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

/**
 * Tool response interface
 */
export interface ToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * Bulk operation interface for task operations
 */
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
