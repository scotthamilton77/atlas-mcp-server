/**
 * Project-related type definitions
 */

/**
 * Project status enumeration
 */
export enum ProjectStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  COMPLETED = 'completed',
}

/**
 * Project metadata interface
 */
export interface ProjectMetadata {
  created: number;
  updated: number;
  owner: string;
  tags?: string[];
  status: ProjectStatus;
  version: number;
  description?: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: number;
  customFields?: Record<string, unknown>;
}

/**
 * Project interface
 */
export interface Project {
  path: string; // Unique project identifier (e.g., "auth-system")
  name: string; // Display name
  description?: string;
  metadata: ProjectMetadata;
  rootTaskPaths: string[]; // Top-level task paths
}

/**
 * Project creation input
 */
export interface CreateProjectInput {
  path: string;
  name: string;
  description?: string;
  metadata?: {
    owner?: string;
    tags?: string[];
    category?: string;
    priority?: 'low' | 'medium' | 'high';
    dueDate?: number;
    customFields?: Record<string, unknown>;
  };
}

/**
 * Project update input
 */
export interface UpdateProjectInput {
  name?: string;
  description?: string;
  metadata?: Partial<Omit<ProjectMetadata, 'created' | 'updated' | 'version'>>;
}

/**
 * Project operation response
 */
export interface ProjectResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    timestamp: number;
    requestId: string;
    projectPath: string;
    affectedTasks?: string[];
    transactionId?: string;
  };
}

/**
 * Project validation utilities
 */
export const PROJECT_PATH_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
export const MAX_PROJECT_PATH_LENGTH = 64;
export const MAX_PROJECT_NAME_LENGTH = 100;
export const MAX_PROJECT_DESCRIPTION_LENGTH = 1000;

export function validateProjectPath(path: string): boolean {
  return (
    PROJECT_PATH_REGEX.test(path) && path.length <= MAX_PROJECT_PATH_LENGTH && !path.includes('/')
  );
}

export function validateProjectName(name: string): boolean {
  return name.trim().length > 0 && name.length <= MAX_PROJECT_NAME_LENGTH;
}

export function validateProjectDescription(description?: string): boolean {
  return !description || description.length <= MAX_PROJECT_DESCRIPTION_LENGTH;
}

/**
 * Project error codes
 */
export enum ProjectErrorCode {
  INVALID_PATH = 'PROJECT_INVALID_PATH',
  INVALID_NAME = 'PROJECT_INVALID_NAME',
  INVALID_DESCRIPTION = 'PROJECT_INVALID_DESCRIPTION',
  DUPLICATE_PATH = 'PROJECT_DUPLICATE_PATH',
  NOT_FOUND = 'PROJECT_NOT_FOUND',
  ARCHIVED = 'PROJECT_ARCHIVED',
  INVALID_STATUS = 'PROJECT_INVALID_STATUS',
  INVALID_METADATA = 'PROJECT_INVALID_METADATA',
}
