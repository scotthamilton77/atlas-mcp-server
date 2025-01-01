import { Logger } from '../../logging/index.js';
import { TaskStorage, StorageStats, StorageMetrics } from '../../types/storage.js';
import { Task, TaskStatus } from '../../types/task.js';
import { TaskOperations } from './operations/task-operations.js';
import { SqliteConnection } from './database/connection.js';
import { initializeDatabase } from './database/schema.js';
import { SqliteConfig } from './config.js';
import { createError, ErrorCodes } from '../../errors/index.js';

/**
 * SQLite-based task storage implementation
 */
export class SqliteStorage extends TaskOperations implements TaskStorage {
  protected readonly logger: Logger;
  private isInitialized = false;
  private isClosed = false;

  constructor(
    protected readonly connection: SqliteConnection,
    protected readonly config: Required<SqliteConfig>
  ) {
    super(connection);
    this.logger = Logger.getInstance().child({ component: 'SqliteStorage' });
  }

  /**
   * Initialize storage
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw createError(ErrorCodes.STORAGE_ERROR, 'Storage already initialized', 'initialize');
    }

    try {
      await this.connection.execute(async db => {
        await initializeDatabase(db);
      }, 'initialize');

      this.isInitialized = true;
      this.logger.info('Storage initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize storage', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to initialize storage',
        'initialize',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Close storage connection
   */
  async close(): Promise<void> {
    if (this.isClosed) {
      throw createError(ErrorCodes.STORAGE_ERROR, 'Storage already closed', 'close');
    }

    try {
      await this.connection.close();
      this.isClosed = true;
      this.logger.info('Storage closed successfully');
    } catch (error) {
      this.logger.error('Failed to close storage', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to close storage',
        'close',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Begin transaction
   */
  async beginTransaction(): Promise<void> {
    await this.connection.beginTransaction();
  }

  /**
   * Commit transaction
   */
  async commitTransaction(): Promise<void> {
    await this.connection.commitTransaction();
  }

  /**
   * Rollback transaction
   */
  async rollbackTransaction(): Promise<void> {
    await this.connection.rollbackTransaction();
  }

  /**
   * Execute work in transaction
   */
  async executeInTransaction<T>(work: () => Promise<T>, retries = 3): Promise<T> {
    return await this.connection.executeInTransaction(work, retries);
  }

  /**
   * Get child tasks
   */
  async getChildren(parentPath: string): Promise<Task[]> {
    try {
      return await this.connection.execute(async db => {
        // Get child tasks
        const rows = await db.all<Record<string, unknown>[]>(
          'SELECT * FROM tasks WHERE parent_path = ?',
          parentPath
        );

        // Get task IDs for dependency lookup
        const taskIds = rows.map(row => String(row.id));

        if (taskIds.length === 0) {
          return [];
        }

        // Get dependencies for child tasks
        const placeholders = taskIds.map(() => '?').join(',');
        const dependencies = await db.all<{ task_id: string; dependency_path: string }[]>(
          `SELECT task_id, dependency_path FROM task_dependencies WHERE task_id IN (${placeholders})`,
          ...taskIds
        );

        // Group dependencies by task
        const dependenciesByTask = dependencies.reduce(
          (acc, dep) => {
            acc[dep.task_id] = acc[dep.task_id] || [];
            acc[dep.task_id].push(dep.dependency_path);
            return acc;
          },
          {} as Record<string, string[]>
        );

        // Add dependencies to each row
        const rowsWithDeps = rows.map(row => ({
          ...row,
          dependencies: JSON.stringify(dependenciesByTask[String(row.id)] || []),
        }));

        this.logger.debug('Retrieved child tasks', { parentPath, count: rows.length });
        return rowsWithDeps.map(row => this.rowToTask(row));
      }, 'getChildren');
    } catch (error) {
      this.logger.error('Failed to get child tasks', {
        error,
        context: { parentPath },
      });

      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to get child tasks',
        'getChildren',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Check if task has children
   */
  async hasChildren(path: string): Promise<boolean> {
    try {
      return await this.connection.execute(async db => {
        const result = await db.get<{ count: number }>(
          'SELECT COUNT(*) as count FROM tasks WHERE parent_path = ?',
          path
        );
        return (result?.count ?? 0) > 0;
      }, 'hasChildren');
    } catch (error) {
      this.logger.error('Failed to check for children', {
        error,
        context: { path },
      });

      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to check for children',
        'hasChildren',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Get tasks that depend on this task
   */
  async getDependentTasks(path: string): Promise<Task[]> {
    try {
      return await this.connection.execute(async db => {
        const rows = await db.all<Record<string, unknown>[]>(
          `SELECT t.* FROM tasks t
           INNER JOIN task_dependencies d ON t.id = d.task_id
           WHERE d.dependency_path = ?`,
          path
        );

        // Get task IDs for dependency lookup
        const taskIds = rows.map(row => String(row.id));

        if (taskIds.length === 0) {
          return [];
        }

        // Get dependencies for dependent tasks
        const placeholders = taskIds.map(() => '?').join(',');
        const dependencies = await db.all<{ task_id: string; dependency_path: string }[]>(
          `SELECT task_id, dependency_path FROM task_dependencies WHERE task_id IN (${placeholders})`,
          ...taskIds
        );

        // Group dependencies by task
        const dependenciesByTask = dependencies.reduce(
          (acc, dep) => {
            acc[dep.task_id] = acc[dep.task_id] || [];
            acc[dep.task_id].push(dep.dependency_path);
            return acc;
          },
          {} as Record<string, string[]>
        );

        // Add dependencies to each row
        const rowsWithDeps = rows.map(row => ({
          ...row,
          dependencies: JSON.stringify(dependenciesByTask[String(row.id)] || []),
        }));

        this.logger.debug('Retrieved dependent tasks', { path, count: rows.length });
        return rowsWithDeps.map(row => this.rowToTask(row));
      }, 'getDependentTasks');
    } catch (error) {
      this.logger.error('Failed to get dependent tasks', {
        error,
        context: { path },
      });

      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to get dependent tasks',
        'getDependentTasks',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Clear all tasks
   */
  async clearAllTasks(): Promise<void> {
    try {
      await this.connection.execute(async db => {
        await db.run('DELETE FROM task_dependencies');
        await db.run('DELETE FROM tasks');
      }, 'clearAllTasks');
    } catch (error) {
      this.logger.error('Failed to clear all tasks', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to clear all tasks',
        'clearAllTasks',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Vacuum database
   */
  async vacuum(): Promise<void> {
    try {
      await this.connection.execute(async db => {
        await db.run('VACUUM');
      }, 'vacuum');
    } catch (error) {
      this.logger.error('Failed to vacuum database', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to vacuum database',
        'vacuum',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Analyze database
   */
  async analyze(): Promise<void> {
    try {
      await this.connection.execute(async db => {
        await db.run('ANALYZE');
      }, 'analyze');
    } catch (error) {
      this.logger.error('Failed to analyze database', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to analyze database',
        'analyze',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Checkpoint database
   */
  async checkpoint(): Promise<void> {
    try {
      await this.connection.execute(async db => {
        await db.run('PRAGMA wal_checkpoint(TRUNCATE)');
      }, 'checkpoint');
    } catch (error) {
      this.logger.error('Failed to checkpoint database', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to checkpoint database',
        'checkpoint',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Repair task relationships
   */
  async repairRelationships(dryRun = false): Promise<{ fixed: number; issues: string[] }> {
    const issues: string[] = [];
    let fixed = 0;

    try {
      await this.connection.execute(async db => {
        // Check for missing parents
        const orphans = await db.all<{ path: string; parent_path: string }[]>(
          `SELECT t1.path, t1.parent_path 
           FROM tasks t1 
           LEFT JOIN tasks t2 ON t1.parent_path = t2.path 
           WHERE t1.parent_path IS NOT NULL AND t2.path IS NULL`
        );

        for (const orphan of orphans) {
          issues.push(`Task ${orphan.path} references missing parent ${orphan.parent_path}`);
          if (!dryRun) {
            await db.run('UPDATE tasks SET parent_path = NULL WHERE path = ?', orphan.path);
            fixed++;
          }
        }

        // Check for missing dependencies
        const brokenDeps = await db.all<{ task_id: string; dependency_path: string }[]>(
          `SELECT d.task_id, d.dependency_path 
           FROM task_dependencies d 
           LEFT JOIN tasks t ON d.dependency_path = t.path 
           WHERE t.path IS NULL`
        );

        for (const dep of brokenDeps) {
          issues.push(`Task ${dep.task_id} references missing dependency ${dep.dependency_path}`);
          if (!dryRun) {
            await db.run(
              'DELETE FROM task_dependencies WHERE task_id = ? AND dependency_path = ?',
              dep.task_id,
              dep.dependency_path
            );
            fixed++;
          }
        }

        // Check for circular dependencies
        const tasks = await db.all<{ path: string }[]>('SELECT path FROM tasks');
        for (const task of tasks) {
          const visited = new Set<string>();
          const stack = new Set<string>();

          const checkCycle = async (current: string): Promise<boolean> => {
            if (stack.has(current)) {
              issues.push(`Circular dependency detected involving task ${current}`);
              return true;
            }
            if (visited.has(current)) return false;

            visited.add(current);
            stack.add(current);

            const deps = await db.all<{ dependency_path: string }[]>(
              'SELECT dependency_path FROM task_dependencies WHERE task_id = ?',
              current
            );

            for (const dep of deps) {
              if (await checkCycle(dep.dependency_path)) {
                if (!dryRun) {
                  await db.run(
                    'DELETE FROM task_dependencies WHERE task_id = ? AND dependency_path = ?',
                    current,
                    dep.dependency_path
                  );
                  fixed++;
                }
                return true;
              }
            }

            stack.delete(current);
            return false;
          };

          await checkCycle(task.path);
        }
      }, 'repairRelationships');

      return { fixed, issues };
    } catch (error) {
      this.logger.error('Failed to repair relationships', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to repair relationships',
        'repairRelationships',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    try {
      await this.connection.clearCache();
    } catch (error) {
      this.logger.error('Failed to clear cache', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to clear cache',
        'clearCache',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Verify database integrity
   */
  async verifyIntegrity(): Promise<boolean> {
    try {
      return await this.connection.execute(async db => {
        const result = await db.get<{ integrity_check: string }>('PRAGMA integrity_check');
        return result?.integrity_check === 'ok';
      }, 'verifyIntegrity');
    } catch (error) {
      this.logger.error('Failed to verify integrity', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to verify integrity',
        'verifyIntegrity',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Get storage stats
   */
  async getStats(): Promise<StorageStats> {
    try {
      return await this.connection.execute(async db => {
        const results = await Promise.all([
          db.get<{ page_count: number }>('PRAGMA page_count'),
          db.get<{ page_size: number }>('PRAGMA page_size'),
          db.get<{ journal_mode: string }>('PRAGMA journal_mode'),
        ]);

        const pageCount = results[0]?.page_count ?? 0;
        const pageSize = results[1]?.page_size ?? 0;
        const journalMode = results[2]?.journal_mode ?? 'delete';

        const size = pageCount * pageSize;
        const walSize = await this.getWalSize();

        return {
          size,
          walSize,
          pageCount,
          pageSize,
          journalMode,
        };
      }, 'getStats');
    } catch (error) {
      this.logger.error('Failed to get storage stats', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to get storage stats',
        'getStats',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Get storage metrics
   */
  async getMetrics(): Promise<StorageMetrics> {
    try {
      const [taskMetrics, storageStats] = await Promise.all([
        this.getTaskMetrics(),
        this.getStats(),
      ]);

      const cacheMetrics = this.connection.getCacheMetrics();

      return {
        tasks: taskMetrics,
        storage: {
          totalSize: storageStats.size + storageStats.walSize,
          pageSize: storageStats.pageSize,
          pageCount: storageStats.pageCount,
          walSize: storageStats.walSize,
          cache: {
            hitRate: cacheMetrics.hitRate,
            memoryUsage: cacheMetrics.memoryUsage,
            entryCount: cacheMetrics.entryCount,
          },
        },
      };
    } catch (error) {
      this.logger.error('Failed to get metrics', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Failed to get metrics',
        'getMetrics',
        error instanceof Error ? error.message : undefined
      );
    }
  }

  /**
   * Get task metrics
   */
  private async getTaskMetrics(): Promise<{
    total: number;
    byStatus: Record<TaskStatus, number>;
    noteCount: number;
    dependencyCount: number;
  }> {
    return await this.connection.execute(async db => {
      const results = await Promise.all([
        db.get<{ total: number }>('SELECT COUNT(*) as total FROM tasks'),
        db.all<{ status: TaskStatus; count: number }[]>(
          'SELECT status, COUNT(*) as count FROM tasks GROUP BY status'
        ),
        db.get<{ noteCount: number }>('SELECT COUNT(*) as noteCount FROM task_notes'),
        db.get<{ dependencyCount: number }>(
          'SELECT COUNT(*) as dependencyCount FROM task_dependencies'
        ),
      ]);

      const total = results[0]?.total ?? 0;
      const statusCounts = results[1];
      const noteCount = results[2]?.noteCount ?? 0;
      const dependencyCount = results[3]?.dependencyCount ?? 0;

      const byStatus = statusCounts.reduce(
        (acc, { status, count }) => {
          acc[status] = count;
          return acc;
        },
        {} as Record<TaskStatus, number>
      );

      return {
        total,
        byStatus,
        noteCount,
        dependencyCount,
      };
    }, 'getTaskMetrics');
  }

  /**
   * Get WAL file size
   */
  private async getWalSize(): Promise<number> {
    try {
      return await this.connection.execute(async db => {
        const result = await db.get<{ size: number }>(
          "SELECT (SELECT page_count FROM pragma_page_count('main-wal')) * page_size as size FROM pragma_page_size"
        );
        return result?.size ?? 0;
      }, 'getWalSize');
    } catch {
      return 0;
    }
  }
}
