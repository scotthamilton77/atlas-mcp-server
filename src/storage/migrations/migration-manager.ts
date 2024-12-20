import { Database } from 'sqlite';
import { Logger } from '../../logging/index.js';
import * as initialSchema from './001_initial_schema.js';

interface Migration {
    up: (db: Database) => Promise<void>;
    down: (db: Database) => Promise<void>;
}

interface MigrationRecord {
    id: number;
    name: string;
    applied_at: number;
}

/**
 * Manages database migrations with versioning and rollback support
 */
export class MigrationManager {
    private logger: Logger;
    private migrations: Map<string, Migration>;

    constructor(private db: Database) {
        this.logger = Logger.getInstance().child({ component: 'MigrationManager' });
        this.migrations = new Map([
            ['001_initial_schema', initialSchema]
            // Add new migrations here in order
        ]);
    }

    /**
     * Gets list of applied migrations
     */
    private async ensureMigrationsTable(): Promise<void> {
        try {
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS migrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    applied_at INTEGER NOT NULL
                )
            `);
        } catch (error) {
            this.logger.error('Failed to create migrations table', { error });
            throw error;
        }
    }

    private async getAppliedMigrations(): Promise<string[]> {
        try {
            await this.ensureMigrationsTable();

            const records = await this.db.all<MigrationRecord[]>(`
                SELECT * FROM migrations ORDER BY id ASC
            `);

            return records.map(record => record.name);
        } catch (error) {
            this.logger.error('Failed to get applied migrations', { error });
            throw error;
        }
    }

    /**
     * Gets list of pending migrations
     */
    private async getPendingMigrations(): Promise<string[]> {
        const applied = await this.getAppliedMigrations();
        const allMigrations = Array.from(this.migrations.keys()).sort();
        return allMigrations.filter(name => !applied.includes(name));
    }

    /**
     * Runs all pending migrations
     */
    async migrateUp(): Promise<void> {
        const pending = await this.getPendingMigrations();
        
        if (pending.length === 0) {
            this.logger.info('No pending migrations');
            return;
        }

        this.logger.info(`Running ${pending.length} pending migrations`);

        for (const name of pending) {
            const migration = this.migrations.get(name);
            if (!migration) {
                throw new Error(`Migration ${name} not found`);
            }

            try {
                await this.db.run('BEGIN TRANSACTION');

                await migration.up(this.db);

                // Record migration
                await this.db.run(`
                    INSERT INTO migrations (name, applied_at)
                    VALUES (?, ?)
                `, [name, Date.now()]);

                await this.db.run('COMMIT');
                
                this.logger.info(`Migration ${name} completed successfully`);
            } catch (error) {
                await this.db.run('ROLLBACK');
                this.logger.error(`Migration ${name} failed`, { error });
                throw error;
            }
        }

        this.logger.info('All migrations completed successfully');
    }

    /**
     * Rolls back the last applied migration
     */
    async migrateDown(): Promise<void> {
        const applied = await this.getAppliedMigrations();
        
        if (applied.length === 0) {
            this.logger.info('No migrations to roll back');
            return;
        }

        const lastMigration = applied[applied.length - 1];
        const migration = this.migrations.get(lastMigration);
        
        if (!migration) {
            throw new Error(`Migration ${lastMigration} not found`);
        }

            try {
                await this.db.run('BEGIN TRANSACTION');
                await migration.down(this.db);

                // Remove migration record
                await this.db.run(`
                    DELETE FROM migrations WHERE name = ?
                `, [lastMigration]);

                await this.db.run('COMMIT');
                
                this.logger.info(`Migration ${lastMigration} rolled back successfully`);
        } catch (error) {
            await this.db.run('ROLLBACK');
            this.logger.error(`Failed to roll back migration ${lastMigration}`, { error });
            throw error;
        }
    }

    /**
     * Gets current migration status
     */
    async status(): Promise<{
        applied: string[];
        pending: string[];
        lastApplied?: string;
    }> {
        const applied = await this.getAppliedMigrations();
        const pending = await this.getPendingMigrations();
        
        return {
            applied,
            pending,
            lastApplied: applied.length > 0 ? applied[applied.length - 1] : undefined
        };
    }

    /**
     * Resets database by rolling back all migrations
     */
    async reset(): Promise<void> {
        const applied = await this.getAppliedMigrations();
        
        if (applied.length === 0) {
            this.logger.info('No migrations to reset');
            return;
        }

        this.logger.info(`Rolling back ${applied.length} migrations`);

        // Roll back in reverse order
        for (const name of applied.reverse()) {
            const migration = this.migrations.get(name);
            if (!migration) {
                throw new Error(`Migration ${name} not found`);
            }

            try {
                await this.db.run('BEGIN TRANSACTION');
                await migration.down(this.db);

                // Remove migration record
                await this.db.run(`
                    DELETE FROM migrations WHERE name = ?
                `, [name]);

                await this.db.run('COMMIT');
                
                this.logger.info(`Migration ${name} rolled back successfully`);
            } catch (error) {
                await this.db.run('ROLLBACK');
                this.logger.error(`Failed to roll back migration ${name}`, { error });
                throw error;
            }
        }

        this.logger.info('Database reset completed successfully');
    }
}
