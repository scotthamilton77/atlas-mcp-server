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
  triggers: {
    [key: string]: string;
  };
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

  // Triggers for enforcing task constraints
  triggers: {
    dependency_status_check: `
      CREATE TRIGGER IF NOT EXISTS check_dependency_status
      BEFORE UPDATE ON tasks
      WHEN NEW.status = 'COMPLETED'
      BEGIN
        SELECT CASE
          WHEN EXISTS (
            SELECT 1 FROM task_dependencies td
            JOIN tasks t ON td.dependency_path = t.path
            WHERE td.task_id = NEW.id
            AND t.status != 'COMPLETED'
          )
        THEN RAISE(ABORT, 'Cannot complete task with incomplete dependencies')
        END;
      END;
    `,

    prevent_circular_dependencies: `
      CREATE TRIGGER IF NOT EXISTS prevent_circular_deps
      BEFORE INSERT ON task_dependencies
      BEGIN
        SELECT CASE
          WHEN EXISTS (
            WITH RECURSIVE dep_chain(task_id, dependency_path, depth) AS (
              SELECT task_id, dependency_path, 1
              FROM task_dependencies
              WHERE task_id = NEW.dependency_path
              UNION ALL
              SELECT td.task_id, td.dependency_path, dc.depth + 1
              FROM task_dependencies td
              JOIN dep_chain dc ON td.task_id = dc.dependency_path
              WHERE dc.depth < 100
            )
            SELECT 1 FROM dep_chain WHERE dependency_path = NEW.task_id
          )
        THEN RAISE(ABORT, 'Circular dependency detected')
        END;
      END;
    `,

    cascade_blocked_status: `
      CREATE TRIGGER IF NOT EXISTS cascade_blocked_status
      AFTER UPDATE ON tasks
      WHEN NEW.status = 'BLOCKED'
      BEGIN
        UPDATE tasks
        SET status = 'BLOCKED',
            status_metadata = json_set(COALESCE(status_metadata, '{}'), '$.blocked_by', NEW.path)
        WHERE id IN (
          SELECT task_id FROM task_dependencies
          WHERE dependency_path = NEW.path
        );
      END;
    `,
  },

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

    // Enhanced task hierarchy view with materialized path
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

    // Enhanced task dependencies view with validation info
    task_dependencies_view: `
      CREATE VIEW IF NOT EXISTS task_dependencies_view AS
      WITH RECURSIVE dependency_chain AS (
        SELECT 
          t.id,
          t.path,
          td.dependency_path,
          1 as depth,
          t.path || '>' || td.dependency_path as chain
        FROM tasks t
        JOIN task_dependencies td ON t.id = td.task_id
        
        UNION ALL
        
        SELECT 
          dc.id,
          dc.path,
          td.dependency_path,
          dc.depth + 1,
          dc.chain || '>' || td.dependency_path
        FROM dependency_chain dc
        JOIN task_dependencies td ON td.task_id = dc.dependency_path
        WHERE dc.depth < 100
      )
      SELECT 
        t.id,
        t.path,
        t.name,
        t.status,
        GROUP_CONCAT(DISTINCT d.dependency_path) as dependencies,
        COUNT(DISTINCT d.dependency_path) as dependency_count,
        SUM(CASE WHEN dt.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_dependencies,
        GROUP_CONCAT(DISTINCT dc.chain) as dependency_chains,
        MAX(dc.depth) as max_depth
      FROM tasks t
      LEFT JOIN task_dependencies d ON t.id = d.task_id
      LEFT JOIN tasks dt ON d.dependency_path = dt.path
      LEFT JOIN dependency_chain dc ON t.id = dc.id
      GROUP BY t.id
    `,
  },
};

/**
 * Database initialization function with improved error handling and validation
 */
export async function initializeDatabase(db: any): Promise<void> {
  try {
    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON');

    // Set optimal cache size
    await db.run('PRAGMA page_size = 4096');
    await db.run('PRAGMA cache_size = -2000'); // 2MB cache

    // Create tables with error handling
    await Promise.all([
      db.run(SCHEMA.tasks).catch((e: Error) => {
        throw new Error(`Failed to create tasks table: ${e.message}`);
      }),
      db.run(SCHEMA.task_notes).catch((e: Error) => {
        throw new Error(`Failed to create task_notes table: ${e.message}`);
      }),
      db.run(SCHEMA.task_dependencies).catch((e: Error) => {
        throw new Error(`Failed to create task_dependencies table: ${e.message}`);
      }),
    ]);

    // Create indexes with progress tracking
    for (const index of SCHEMA.indexes) {
      await db.run(index).catch((e: Error) => {
        throw new Error(`Failed to create index: ${e.message}`);
      });
    }

    // Create triggers for constraint enforcement
    for (const [name, trigger] of Object.entries(SCHEMA.triggers)) {
      await db.run(trigger).catch((e: Error) => {
        throw new Error(`Failed to create trigger ${name}: ${e.message}`);
      });
    }

    // Create views with dependency tracking
    await Promise.all([
      db.run(SCHEMA.views.active_tasks),
      db.run(SCHEMA.views.task_hierarchy),
      db.run(SCHEMA.views.task_dependencies_view),
    ]).catch((e: Error) => {
      throw new Error(`Failed to create views: ${e.message}`);
    });

    // Verify database integrity
    const integrityCheck = await db.get('PRAGMA integrity_check');
    if (integrityCheck?.integrity_check !== 'ok') {
      throw new Error('Database integrity check failed');
    }

    // Optimize database
    await db.run('ANALYZE');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize database: ${message}`);
  }
}
