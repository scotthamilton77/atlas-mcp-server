/**
 * Task metadata type definitions
 */

export interface TechnicalRequirements {
  language?: string;
  framework?: string;
  dependencies?: string[];
  environment?: string;
  performance?: {
    memory?: string;
    cpu?: string;
    storage?: string;
  };
  requirements?: string[];
}

export interface Resources {
  toolsUsed?: string[];
  resourcesAccessed?: string[];
  contextUsed?: string[];
}

export interface TaskBlockInfo {
  blockedBy?: string;
  blockReason?: string;
  blockTimestamp?: number;
  unblockTimestamp?: number;
  resolution?: string;
}

export interface VersionControl {
  version?: number;
  branch?: string;
  commit?: string;
  previousVersions?: number[];
}

/**
 * Server-managed task timestamps - not exposed to clients
 */
export interface TaskTimestamps {
  completedAt?: string;
  blockedAt?: string;
  cancelledAt?: string;
  reopenedAt?: string;
  restartedAt?: string;
  statusUpdatedAt?: number;
}

/**
 * Client-facing task metadata
 */
export interface TaskMetadata {
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  reasoning?: string;
  technicalRequirements?: TechnicalRequirements;
  resources?: Resources;
  blockInfo?: TaskBlockInfo;
  versionControl?: VersionControl;
  deliverables?: string[];
  customFields?: Record<string, unknown>;
  [key: string]: unknown;
}
