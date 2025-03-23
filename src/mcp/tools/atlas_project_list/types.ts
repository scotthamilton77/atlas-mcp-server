import { ProjectStatus } from '../../../types/mcp.js';
import { Neo4jProject } from '../../../services/neo4j/types.js';

/**
 * Request parameters for listing projects
 */
export interface ProjectListRequest {
  /** Listing mode - 'all' for paginated list, 'details' for single project */
  mode?: 'all' | 'details';
  
  /** Project ID to retrieve details for (required for mode='details') */
  id?: string;
  
  /** Page number for paginated results (Default: 1) */
  page?: number;
  
  /** Number of results per page, maximum 100 (Default: 20) */
  limit?: number;
  
  /** Boolean flag to include associated knowledge items (Default: false) */
  includeKnowledge?: boolean;
  
  /** Boolean flag to include associated tasks (Default: false) */
  includeTasks?: boolean;
  
  /** Filter results by project classification */
  taskType?: string;
  
  /** Filter results by project status */
  status?: 'active' | 'pending' | 'completed' | 'archived' | ('active' | 'pending' | 'completed' | 'archived')[];
}

/**
 * Response object for project listing
 */
export interface ProjectListResponse {
  /** Array of projects matching the query criteria */
  projects: Project[];
  
  /** Total number of projects matching the criteria (before pagination) */
  total: number;
  
  /** Current page number */
  page: number;
  
  /** Number of items per page */
  limit: number;
  
  /** Total number of pages */
  totalPages: number;
}

/**
 * Project object returned in responses
 */
export interface Project {
  /** Node identity */
  identity: number;
  
  /** Node labels */
  labels: string[];
  
  /** Project properties */
  properties: {
    /** Unique project ID */
    id: string;
    
    /** Project name */
    name: string;
    
    /** Project description */
    description: string;
    
    /** Current project state */
    status: string;
    
    /** Project classification */
    taskType: string;
    
    /** Completion criteria */
    completionRequirements: string;
    
    /** Output format */
    outputFormat: string;
    
    /** ISO timestamp when the project was created */
    createdAt: string;
    
    /** ISO timestamp when the project was last updated */
    updatedAt: string;
    
    /** URLs as JSON string */
    urls: string | any[];
  };
  
  /** Element ID in Neo4j */
  elementId: string;
  
  /** Parsed URLs */
  urls: Array<{ title: string, url: string }>;
  
  /** Knowledge items associated with this project (if requested) */
  knowledge?: Knowledge[];
  
  /** Tasks associated with this project (if requested) */
  tasks?: Task[];
}

/**
 * Knowledge object for abbreviated results
 */
export interface Knowledge {
  /** Unique identifier for the knowledge item */
  id: string;
  
  /** Main content of the knowledge item */
  text: string;
  
  /** Categorical labels for organization and filtering */
  tags?: string[];
  
  /** Primary knowledge domain */
  domain: string;
  
  /** ISO timestamp when the knowledge item was created */
  createdAt: string;
}

/**
 * Task object for abbreviated results
 */
export interface Task {
  /** Unique identifier for the task */
  id: string;
  
  /** Concise task title */
  title: string;
  
  /** Current task state */
  status: string;
  
  /** Importance level */
  priority: string;
  
  /** ISO timestamp when the task was created */
  createdAt: string;
}
