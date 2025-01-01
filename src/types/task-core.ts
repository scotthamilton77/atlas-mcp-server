/**
 * Core task type definitions and interfaces
 */
import { TaskType } from './task-types.js';

/**
 * Core task identification fields
 */
export interface CoreIdentification {
  path: string;
  name: string;
  type: TaskType;
  version: number;
  projectPath: string;
}

/**
 * Status-specific metadata
 */
export interface StatusMetadata {
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
 * Task documentation fields
 */
export interface Documentation {
  description?: string;
  reasoning?: string;

  planningNotes: string[];
  progressNotes: string[];
  completionNotes: string[];
  troubleshootingNotes: string[];
}

/**
 * Classification metadata
 */
export interface ClassificationMetadata {
  category?: string;
  component?: string;
  platform?: string;
  scope?: string;
  tags?: string[];
}

/**
 * Priority metadata
 */
export interface PriorityMetadata {
  priority?: 'low' | 'medium' | 'high';
  criticality?: string;
  impact?: string;
}

/**
 * Technical metadata
 */
export interface TechnicalMetadata {
  language?: string;
  framework?: string;
  tools?: string[];
  technicalRequirements?: {
    requirements?: string[];
  };
}

/**
 * Quality metadata
 */
export interface QualityMetadata {
  testingRequirements?: string[];
  qualityMetrics?: {
    coverage: number;
    complexity: number;
    performance: string[];
  };
}

/**
 * Template reference metadata
 */
export interface TemplateRefMetadata {
  template: string;
  variables: Record<string, unknown>;
}

/**
 * Combined task metadata
 */
export interface TaskMetadata
  extends ClassificationMetadata,
    PriorityMetadata,
    TechnicalMetadata,
    QualityMetadata {
  templateRef?: TemplateRefMetadata;
  [key: string]: any;
}

/**
 * Validation constraints
 */
export const VALIDATION_CONSTRAINTS = {
  // Path validation
  PATH_MAX_LENGTH: 255,
  MAX_PATH_DEPTH: 7,
  MAX_SEGMENT_LENGTH: 50,
  PATH_SEGMENT_PATTERN: /^[a-zA-Z][a-zA-Z0-9-_]*$/,
  PATH_ALLOWED_CHARS: /^[a-zA-Z0-9-_/]+$/,

  // Field length constraints
  NAME_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 2000,
  REASONING_MAX_LENGTH: 2000,
  NOTE_MAX_LENGTH: 2000,
  METADATA_STRING_MAX_LENGTH: 1000,

  // Array size constraints
  MAX_NOTES_PER_CATEGORY: 25,
  MAX_DEPENDENCIES: 50,
  MAX_TAGS: 10,
  MAX_ARRAY_ITEMS: 100,

  // Size constraints
  MAX_METADATA_SIZE: 32768, // 32KB
} as const;

/**
 * Task status enum
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED',
}

/**
 * Main task interface
 */
export interface Task extends CoreIdentification {
  // Status
  status: TaskStatus;
  statusMetadata: StatusMetadata;

  // Documentation
  description?: string;
  reasoning?: string;
  planningNotes: string[];
  progressNotes: string[];
  completionNotes: string[];
  troubleshootingNotes: string[];

  // Relationships
  dependencies: string[];

  // Metadata
  metadata: TaskMetadata;

  // System fields
  created: string;
  updated: string;
}

/**
 * Task creation input
 */
export interface CreateTaskInput {
  path: string;
  name: string;
  type: TaskType;
  description?: string;
  reasoning?: string;
  parentPath?: string;

  notes?: {
    planning?: string[];
    progress?: string[];
    completion?: string[];
    troubleshooting?: string[];
  };

  dependencies?: string[];
  metadata?: Partial<TaskMetadata>;
}

/**
 * Task update input
 */
export interface UpdateTaskInput {
  name?: string;
  status?: TaskStatus;
  statusMetadata?: Partial<StatusMetadata>;
  description?: string;
  reasoning?: string;

  notes?: {
    planning?: string[];
    progress?: string[];
    completion?: string[];
    troubleshooting?: string[];
  };

  dependencies?: string[];
  metadata?: Partial<TaskMetadata>;
}
