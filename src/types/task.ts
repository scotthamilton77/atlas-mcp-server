import { TaskStatus as CoreTaskStatus } from './task-core.js';
import { TaskType } from './task-types.js';
import { TaskMetadata } from './task-metadata.js';

// Re-export TaskStatus and TaskType
export { TaskStatus } from './task-core.js';
export { TaskType } from './task-types.js';
export { TaskMetadata } from './task-metadata.js';

/**
 * Status metadata type
 */
export interface StatusMetadata {
  // Common fields
  lastUpdated?: string;

  // IN_PROGRESS
  assignee?: string;
  progress_indicators?: string[];

  // COMPLETED
  completedBy?: string;
  verificationStatus?: 'passed' | 'failed';
  completionChecks?: string[];

  // FAILED
  errorType?: string;
  errorDetails?: string;
  recoveryAttempts?: number;

  // BLOCKED
  blockedBy?: string[];
  blockedReason?: string;
}

/**
 * Task interface
 */
export interface Task {
  id: string;
  path: string;
  name: string;
  type: TaskType;
  status: CoreTaskStatus;
  created: string;
  updated: string;
  version: number;
  projectPath: string;
  description?: string;
  parentPath?: string;
  dependencies: string[];
  metadata: TaskMetadata;
  statusMetadata: StatusMetadata;
  planningNotes: string[];
  progressNotes: string[];
  completionNotes: string[];
  troubleshootingNotes: string[];
  reasoning?: string;
}

/**
 * Task creation input
 */
export interface CreateTaskInput {
  path: string;
  name: string;
  type: TaskType;
  description?: string;
  parentPath?: string;
  dependencies?: string[];
  metadata?: TaskMetadata;
  statusMetadata?: StatusMetadata;
  planningNotes?: string[];
  progressNotes?: string[];
  completionNotes?: string[];
  troubleshootingNotes?: string[];
  reasoning?: string;
}

/**
 * Task update input
 */
export interface UpdateTaskInput {
  name?: string;
  type?: TaskType;
  status?: CoreTaskStatus;
  description?: string;
  parentPath?: string;
  dependencies?: string[];
  metadata?: TaskMetadata;
  statusMetadata?: StatusMetadata;
  planningNotes?: string[];
  progressNotes?: string[];
  completionNotes?: string[];
  troubleshootingNotes?: string[];
  reasoning?: string;
}

/**
 * Task response
 */
export interface TaskResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
  metadata: {
    timestamp: number;
    requestId: string;
    projectPath: string;
    affectedPaths: string[];
  };
}

/**
 * Task constraints
 */
export const CONSTRAINTS = {
  PATH_MAX_LENGTH: 1000,
  NAME_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 2000,
  REASONING_MAX_LENGTH: 2000,
  MAX_DEPENDENCIES: 50,
  MAX_NOTES_PER_CATEGORY: 100,
  NOTE_MAX_LENGTH: 1000,
  MAX_METADATA_SIZE: 102400,
  MAX_PATH_DEPTH: 10,
  MAX_SEGMENT_LENGTH: 100,
  PATH_ALLOWED_CHARS: /^[a-zA-Z0-9-_/]+$/,
  PATH_SEGMENT_PATTERN: /^[a-zA-Z0-9-_]+$/,
  MAX_ARRAY_ITEMS: 100,
  MAX_NOTES: 100,
  METADATA_STRING_MAX_LENGTH: 1000,
};
