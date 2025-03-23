# Atlas Platform Reference Guide

## System Overview

### Core Components

**Projects** are the highest-level organizational units in the Atlas Platform that represent complete initiatives with defined goals, timelines, and deliverables. Each project:

- Provides context and structure for all related work
- Serves as a container for tasks and knowledge
- Has specific completion requirements
- Can depend on other projects, enabling complex workflow hierarchies

**Tasks** are discrete units of work that contribute to project completion, representing specific actions, assignments, or deliverables. Tasks:

- Are always associated with a parent project
- Follow a defined lifecycle from backlog to completion
- Can be assigned, prioritized, and categorized
- Can be linked to dependencies to create structured workflows

**Knowledge** represents information assets associated with projects, including research findings, documentation, references, or any valuable information. Knowledge:

- Are tagged and categorized by domain
- Can include citations to external sources
- Create a searchable repository of project-related information

### System Integration

The Atlas Platform integrates these components into a cohesive system:

- **Project-Task Relationship**: Projects contain tasks that represent actionable steps needed to achieve project goals. Tasks inherit context from their parent project while providing granular tracking of individual work items.
- **Knowledge Integration**: Both projects and tasks can be enriched with knowledge, providing team members with necessary information and context.
- **Dependency Management**: Both projects and tasks support dependency relationships, allowing for complex workflows with prerequisites and sequential execution requirements.
- **Unified Search**: The platform provides cross-entity search capabilities, allowing users to find relevant projects, tasks, or knowledge based on various criteria.

## Database Objects

### Project Object

```typescript
/**
 * Represents a complete initiative with defined goals, timelines, and deliverables
 */
interface Project {
  /** Optional client-generated ID; system will generate if not provided */
  id?: string;

  /** Descriptive project name (1-100 characters) */
  name: string;

  /** Comprehensive project overview explaining purpose and scope */
  description: string;

  /** Current project state */
  status: "active" | "pending" | "completed" | "archived";

  /** Relevant URLs with descriptive titles for reference materials */
  urls?: Array<{ title: string; url: string }>;

  /** Specific, measurable criteria that indicate project completion */
  completionRequirements: string;

  /** Array of existing project IDs that must be completed before this project can begin */
  dependencies?: string[];

  /** Required format specification for final project deliverables */
  outputFormat: string;

  /** Classification of project purpose */
  taskType: "research" | "generation" | "analysis" | "integration" | string;

  /** Timestamp when the project was created */
  createdAt: string;

  /** Timestamp when the project was last updated */
  updatedAt: string;
}
```

### Task Object

```typescript
/**
 * Represents a discrete unit of work that contributes to project completion
 */
interface Task {
  /** Optional client-generated ID; system will generate if not provided */
  id?: string;

  /** ID of the parent project this task belongs to */
  projectId: string;

  /** Concise task title clearly describing the objective (5-150 characters) */
  title: string;

  /** Detailed explanation of the task requirements and context */
  description: string;

  /** Importance level */
  priority: "low" | "medium" | "high" | "critical";

  /** Current task state */
  status: "backlog" | "todo" | "in_progress" | "completed";

  /** ID of entity responsible for task completion */
  assignedTo?: string;

  /** Relevant URLs with descriptive titles for reference materials */
  urls?: Array<{ title: string; url: string }>;

  /** Categorical labels for organization and filtering */
  tags?: string[];

  /** Specific, measurable criteria that indicate task completion */
  completionRequirements: string;

  /** Array of existing task IDs that must be completed before this task can begin */
  dependencies?: string[];

  /** Required format specification for task deliverables */
  outputFormat: string;

  /** Classification of task purpose */
  taskType: "research" | "generation" | "analysis" | "integration" | string;

  /** Timestamp when the task was created */
  createdAt: string;

  /** Timestamp when the task was last updated */
  updatedAt: string;
}
```

### Knowledge Object

```typescript
/**
 * Represents information assets associated with projects
 */
interface Knowledge {
  /** Optional client-generated ID; system will generate if not provided */
  id?: string;

  /** ID of the parent project this knowledge belongs to */
  projectId: string;

  /** Main content of the knowledge (can be structured or unstructured) */
  text: string;

  /** Categorical labels for organization and filtering */
  tags?: string[];

  /** Primary knowledge area or discipline */
  domain: "technical" | "business" | "scientific" | string;

  /** Array of reference sources supporting this knowledge (URLs, DOIs, etc.) */
  citations?: string[];

  /** Timestamp when the knowledge was created */
  createdAt: string;

  /** Timestamp when the knowledge was last updated */
  updatedAt: string;
}
```

## API Reference

### Project Management

#### `atlas_project_create`

```typescript
/**
 * Creates a new project or multiple projects in the system
 *
 * @param {ProjectCreateRequest} request - The create project request parameters
 * @returns {Promise<ProjectCreateResponse>} Result containing the created project(s)
 */
interface ProjectCreateRequest {
  /** Operation mode - 'single' for one project, 'bulk' for multiple projects */
  mode?: "single" | "bulk";

  /** Optional client-generated project ID (required for mode='single') */
  id?: string;

  /** Descriptive project name (1-100 characters) (required for mode='single') */
  name?: string;

  /** Comprehensive project overview explaining purpose and scope (required for mode='single') */
  description?: string;

  /** Current project state (Default: active) */
  status?: "active" | "pending" | "completed" | "archived";

  /** Array of relevant URLs with descriptive titles for reference materials */
  urls?: Array<{ title: string; url: string }>;

  /** Specific, measurable criteria that indicate project completion (required for mode='single') */
  completionRequirements?: string;

  /** Array of existing project IDs that must be completed before this project can begin */
  dependencies?: string[];

  /** Required format specification for final project deliverables (required for mode='single') */
  outputFormat?: string;

  /** Classification of project purpose (required for mode='single') */
  taskType?: "research" | "generation" | "analysis" | "integration" | string;

  /** Array of project objects with the above fields (required for mode='bulk') */
  projects?: Partial<Project>[];
}
```

#### `atlas_project_update`

```typescript
/**
 * Updates existing project(s) in the system
 *
 * @param {ProjectUpdateRequest} request - The update project request parameters
 * @returns {Promise<ProjectUpdateResponse>} Result containing the updated project(s)
 */
interface ProjectUpdateRequest {
  /** Operation mode - 'single' for one project, 'bulk' for multiple projects */
  mode?: "single" | "bulk";

  /** Existing project ID to update (required for mode='single') */
  id?: string;

  /** Object containing fields to modify (only specified fields will be updated) (required for mode='single') */
  updates?: Partial<Project>;

  /** Array of project updates, each containing an ID and updates object (required for mode='bulk') */
  projects?: Array<{
    id: string;
    updates: Partial<Project>;
  }>;
}
```

#### `atlas_project_delete`

```typescript
/**
 * Deletes existing project(s) from the system
 *
 * @param {ProjectDeleteRequest} request - The delete project request parameters
 * @returns {Promise<ProjectDeleteResponse>} Result confirming deletion
 */
interface ProjectDeleteRequest {
  /** Operation mode - 'single' for one project, 'bulk' for multiple projects */
  mode?: "single" | "bulk";

  /** Project ID to delete (required for mode='single') */
  id?: string;

  /** Array of project IDs to delete (required for mode='bulk') */
  projectIds?: string[];
}
```

#### `atlas_project_list`

```typescript
/**
 * Lists projects according to specified filters
 *
 * @param {ProjectListRequest} request - The list projects request parameters
 * @returns {Promise<ProjectListResponse>} Result containing matched projects
 */
interface ProjectListRequest {
  /** Listing mode - 'all' for paginated list, 'details' for single project */
  mode?: "all" | "details";

  /** Project ID to retrieve details for (required for mode='details') */
  id?: string;

  /** Page number for paginated results (Default: 1) */
  page?: number;

  /** Number of results per page, maximum 100 (Default: 20) */
  limit?: number;

  /** Boolean flag to include associated knowledge (Default: false) */
  includeKnowledge?: boolean;

  /** Boolean flag to include associated tasks (Default: false) */
  includeTasks?: boolean;

  /** Filter results by project classification */
  taskType?: string;

  /** Filter results by project status */
  status?: "active" | "pending" | "completed" | "archived";
}
```

### Task Management

#### `atlas_task_create`

```typescript
/**
 * Creates a new task or multiple tasks in the system
 *
 * @param {TaskCreateRequest} request - The create task request parameters
 * @returns {Promise<TaskCreateResponse>} Result containing the created task(s)
 */
interface TaskCreateRequest {
  /** Operation mode - 'single' for one task, 'bulk' for multiple tasks */
  mode?: "single" | "bulk";

  /** Optional client-generated task ID */
  id?: string;

  /** ID of the parent project this task belongs to (required for mode='single') */
  projectId?: string;

  /** Concise task title clearly describing the objective (5-150 characters) (required for mode='single') */
  title?: string;

  /** Detailed explanation of the task requirements and context (required for mode='single') */
  description?: string;

  /** Importance level (Default: medium) */
  priority?: "low" | "medium" | "high" | "critical";

  /** Current task state (Default: todo) */
  status?: "backlog" | "todo" | "in_progress" | "completed";

  /** ID of entity responsible for task completion */
  assignedTo?: string;

  /** Array of relevant URLs with descriptive titles for reference materials */
  urls?: Array<{ title: string; url: string }>;

  /** Array of categorical labels for organization and filtering */
  tags?: string[];

  /** Specific, measurable criteria that indicate task completion (required for mode='single') */
  completionRequirements?: string;

  /** Array of existing task IDs that must be completed before this task can begin */
  dependencies?: string[];

  /** Required format specification for task deliverables (required for mode='single') */
  outputFormat?: string;

  /** Classification of task purpose (required for mode='single') */
  taskType?: "research" | "generation" | "analysis" | "integration" | string;

  /** Array of task objects with the above fields (required for mode='bulk') */
  tasks?: Partial<Task>[];
}
```

#### `atlas_task_update`

```typescript
/**
 * Updates existing task(s) in the system
 *
 * @param {TaskUpdateRequest} request - The update task request parameters
 * @returns {Promise<TaskUpdateResponse>} Result containing the updated task(s)
 */
interface TaskUpdateRequest {
  /** Operation mode - 'single' for one task, 'bulk' for multiple tasks */
  mode?: "single" | "bulk";

  /** Existing task ID to update (required for mode='single') */
  id?: string;

  /** Object containing fields to modify (only specified fields will be updated) (required for mode='single') */
  updates?: Partial<Task>;

  /** Array of task updates, each containing a taskId and updates object (required for mode='bulk') */
  tasks?: Array<{
    id: string;
    updates: Partial<Task>;
  }>;
}
```

#### `atlas_task_delete`

```typescript
/**
 * Deletes existing task(s) from the system
 *
 * @param {TaskDeleteRequest} request - The delete task request parameters
 * @returns {Promise<TaskDeleteResponse>} Result confirming deletion
 */
interface TaskDeleteRequest {
  /** Operation mode - 'single' for one task, 'bulk' for multiple tasks */
  mode?: "single" | "bulk";

  /** Task ID to delete (required for mode='single') */
  id?: string;

  /** Array of task IDs to delete (required for mode='bulk') */
  taskIds?: string[];
}
```

#### `atlas_task_list`

```typescript
/**
 * Lists tasks according to specified filters
 *
 * @param {TaskListRequest} request - The list tasks request parameters
 * @returns {Promise<TaskListResponse>} Result containing matched tasks
 */
interface TaskListRequest {
  /** ID of the project to list tasks for (required) */
  projectId: string;

  /** Filter by task status or array of statuses */
  status?:
    | "backlog"
    | "todo"
    | "in_progress"
    | "completed"
    | Array<"backlog" | "todo" | "in_progress" | "completed">;

  /** Filter by assignment ID */
  assignedTo?: string;

  /** Filter by priority level or array of priorities */
  priority?:
    | "low"
    | "medium"
    | "high"
    | "critical"
    | Array<"low" | "medium" | "high" | "critical">;

  /** Array of tags to filter by (tasks matching any tag will be included) */
  tags?: string[];

  /** Filter by task classification */
  taskType?: string;

  /** Field to sort results by (Default: createdAt) */
  sortBy?: "priority" | "createdAt" | "status";

  /** Sort order (Default: desc) */
  sortDirection?: "asc" | "desc";

  /** Page number for paginated results (Default: 1) */
  page?: number;

  /** Number of results per page, maximum 100 (Default: 20) */
  limit?: number;
}
```

### Knowledge Management

#### `atlas_knowledge_add`

```typescript
/**
 * Adds a new knowledge item or multiple items to the system
 *
 * @param {KnowledgeAddRequest} request - The add knowledge request parameters
 * @returns {Promise<KnowledgeAddResponse>} Result containing the added knowledge item(s)
 */
interface KnowledgeAddRequest {
  /** Operation mode - 'single' for one knowledge item, 'bulk' for multiple items */
  mode?: "single" | "bulk";

  /** Optional client-generated knowledge ID */
  id?: string;

  /** ID of the parent project this knowledge belongs to (required for mode='single') */
  projectId?: string;

  /** Main content of the knowledge item (can be structured or unstructured) (required for mode='single') */
  text?: string;

  /** Array of categorical labels for organization and filtering */
  tags?: string[];

  /** Primary knowledge area or discipline (required for mode='single') */
  domain?: "technical" | "business" | "scientific" | string;

  /** Array of reference sources supporting this knowledge (URLs, DOIs, etc.) */
  citations?: string[];

  /** Array of knowledge objects with the above fields (required for mode='bulk') */
  knowledge?: Partial<Knowledge>[];
}
```

#### `atlas_knowledge_delete`

```typescript
/**
 * Deletes existing knowledge item(s) from the system
 *
 * @param {KnowledgeDeleteRequest} request - The delete knowledge request parameters
 * @returns {Promise<KnowledgeDeleteResponse>} Result confirming deletion
 */
interface KnowledgeDeleteRequest {
  /** Operation mode - 'single' for individual removal, 'bulk' for batch operations */
  mode?: "single" | "bulk";

  /** Knowledge ID to delete (required for mode='single') */
  id?: string;

  /** Array of knowledge IDs to delete (required for mode='bulk') */
  knowledgeIds?: string[];
}
```

#### `atlas_knowledge_list`

```typescript
/**
 * Lists knowledge items according to specified filters
 *
 * @param {KnowledgeListRequest} request - The list knowledge request parameters
 * @returns {Promise<KnowledgeListResponse>} Result containing matched knowledge items
 */
interface KnowledgeListRequest {
  /** ID of the project to list knowledge items for (required) */
  projectId: string;

  /** Array of tags to filter by (items matching any tag will be included) */
  tags?: string[];

  /** Filter by knowledge domain/category */
  domain?: string;

  /** Text search query to filter results by content relevance */
  search?: string;

  /** Page number for paginated results (Default: 1) */
  page?: number;

  /** Number of results per page, maximum 100 (Default: 20) */
  limit?: number;
}
```

### Search Capability

#### `atlas_unified_search`

```typescript
/**
 * Performs a unified search across all entity types
 *
 * @param {UnifiedSearchRequest} request - The search request parameters
 * @returns {Promise<UnifiedSearchResponse>} Result containing matched entities
 */
interface UnifiedSearchRequest {
  /** Specific property to search within */
  property?: "name" | "description" | "text" | "title" | string;

  /** Search term or phrase to find within the specified property (required) */
  value: string;

  /** Array of entity types to include in search (Default: all types) */
  entityTypes?: Array<"project" | "task" | "knowledge">;

  /** Boolean flag to ignore case when searching (Default: true) */
  caseInsensitive?: boolean;

  /** Boolean flag to enable approximate matching for typos and variations (Default: false) */
  fuzzy?: boolean;

  /** Optional filter by project/task classification */
  taskType?: string;

  /** Page number for paginated results (Default: 1) */
  page?: number;

  /** Number of results per page, maximum 100 (Default: 20) */
  limit?: number;
}
```

## Database Management

### `atlas_database_clean`

```typescript
/**
 * Completely resets the database - permanently removes all data
 *
 * @returns {Promise<DatabaseCleanResponse>} Result confirming database reset
 * @warning This operation permanently removes all data and cannot be undone
 */
interface DatabaseCleanRequest {
  /** Explicit acknowledgement to reset the entire database (must be set to TRUE) */
  acknowledgement: boolean;
}
```

### Database Services

#### `BackupService`

The Atlas Platform includes a robust database backup service for Neo4j, implemented in `src/services/neo4j/backupService.ts`. This service provides the following functionality:

```typescript
/**
 * Configuration options for database backup
 */
interface BackupOptions {
  /** Path where the backup file should be stored (required) */
  destinationPath: string;
  
  /** Boolean flag to include project data in backup (Default: true) */
  includeProjects?: boolean;
  
  /** Boolean flag to include task data in backup (Default: true) */
  includeTasks?: boolean;
  
  /** Boolean flag to include knowledge data in backup (Default: true) */
  includeKnowledge?: boolean;
  
  /** Level of compression for the backup file (0-9) */
  compressionLevel?: number;
  
  /** Boolean flag to enable encryption of the backup file (Default: false) */
  encryptBackup?: boolean;
  
  /** Optional parameters for scheduled backups */
  scheduleBackup?: {
    /** How often to run backups */
    frequency: 'daily' | 'weekly' | 'monthly';
    
    /** Number of days to retain backup files */
    retentionPeriod: number;
    
    /** Maximum number of backup files to keep */
    maxBackups: number;
  };
}

/**
 * Result of a backup operation
 */
interface BackupResult {
  /** Operation success status */
  success: boolean;
  
  /** Timestamp of the backup */
  timestamp: string;
  
  /** Backup filename */
  filename: string;
  
  /** Size of the backup file in bytes */
  size: number;
  
  /** Count of entities in the backup */
  entities: {
    projects: number;
    tasks: number;
    knowledge: number;
  };
  
  /** Error message if operation failed */
  error?: string;
}
```

Key backup service methods:

- `createBackup(options: BackupOptions)`: Creates a compressed backup of the Neo4j database
- `verifyBackup(backupPath: string)`: Verifies the integrity of a backup file
- `listBackups(backupDir: string)`: Lists all available backups in a directory

The backup service automatically handles:
- Compression of backup data using gzip
- Scheduled backup rotation based on retention policies
- Backup verification for integrity checks

## Neo4j Integration

### Node Labels & Properties

#### Project Node

```typescript
/**
 * Neo4j :Project node schema
 */
interface ProjectNode {
  /** Unique identifier */
  id: string;

  /** Project name (1-100 chars) */
  name: string;

  /** Project overview */
  description: string;

  /** Current project state */
  status: "active" | "pending" | "completed" | "archived";

  /** Reference materials */
  urls: Array<{ title: string; url: string }>;

  /** Completion criteria */
  completionRequirements: string;

  /** Deliverable format spec */
  outputFormat: string;

  /** Project classification */
  taskType: string;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}
```

#### Task Node

```typescript
/**
 * Neo4j :Task node schema
 */
interface TaskNode {
  /** Unique identifier */
  id: string;

  /** ID of the parent project */
  projectId: string;

  /** Task title (5-150 chars) */
  title: string;

  /** Detailed requirements */
  description: string;

  /** Importance level */
  priority: "low" | "medium" | "high" | "critical";

  /** Current task state */
  status: "backlog" | "todo" | "in_progress" | "completed";

  /** ID of entity responsible for completion */
  assignedTo?: string;

  /** Reference materials */
  urls: Array<{ title: string; url: string }>;

  /** Organizational labels */
  tags?: string[];

  /** Completion criteria */
  completionRequirements: string;

  /** Deliverable format spec */
  outputFormat: string;

  /** Task classification */
  taskType: string;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}
```

#### Knowledge Node

```typescript
/**
 * Neo4j :Knowledge node schema
 */
interface KnowledgeNode {
  /** Unique identifier */
  id: string;

  /** ID of the parent project */
  projectId: string;

  /** Knowledge content */
  text: string;

  /** Organizational labels */
  tags?: string[];

  /** Knowledge domain/category */
  domain: string;

  /** Reference sources */
  citations?: string[];

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}
```

### Relationships

```cypher
// Core relationships between entity types
(:Project)-[:CONTAINS_TASK]->(:Task)
(:Project)-[:CONTAINS_KNOWLEDGE]->(:Knowledge)
(:Project)-[:DEPENDS_ON]->(:Project)
(:Task)-[:DEPENDS_ON]->(:Task)
(:Task)-[:ASSIGNED_TO]->(:User)
(:Knowledge)-[:CITES]->(:Citation)
(:Task)-[:RELATED_TO]->(:Task)
(:Project)-[:HAS_TYPE]->(:TaskType)
(:Task)-[:HAS_TYPE]->(:TaskType)
(:Knowledge)-[:BELONGS_TO_DOMAIN]->(:Domain)

// Foreign key relationships (representing database integrity)
(:Task)-[:BELONGS_TO_PROJECT]->(:Project)
(:Knowledge)-[:BELONGS_TO_PROJECT]->(:Project)
```

### Schema Creation

```cypher
// Create constraints for uniqueness
CREATE CONSTRAINT project_id_unique IF NOT EXISTS
FOR (p:Project) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT task_id_unique IF NOT EXISTS
FOR (t:Task) REQUIRE t.id IS UNIQUE;

CREATE CONSTRAINT knowledge_id_unique IF NOT EXISTS
FOR (k:Knowledge) REQUIRE k.id IS UNIQUE;

CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT citation_id_unique IF NOT EXISTS
FOR (c:Citation) REQUIRE c.id IS UNIQUE;

// Create foreign key constraints
CREATE CONSTRAINT task_project_fk IF NOT EXISTS
FOR (t:Task) REQUIRE EXISTS {
  MATCH (p:Project) WHERE t.projectId = p.id
};

CREATE CONSTRAINT knowledge_project_fk IF NOT EXISTS
FOR (k:Knowledge) REQUIRE EXISTS {
  MATCH (p:Project) WHERE k.projectId = p.id
};

// Create indexes for frequently queried properties
CREATE INDEX project_status IF NOT EXISTS FOR (p:Project) ON (p.status);
CREATE INDEX project_taskType IF NOT EXISTS FOR (p:Project) ON (p.taskType);
CREATE INDEX task_status IF NOT EXISTS FOR (t:Task) ON (t.status);
CREATE INDEX task_priority IF NOT EXISTS FOR (t:Task) ON (t.priority);

// Special indexes for array properties
CREATE INDEX task_tags_array IF NOT EXISTS FOR (t:Task) ON EACH (tag IN t.tags);
CREATE INDEX knowledge_tags_array IF NOT EXISTS FOR (k:Knowledge) ON EACH (tag IN k.tags);
CREATE INDEX knowledge_domain IF NOT EXISTS FOR (k:Knowledge) ON (k.domain);
```

### Example Queries

#### Create a new project with tasks

```cypher
// Create project
CREATE (p:Project {
  id: "project-123",
  name: "Atlas Platform Migration",
  description: "Migrate existing system to Atlas Platform",
  status: "active",
  urls: [{title: "Requirements", url: "https://example.com/requirements"}],
  completionRequirements: "All migration tasks completed with validation",
  outputFormat: "Functional system with documentation",
  taskType: "integration",
  createdAt: datetime().toString(),
  updatedAt: datetime().toString()
})

// Create and connect task
CREATE (t:Task {
  id: "task-456",
  projectId: "project-123",
  title: "Analyze existing database schema",
  description: "Document current schema and identify migration paths",
  priority: "high",
  status: "todo",
  tags: ["database", "analysis", "migration"],
  completionRequirements: "Complete schema documentation with migration recommendations",
  outputFormat: "Technical document",
  taskType: "analysis",
  createdAt: datetime().toString(),
  updatedAt: datetime().toString()
})

// Create relationships
MATCH (p:Project {id: "project-123"}), (t:Task {id: "task-456"})
CREATE (p)-[:CONTAINS_TASK]->(t)
CREATE (t)-[:BELONGS_TO_PROJECT]->(p);
```

#### Find all high-priority tasks for a specific project

```cypher
MATCH (p:Project {id: "project-123"})-[:CONTAINS_TASK]->(t:Task)
WHERE t.priority = "high"
RETURN t.id, t.title, t.status, t.priority
ORDER BY t.createdAt DESC;
```

#### Find all knowledge items related to a specific domain across projects

```cypher
MATCH (p:Project)-[:CONTAINS_KNOWLEDGE]->(k:Knowledge)
WHERE k.domain = "technical" AND "database" IN k.tags
RETURN p.name AS Project, k.id AS KnowledgeID, k.text AS Content;
```

#### Find projects with dependencies and their status

```cypher
MATCH (p1:Project)-[:DEPENDS_ON]->(p2:Project)
RETURN p1.name AS Project, p1.status AS Status,
       p2.name AS Dependency, p2.status AS DependencyStatus;
