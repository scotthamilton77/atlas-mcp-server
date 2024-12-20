import { Database } from 'sqlite';

/**
 * Initial database schema migration
 */
export async function up(db: Database): Promise<void> {
    // Create migrations table first
    await db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at INTEGER NOT NULL
        )
    `);

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

    // Create indexes
    await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
        CREATE INDEX IF NOT EXISTS idx_notes_task ON notes(task_id);
        CREATE INDEX IF NOT EXISTS idx_dependencies_task ON dependencies(task_id);
        CREATE INDEX IF NOT EXISTS idx_dependencies_depends ON dependencies(depends_on);
    `);

    // Record migration
    await db.run(
        'INSERT INTO migrations (name, applied_at) VALUES (?, ?)',
        ['001_initial_schema', Date.now()]
    );
}

/**
 * Rollback initial schema migration
 */
export async function down(db: Database): Promise<void> {
    // Drop tables in reverse order to handle foreign key constraints
    await db.exec(`
        DROP TABLE IF EXISTS dependencies;
        DROP TABLE IF EXISTS notes;
        DROP TABLE IF EXISTS tasks;
        DROP TABLE IF EXISTS migrations;
    `);
}
