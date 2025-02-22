import { BaseErrorCode, ProjectErrorCode, NoteErrorCode, LinkErrorCode, MemberErrorCode } from "../../types/errors.js";
import { BulkOperationError, BulkOperationResult } from "../../utils/bulkOperationManager.js";
import { EntityType } from "../../utils/idGenerator.js";

export type ProjectStatus = 'active' | 'pending' | 'completed' | 'archived';

// Custom ID types
export type CustomId = {
  readonly type: EntityType;
  readonly value: string;
};

export interface Project {
  id: string;  // Legacy ID, kept for backward compatibility
  customId: string;  // Primary identifier for all operations
  entityType: EntityType;  // Added to identify entity type
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectNote {
  id: string;  // Legacy ID, kept for backward compatibility
  customId: string;  // Primary identifier for all operations
  projectId: string;  // References Project.customId
  text: string;
  tags: string[];
  timestamp: string;
}

export interface ProjectLink {
  id: string;  // Legacy ID, kept for backward compatibility
  customId: string;  // Primary identifier for all operations
  projectId: string;  // References Project.customId
  title: string;
  url: string;
  description?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDependency {
  id: string;  // Legacy ID, kept for backward compatibility
  customId: string;  // Primary identifier for all operations
  sourceProjectId: string;  // References Project.customId
  targetProjectId: string;  // References Project.customId
  type: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DependencyDetails extends ProjectDependency {
  sourceProject: {
    id: string;  // Legacy ID
    customId: string;  // Primary identifier
    name: string;
    status: string;
  };
  targetProject: {
    id: string;  // Legacy ID
    customId: string;  // Primary identifier
    name: string;
    status: string;
  };
}

export interface ProjectMember {
  id: string;  // Legacy ID, kept for backward compatibility
  customId: string;  // Primary identifier for all operations
  projectId: string;  // References Project.customId
  userId: string;
  role: string;
  joinedAt: string;
  updatedAt: string;
}

export interface ListProjectsOptions {
  page?: number;
  limit?: number;
}

export interface PaginatedProjects {
  items: Project[];
  total: number;
  page: number;
  limit: number;
}

// Neo4j specific types
export interface Neo4jError extends Error {
  code: string;
}

// Error code type for project operations
export type ProjectOperationErrorCode = BaseErrorCode | ProjectErrorCode | NoteErrorCode | LinkErrorCode | MemberErrorCode;

// Bulk operation result types
export type ProjectInput = Omit<Project, "id" | "customId" | "entityType" | "createdAt" | "updatedAt">;
export type BulkProjectResult = BulkOperationResult<ProjectInput, Project, ProjectOperationErrorCode>;
export type BulkLinkResult = BulkOperationResult<Omit<ProjectLink, "id" | "customId" | "createdAt" | "updatedAt">, ProjectLink, ProjectOperationErrorCode>;
export type BulkDependencyResult = BulkOperationResult<Omit<ProjectDependency, "id" | "customId" | "createdAt" | "updatedAt">, ProjectDependency, ProjectOperationErrorCode>;
export type BulkMemberResult = BulkOperationResult<Omit<ProjectMember, "id" | "customId" | "createdAt" | "updatedAt">, ProjectMember, ProjectOperationErrorCode>;

// Re-export bulk operation types
export { BulkOperationError, BulkOperationResult };