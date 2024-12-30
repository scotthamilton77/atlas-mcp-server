import { Logger } from '../../logging/index.js';
import { TaskStorage, StorageMetrics } from '../../types/storage.js';
import { SqliteErrorHandler } from './error-handler.js';
import { Task } from '../../types/task.js';
import { SqliteConfig } from '../interfaces/config.js';
import { SqliteConnection } from './database/connection.js';
import { initializeDatabase } from './database/schema.js';
import { TaskOperations } from './operations/task-operations.js';
import { SqliteMetrics } from './metrics/storage-metrics.js';

/**
 * SQLite implementation of task storage
 */
export class SqliteStorage extends TaskOperations implements TaskStorage {
  private readonly metrics: SqliteMetrics;
  protected readonly logger: Logger;
  private isInitialized = false;
  private _isClosed = false;
  private inTransaction = false;

  get isClosed(): boolean {
    return this._isClosed;
  }

  private readonly errorHandler: SqliteErrorHandler;

  constructor(config: SqliteConfig) {
    const connection = new SqliteConnection(config);
    super(connection);
    this.metrics = new SqliteMetrics(connection);
    this.logger = Logger.getInstance().child({ component: 'SqliteStorage' });
    this.errorHandler = new SqliteErrorHandler();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing SQLite storage', {
        operation: 'initialize',
      });

      // Initialize connection first
      await this.connection.initialize();

      try {
        // Initialize database schema
        await this.connection.execute(async db => {
          await initializeDatabase(db);
        }, 'initializeSchema');
      } catch (error) {
        // If schema fails, ensure connection is cleaned up
        await this.connection.close().catch(closeError => {
          this.logger.error('Error closing connection after schema failure', closeError);
        });
        throw error;
      }

      this.isInitialized = true;
      this.logger.info('SQLite storage initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SQLite storage', error);

      // Ensure we're marked as closed
      this._isClosed = true;

      // Try to clean up any partial initialization
      try {
        await this.connection.close();
      } catch (cleanupError) {
        this.logger.error('Failed to cleanup after initialization error', cleanupError);
      }

      return this.errorHandler.handleInitError(error, {
        operation: 'initialize',
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  async close(): Promise<void> {
    if (this._isClosed) {
      return;
    }

    try {
      this.logger.info('Closing SQLite storage', {
        operation: 'close',
        inTransaction: this.inTransaction,
      });

      if (this.inTransaction) {
        await this.rollbackTransaction();
      }
      await this.connection.close();
      this._isClosed = true;
      this.logger.info('SQLite storage closed successfully');
    } catch (error) {
      this.logger.error('Error closing SQLite storage', error);
      return this.errorHandler.handleError(error, 'close');
    }
  }

  // Transaction management
  async beginTransaction(): Promise<void> {
    if (this.inTransaction) {
      return this.errorHandler.handleError(
        new Error('Transaction already in progress'),
        'beginTransaction'
      );
    }

    try {
      await this.connection.execute(async db => db.run('BEGIN TRANSACTION'), 'beginTransaction');
      this.inTransaction = true;
      this.logger.debug('Transaction started');
    } catch (error) {
      this.logger.error('Failed to begin transaction', error);
      return this.errorHandler.handleError(error, 'beginTransaction');
    }
  }

  async commitTransaction(): Promise<void> {
    if (!this.inTransaction) {
      return this.errorHandler.handleError(
        new Error('No transaction in progress'),
        'commitTransaction'
      );
    }

    try {
      await this.connection.execute(async db => db.run('COMMIT'), 'commitTransaction');
      this.inTransaction = false;
      this.logger.debug('Transaction committed');
    } catch (error) {
      this.logger.error('Failed to commit transaction', error);
      return this.errorHandler.handleError(error, 'commitTransaction');
    }
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.inTransaction) {
      return this.errorHandler.handleError(
        new Error('No transaction in progress'),
        'rollbackTransaction'
      );
    }

    try {
      await this.connection.execute(async db => db.run('ROLLBACK'), 'rollbackTransaction');
      this.inTransaction = false;
      this.logger.debug('Transaction rolled back');
    } catch (error) {
      this.logger.error('Failed to rollback transaction', error);
      return this.errorHandler.handleError(error, 'rollbackTransaction');
    }
  }

  // Task operations
  async hasChildren(path: string): Promise<boolean> {
    try {
      const children = await this.getSubtasks(path);
      return children.length > 0;
    } catch (error) {
      this.logger.error('Failed to check for children', error, { path });
      return this.errorHandler.handleError(error, 'hasChildren', { path });
    }
  }

  async getDependentTasks(path: string): Promise<Task[]> {
    try {
      return this.connection.execute(async db => {
        const rows = await db.all<Record<string, unknown>[]>(
          `
          SELECT * FROM tasks 
          WHERE json_extract(dependencies, '$') LIKE ?
        `,
          `%${path}%`
        );

        return rows.map(row => this.rowToTask(row));
      }, 'getDependentTasks');
    } catch (error) {
      this.logger.error('Failed to get dependent tasks', error, { path });
      return this.errorHandler.handleError(error, 'getDependentTasks', { path });
    }
  }

  async clearAllTasks(): Promise<void> {
    try {
      this.logger.info('Clearing all tasks');
      await this.connection.execute(async db => db.run('DELETE FROM tasks'), 'clearAllTasks');
      this.logger.info('All tasks cleared successfully');
    } catch (error) {
      this.logger.error('Failed to clear all tasks', error);
      return this.errorHandler.handleError(error, 'clearAllTasks');
    }
  }

  // Maintenance operations
  async vacuum(): Promise<void> {
    try {
      this.logger.info('Running vacuum');
      await this.metrics.maintenance();
      this.logger.info('Vacuum completed successfully');
    } catch (error) {
      this.logger.error('Failed to vacuum database', error);
      return this.errorHandler.handleError(error, 'vacuum');
    }
  }

  async analyze(): Promise<void> {
    try {
      this.logger.info('Running analyze');
      await this.metrics.maintenance();
      this.logger.info('Analyze completed successfully');
    } catch (error) {
      this.logger.error('Failed to analyze database', error);
      return this.errorHandler.handleError(error, 'analyze');
    }
  }

  async checkpoint(): Promise<void> {
    try {
      this.logger.info('Running checkpoint');
      await this.metrics.maintenance();
      this.logger.info('Checkpoint completed successfully');
    } catch (error) {
      this.logger.error('Failed to checkpoint database', error);
      return this.errorHandler.handleError(error, 'checkpoint');
    }
  }

  async verifyIntegrity(): Promise<boolean> {
    try {
      this.logger.info('Verifying database integrity');
      const result = await this.connection.verifyIntegrity();
      this.logger.info('Integrity check completed', { result });
      return result;
    } catch (error) {
      this.logger.error('Failed to verify database integrity', error);
      return this.errorHandler.handleError(error, 'verifyIntegrity');
    }
  }

  async getMetrics(): Promise<StorageMetrics> {
    try {
      return await this.metrics.getMetrics();
    } catch (error) {
      this.logger.error('Failed to get metrics', error);
      return this.errorHandler.handleError(error, 'getMetrics');
    }
  }

  async clearCache(): Promise<void> {
    // SQLite implementation doesn't use cache
    this.logger.debug('Cache clear requested (no-op for SQLite)');
    return;
  }

  async repairRelationships(dryRun = true): Promise<{ fixed: number; issues: string[] }> {
    const issues: string[] = [];
    let fixed = 0;

    try {
      this.logger.info('Starting relationship repair', { dryRun });

      // Start transaction if not in dry run mode
      if (!dryRun) {
        await this.beginTransaction();
      }

      // Get all tasks
      const tasks = await this.getTasksByPattern('**');

      // Check and fix parent-child relationships
      for (const task of tasks) {
        if (task.parentPath) {
          // Verify parent exists
          const parent = await this.getTask(task.parentPath);
          if (!parent) {
            issues.push(`Task ${task.path} has invalid parent path: ${task.parentPath}`);
            if (!dryRun) {
              await this.updateTask(task.path, { parentPath: null });
              fixed++;
            }
          } else if (!parent.subtasks.includes(task.path)) {
            issues.push(`Parent ${parent.path} missing subtask reference to ${task.path}`);
            if (!dryRun) {
              await this.updateTask(parent.path, {
                subtasks: [...parent.subtasks, task.path],
              });
              fixed++;
            }
          }
        }

        // Verify subtasks exist and reference this task as parent
        for (const subtaskPath of task.subtasks) {
          const subtask = await this.getTask(subtaskPath);
          if (!subtask) {
            issues.push(`Task ${task.path} has invalid subtask reference: ${subtaskPath}`);
            if (!dryRun) {
              await this.updateTask(task.path, {
                subtasks: task.subtasks.filter(s => s !== subtaskPath),
              });
              fixed++;
            }
          } else if (subtask.parentPath !== task.path) {
            issues.push(`Subtask ${subtask.path} has incorrect parent path: ${subtask.parentPath}`);
            if (!dryRun) {
              await this.updateTask(subtask.path, { parentPath: task.path });
              fixed++;
            }
          }
        }

        // Verify dependencies exist
        for (const depPath of task.dependencies) {
          const dep = await this.getTask(depPath);
          if (!dep) {
            issues.push(`Task ${task.path} has invalid dependency: ${depPath}`);
            if (!dryRun) {
              await this.updateTask(task.path, {
                dependencies: task.dependencies.filter(d => d !== depPath),
              });
              fixed++;
            }
          }
        }
      }

      // Commit transaction if not in dry run mode
      if (!dryRun) {
        await this.commitTransaction();
      }

      this.logger.info('Relationship repair completed', { fixed, issueCount: issues.length });
      return { fixed, issues };
    } catch (error) {
      this.logger.error('Failed to repair relationships', error);

      // Rollback transaction if not in dry run mode
      if (!dryRun && this.inTransaction) {
        await this.rollbackTransaction();
      }

      return this.errorHandler.handleError(error, 'repairRelationships', { dryRun });
    }
  }
}
