import { Database } from 'sqlite';

/**
 * Initial unified database schema migration
 */
export async function up(db: Database): Promise<void> {
    // Create tasks table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            parent_id TEXT,
            metadata TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            checksum TEXT NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

    // Create notes table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            language TEXT,
            metadata TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

    // Create dependencies table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS dependencies (
            task_id TEXT NOT NULL,
            depends_on TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (task_id, depends_on),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (depends_on) REFERENCES tasks(id) ON DELETE CASCADE
        )
    `);

    // Create sessions table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            metadata TEXT NOT NULL,
            active_task_list_id TEXT,
            task_list_ids TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `);

    // Create task lists table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS task_lists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            metadata TEXT NOT NULL,
            root_task_ids TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `);

    // Create active state table
    await db.exec(`
        CREATE TABLE IF NOT EXISTS active_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            active_session_id TEXT,
            active_task_list_id TEXT,
            updated_at INTEGER NOT NULL
        )
    `);

    // Insert initial active state
    await db.exec(`
        INSERT OR IGNORE INTO active_state (id, updated_at)
        VALUES (1, unixepoch())
    `);

    // Create indexes for tasks
    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
        CREATE INDEX IF NOT EXISTS idx_notes_task ON notes(task_id);
        CREATE INDEX IF NOT EXISTS idx_dependencies_task ON dependencies(task_id);
        CREATE INDEX IF NOT EXISTS idx_dependencies_depends ON dependencies(depends_on);
    `);

    // Create indexes for sessions and task lists
    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sessions_active_list ON sessions(active_task_list_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
        CREATE INDEX IF NOT EXISTS idx_task_lists_updated ON task_lists(updated_at);
    `);

}

/**
 * Rollback initial schema migration
 */
export async function down(db: Database): Promise<void> {
    // Drop tables in reverse order to handle foreign key constraints
    await db.exec(`
        DROP TABLE IF EXISTS active_state;
        DROP TABLE IF EXISTS task_lists;
        DROP TABLE IF EXISTS sessions;
        DROP TABLE IF EXISTS dependencies;
        DROP TABLE IF EXISTS notes;
        DROP TABLE IF EXISTS tasks;
        DROP TABLE IF EXISTS migrations;
    `);
}
