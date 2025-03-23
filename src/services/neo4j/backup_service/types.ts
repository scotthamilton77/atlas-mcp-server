/**
 * Backup service types module
 */
import { 
  Neo4jKnowledge,
  Neo4jProject,
  Neo4jTask
} from '../types.js';

/**
 * Neo4j relationship representation for backup/restore
 * Captures the essential data needed to recreate relationships between entities
 */
export interface Neo4jRelationship {
  /** ID of the source entity */
  sourceId: string;
  /** Node label of the source entity (e.g., 'Project', 'Task') */
  sourceLabel: string;
  /** Relationship type (e.g., 'DEPENDS_ON', 'CONTAINS_TASK') */
  type: string;
  /** ID of the target entity */
  targetId: string;
  /** Node label of the target entity */
  targetLabel: string;
  /** Optional relationship properties */
  properties?: Record<string, any>;
}

/**
 * Configuration options for database backup
 */
export interface BackupOptions {
  /** Path where the backup file should be stored */
  destinationPath: string;
  /** Include project data in backup (Default: true) */
  includeProjects?: boolean;
  /** Include task data in backup (Default: true) */
  includeTasks?: boolean;
  /** Include knowledge data in backup (Default: true) */
  includeKnowledge?: boolean;
  /** Level of compression for the backup file (0-9) */
  compressionLevel?: number;
  /** Encrypt the backup file (Default: false) */
  encryptBackup?: boolean;
  /** Schedule parameters for automated backups */
  scheduleBackup?: {
    /** How often to run backups */
    frequency: 'daily' | 'weekly' | 'monthly';
    /** Number of days to retain backup files */
    retentionPeriod: number;
    /** Maximum number of backup files to keep */
    maxBackups: number;
  };
  /** Include relationship data in backup (Default: true) */
  includeRelationships?: boolean;
}

/**
 * Result of a backup operation
 */
export interface BackupResult {
  /** Success status of the operation */
  success: boolean;
  /** Timestamp when the backup was created */
  timestamp: string;
  /** Filename of the backup */
  filename: string;
  /** Size of the backup file in bytes */
  size: number;
  /** Count of entities in the backup */
  entities: {
    projects: number;
    tasks: number;
    knowledge: number;
    relationships: number;
  };
  /** Error message if operation failed */
  error?: string;
}

/**
 * Import options for restoring a backup
 */
export interface ImportOptions {
  /** Path to the backup file */
  backupPath: string;
  /** Clear existing database before import (Default: false) */
  clearDatabase?: boolean;
  /** Merge with existing data instead of replacing (Default: false) */
  mergeData?: boolean;
  /** Include project data in import (Default: true) */
  includeProjects?: boolean;
  /** Include task data in import (Default: true) */
  includeTasks?: boolean;
  /** Include knowledge data in import (Default: true) */
  includeKnowledge?: boolean;
  /** Include relationship data in import (Default: true) */
  includeRelationships?: boolean;
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  /** Success status of the operation */
  success: boolean;
  /** Timestamp when the import was performed */
  timestamp: string;
  /** Count of entities imported */
  entitiesImported: {
    projects: number;
    tasks: number;
    knowledge: number;
    relationships: number;
  };
  /** Count of entities that already existed and were updated */
  entitiesUpdated?: {
    projects: number;
    tasks: number;
    knowledge: number;
    relationships: number;
  };
  /** Error message if operation failed */
  error?: string;
}

/**
 * Database backup data structure
 */
export interface BackupData {
  metadata: {
    timestamp: string;
    version: string;
    databaseInfo?: {
      neo4jVersion?: string;
      dbName?: string;
    };
  };
  projects: Neo4jProject[];
  tasks: Neo4jTask[];
  knowledge: Neo4jKnowledge[];
  relationships: Neo4jRelationship[];
}

/**
 * File management options for backup retention
 */
export interface RetentionOptions {
  frequency: 'daily' | 'weekly' | 'monthly';
  retentionPeriod: number;
  maxBackups: number;
}

/**
 * Verify backup result
 */
export interface VerifyBackupResult {
  valid: boolean;
  metadata?: {
    timestamp: string;
    version: string;
    entityCounts: {
      projects: number;
      tasks: number;
      knowledge: number;
      relationships: number;
    };
  };
  error?: string;
}
