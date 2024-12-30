import { TaskManager } from '../../../../task/manager/task-manager.js';
import { Logger } from '../../../../logging/index.js';
import { Tool, ToolResponse } from '../../../../types/tool.js';

/**
 * Base interface for tool implementations
 */
export interface ToolImplementation {
  /** Tool definition */
  definition: Tool;
  /** Tool handler function */
  handler: (args: Record<string, unknown>) => Promise<ToolResponse>;
}

/**
 * Context provided to all tools
 */
export interface ToolContext {
  /** Task manager instance */
  taskManager: TaskManager;
  /** Logger instance */
  logger: Logger;
}

/**
 * Tool factory function type
 */
export type ToolFactory = (context: ToolContext) => ToolImplementation;

/**
 * Schema property definition
 */
export interface SchemaProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
  items?: {
    type: string;
    description?: string;
  };
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

/**
 * Input schema definition
 */
export interface InputSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required?: string[];
  description?: string;
}
