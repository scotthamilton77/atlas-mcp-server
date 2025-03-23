import { ProjectStatus } from '../../../types/mcp.js';
import { Neo4jProject } from '../../../services/neo4j/types.js';

/**
 * Query parameters for retrieving and filtering projects
 */
export interface ProjectListRequest {
  /** Query mode - 'all' for collection retrieval, 'details' for specific entity */
  mode?: 'all' | 'details';
  
  /** Target project identifier for detailed retrieval (required for mode='details') */
  id?: string;
  
  /** Pagination control - page number (Default: 1) */
  page?: number;
  
  /** Pagination control - results per page, max 100 (Default: 20) */
  limit?: number;
  
  /** Flag to include associated knowledge resources (Default: false) */
  includeKnowledge?: boolean;
  
  /** Flag to include associated task entities (Default: false) */
  includeTasks?: boolean;
  
  /** Filter selector for project classification/category */
  taskType?: string;
  
  /** Filter selector for project lifecycle state */
  status?: 'active' | 'pending' | 'completed' | 'archived' | ('active' | 'pending' | 'completed' | 'archived')[];
}

/**
 * Response structure for project queries
 */
export interface ProjectListResponse {
  /** Collection of projects matching search criteria */
  projects: Project[];
  
  /** Total record count matching criteria (pre-pagination) */
  total: number;
  
  /** Current pagination position */
  page: number;
  
  /** Pagination size setting */
  limit: number;
  
  /** Total available pages for the current query */
  totalPages: number;
}

/**
 * Project entity structure for API responses
 */
export interface Project {
  /** Neo4j internal node identifier */
  identity: number;
  
  /** Neo4j node type designations */
  labels: string[];
  
  /** Core project attributes */
  properties: {
    /** Unique project identifier */
    id: string;
    
    /** Project title */
    name: string;
    
    /** Project scope and objectives */
    description: string;
    
    /** Current lifecycle state */
    status: string;
    
    /** Project classification category */
    taskType: string;
    
    /** Success criteria and definition of done */
    completionRequirements: string;
    
    /** Expected deliverable specification */
    outputFormat: string;
    
    /** Creation timestamp (ISO format) */
    createdAt: string;
    
    /** Last modification timestamp (ISO format) */
    updatedAt: string;
    
    /** Reference materials (serialized or array) */
    urls: string | any[];
  };
  
  /** Neo4j element identifier */
  elementId: string;
  
  /** Parsed reference materials with titles */
  urls: Array<{ title: string, url: string }>;
  
  /** Associated knowledge resources (conditional inclusion) */
  knowledge?: Knowledge[];
  
  /** Associated task entities (conditional inclusion) */
  tasks?: Task[];
}

/**
 * Knowledge resource model for abbreviated references
 */
export interface Knowledge {
  /** Unique knowledge resource identifier */
  id: string;
  
  /** Knowledge content */
  text: string;
  
  /** Taxonomic classification labels */
  tags?: string[];
  
  /** Primary knowledge domain/category */
  domain: string;
  
  /** Resource creation timestamp (ISO format) */
  createdAt: string;
}

/**
 * Task entity model for abbreviated references
 */
export interface Task {
  /** Unique task identifier */
  id: string;
  
  /** Task description */
  title: string;
  
  /** Current workflow state */
  status: string;
  
  /** Task importance classification */
  priority: string;
  
  /** Task creation timestamp (ISO format) */
  createdAt: string;
}
