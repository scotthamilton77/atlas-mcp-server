/**
 * SQLite database schema and initialization
 */

/**
 * SQLite schema interface
 */
export interface SqliteSchema {
  tasks: string;
  task_notes: string;
  task_dependencies: string;
  indexes: string[];
  views: {
    active_tasks: string;
    task_hierarchy: string;
    task_dependencies_view: string;
  };
}

/**
 * Database schema definition
 */
export const SCHEMA: SqliteSchema = {
  // Core tables
  tasks: `
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('TASK', 'MILESTONE')),
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED')),
      version INTEGER NOT NULL DEFAULT 1,
      project_path TEXT NOT NULL,
      description TEXT,
      reasoning TEXT,
      parent_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      status_metadata TEXT,
      metadata TEXT,
      notes TEXT,
      planning_notes TEXT,
      progress_notes TEXT,
      completion_notes TEXT,
      troubleshooting_notes TEXT,
      FOREIGN KEY (parent_path) REFERENCES tasks(path) ON DELETE SET NULL
    )
  `,

  // Notes table with categories
  task_notes: `
    CREATE TABLE IF NOT EXISTS task_notes (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      note_type TEXT NOT NULL CHECK (note_type IN ('planning', 'progress', 'completion', 'troubleshooting')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `,

  // Dependencies table
  task_dependencies: `
    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id TEXT NOT NULL,
      dependency_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (task_id, dependency_path),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (dependency_path) REFERENCES tasks(path) ON DELETE CASCADE
    )
  `,

  // Indexes for common queries
  indexes: [
    // Path-based queries
    'CREATE INDEX IF NOT EXISTS idx_tasks_path ON tasks(path)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_parent_path ON tasks(parent_path)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_project_path ON tasks(project_path)',

    // Status-based queries
    'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type)',

    // Note queries
    'CREATE INDEX IF NOT EXISTS idx_task_notes_type ON task_notes(task_id, note_type)',
    'CREATE INDEX IF NOT EXISTS idx_task_notes_created ON task_notes(created_at)',

    // Dependency queries
    'CREATE INDEX IF NOT EXISTS idx_task_dependencies_dep ON task_dependencies(dependency_path)',

    // Timestamp queries
    'CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at)',

    // Metadata queries (only if JSON1 extension is available)
    'CREATE INDEX IF NOT EXISTS idx_tasks_metadata ON tasks(metadata) WHERE json_valid(metadata)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_status_metadata ON tasks(status_metadata) WHERE json_valid(status_metadata)',
  ],

  // Views for common queries
  views: {
    // Active tasks view
    active_tasks: `
      CREATE VIEW IF NOT EXISTS active_tasks AS
      SELECT t.*, 
             (SELECT COUNT(*) FROM task_dependencies WHERE task_id = t.id) as dependency_count,
             (SELECT COUNT(*) FROM task_notes WHERE task_id = t.id) as note_count
      FROM tasks t
      WHERE t.status IN ('PENDING', 'IN_PROGRESS', 'BLOCKED')
    `,

    // Task hierarchy view
    task_hierarchy: `
      CREATE VIEW IF NOT EXISTS task_hierarchy AS
      WITH RECURSIVE hierarchy AS (
        -- Root tasks (no parent)
        SELECT 
          id,
          path,
          name,
          type,
          status,
          parent_path,
          0 as depth,
          path as root_path
        FROM tasks 
        WHERE parent_path IS NULL
        
        UNION ALL
        
        -- Child tasks
        SELECT 
          t.id,
          t.path,
          t.name,
          t.type,
          t.status,
          t.parent_path,
          h.depth + 1,
          h.root_path
        FROM tasks t
        JOIN hierarchy h ON t.parent_path = h.path
      )
      SELECT * FROM hierarchy
    `,

    // Task dependencies view
    task_dependencies_view: `
      CREATE VIEW IF NOT EXISTS task_dependencies_view AS
      SELECT 
        t.id,
        t.path,
        t.name,
        t.status,
        GROUP_CONCAT(d.dependency_path) as dependencies,
        COUNT(d.dependency_path) as dependency_count,
        SUM(CASE WHEN dt.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_dependencies
      FROM tasks t
      LEFT JOIN task_dependencies d ON t.id = d.task_id
      LEFT JOIN tasks dt ON d.dependency_path = dt.path
      GROUP BY t.id
    `,
  },
};

/**
 * Database initialization function
 */
export async function initializeDatabase(db: any): Promise<void> {
  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON');

  // Enable WAL mode for better concurrency
  await db.run('PRAGMA journal_mode = WAL');

  // Create tables
  await db.run(SCHEMA.tasks);
  await db.run(SCHEMA.task_notes);
  await db.run(SCHEMA.task_dependencies);

  // Create indexes
  for (const index of SCHEMA.indexes) {
    await db.run(index);
  }

  // Create views
  await db.run(SCHEMA.views.active_tasks);
  await db.run(SCHEMA.views.task_hierarchy);
  await db.run(SCHEMA.views.task_dependencies_view);
}
