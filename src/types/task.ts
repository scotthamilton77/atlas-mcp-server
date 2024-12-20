/**
 * Task-related type definitions
 */

/**
 * Task status enumeration
 */
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BLOCKED = 'blocked'
}

/**
 * Task type enumeration
 */
export enum TaskType {
  TASK = 'task',
  MILESTONE = 'milestone',
  GROUP = 'group'
}

/**
 * Note type enumeration
 */
export enum NoteType {
  TEXT = 'text',
  CODE = 'code',
  JSON = 'json',
  MARKDOWN = 'markdown'
}

/**
 * Task note interface
 */
export interface TaskNote {
  type: NoteType;
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Task reasoning interface
 */
export interface TaskReasoning {
  approach?: string;
  assumptions?: string[];
  alternatives?: string[];
  risks?: string[];
  tradeoffs?: string[];
  constraints?: string[];
  dependencies_rationale?: string[];
  impact_analysis?: string[];
}

/**
 * Task metadata interface
 */
export interface TaskMetadata {
  context?: string;
  tags?: string[];
  created: string;
  updated: string;
  sessionId: string;
  version?: string;  // Added for storage versioning
}

/**
 * Task interface
 */
export interface Task {
  id: string;
  parentId: string | null;
  name: string;
  description?: string;
  type: TaskType;
  status: TaskStatus;
  notes?: TaskNote[];
  reasoning?: TaskReasoning;
  dependencies: string[];
  subtasks: string[]; // Store IDs instead of Task objects
  metadata: TaskMetadata;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Task with resolved subtasks
 */
export interface TaskWithSubtasks extends Omit<Task, 'subtasks'> {
  subtasks: Task[];
}

/**
 * Task creation input
 */
export interface CreateTaskInput {
  name: string;
  parentId?: string | null;
  description?: string;
  notes?: TaskNote[];
  reasoning?: TaskReasoning;
  type?: TaskType;
  dependencies?: string[];
  metadata?: {
    context?: string;
    tags?: string[];
    [key: string]: unknown;
  };
  subtasks?: CreateTaskInput[];
}

/**
 * Bulk task creation input
 */
export interface BulkCreateTaskInput {
  parentId: string | null;
  tasks: CreateTaskInput[];
}

/**
 * Task update input
 */
export interface UpdateTaskInput {
  name?: string;
  description?: string;
  notes?: TaskNote[];
  reasoning?: TaskReasoning;
  type?: TaskType;
  status?: TaskStatus;
  dependencies?: string[];
  metadata?: {
    context?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

/**
 * Bulk task update input
 */
export interface BulkUpdateTasksInput {
  updates: {
    taskId: string;
    updates: UpdateTaskInput;
  }[];
}

/**
 * Task operation logging context
 */
export interface TaskOperationContext {
  taskId: string;
  operation: 'create' | 'update' | 'delete' | 'status_change' | 'dependency_check';
  status?: TaskStatus;
  parentId?: string | null;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Task operation response
 */
export interface TaskResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    timestamp: string;
    requestId: string;
    sessionId: string;
    affectedTasks?: string[];
    transactionId?: string;
  };
}

/**
 * Root task utilities
 */
export function getRootId(sessionId: string): string {
  return `ROOT-${sessionId}`;
}

export function isRootTask(taskId: string): boolean {
  return taskId.startsWith('ROOT-');
}
