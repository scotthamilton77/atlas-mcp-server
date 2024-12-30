/**
 * Task type definitions
 */
export enum TaskType {
  TASK = 'TASK',
  MILESTONE = 'MILESTONE',
}

export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED',
}

/**
 * Core identification fields
 */
export interface CoreIdentification {
  id: string;
  path: string;
  name: string;
  type: TaskType;
  version: number;
  projectPath: string;
}

/**
 * Documentation fields
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
 * Status-specific metadata
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
  requirements?: string[];
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
 * Combined task metadata with required properties
 */
export interface TaskMetadata
  extends ClassificationMetadata,
    PriorityMetadata,
    TechnicalMetadata,
    QualityMetadata {
  [key: string]: any;
}

/**
 * Main task interface
 */
export interface Task extends CoreIdentification, Documentation {
  // Status
  status: TaskStatus;
  statusMetadata: StatusMetadata;

  // Timestamps stored as formatted strings (e.g. "10:00:00 AM 1/28/2024")
  created: string;
  updated: string;

  // Legacy notes field for backward compatibility
  notes: string[]; // Required array, can be empty but not undefined

  // Relationships
  parentPath?: string;
  dependencies: string[]; // Required array, can be empty but not undefined

  // Rich metadata
  metadata: TaskMetadata;
}

export interface CreateTaskInput {
  path: string;
  name: string;
  type: TaskType;
  description?: string;
  parentPath?: string;
  reasoning?: string;

  // Status metadata
  statusMetadata?: Partial<StatusMetadata>;

  // Notes by category
  planningNotes?: string[];
  progressNotes?: string[];
  completionNotes?: string[];
  troubleshootingNotes?: string[];

  // Legacy notes field
  notes?: string[]; // Optional, will be initialized to empty array if undefined

  // Relationships
  dependencies?: string[]; // Optional, will be initialized to empty array if undefined

  // Rich metadata
  metadata?: TaskMetadata;
}

export interface UpdateTaskInput {
  name?: string;
  description?: string;
  type?: TaskType;
  status?: TaskStatus;
  parentPath?: string | null; // Can be null to clear the parent
  reasoning?: string;

  // Status metadata
  statusMetadata?: Partial<StatusMetadata>;

  // Notes by category
  planningNotes?: string[];
  progressNotes?: string[];
  completionNotes?: string[];
  troubleshootingNotes?: string[];

  // Legacy notes field
  notes?: string[]; // Optional, will keep existing if undefined

  // Relationships
  dependencies?: string[]; // Optional, will keep existing if undefined

  // Rich metadata
  metadata?: Partial<TaskMetadata>;
}

export interface TaskMetrics {
  total: number;
  byStatus: Record<TaskStatus, number>;
  noteCount: number;
  dependencyCount: number;
}

export interface TaskValidationError {
  code: string;
  message: string;
  field?: string;
  details?: any;
}

export interface TaskOperationResult {
  success: boolean;
  task?: Task;
  errors?: TaskValidationError[];
}

export interface BulkOperationResult {
  success: boolean;
  results: TaskOperationResult[];
  errors?: TaskValidationError[];
}

export interface TaskResponseMetadata {
  timestamp: number;
  requestId: string;
  projectPath: string;
  affectedPaths: string[];
  pagination?: {
    limit: number;
    offset: number;
  };
  operationCount?: number;
  successCount?: number;
}

export interface TaskResponse<T = Task> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  metadata: TaskResponseMetadata;
}

export const CONSTRAINTS = {
  // Path constraints
  PATH_MAX_LENGTH: 255,
  MAX_PATH_DEPTH: 7,

  // Field length constraints
  NAME_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 2000,
  REASONING_MAX_LENGTH: 2000,
  NOTE_MAX_LENGTH: 2000,
  METADATA_STRING_MAX_LENGTH: 1000,

  // Array size constraints
  MAX_DEPENDENCIES: 50,
  MAX_NOTES: 25, // Per note category
  MAX_ARRAY_ITEMS: 100,
  MAX_TAGS: 10,

  // Size constraints
  MAX_METADATA_SIZE: 32768, // 32KB
} as const;
