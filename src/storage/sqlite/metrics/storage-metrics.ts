import { Logger } from '../../../logging/index.js';
import { ErrorCodes, createError } from '../../../errors/index.js';
import { SqliteConnection } from '../database/connection.js';
import { TaskStatus } from '../../../types/task.js';

let logger: Logger | undefined;

function getLogger(): Logger {
  if (!logger) {
    try {
      logger = Logger.getInstance().child({ component: 'StorageMetrics' });
    } catch (error) {
      // If logger isn't initialized yet, create a minimal logger
      console.warn('Logger not initialized, using console fallback');
      logger = {
        error: console.error,
        warn: console.warn,
        info: console.info,
        debug: console.debug,
        child: () => logger!,
      } as unknown as Logger;
    }
  }
  return logger;
}

export interface StorageMetrics {
  tasks: {
    total: number;
    byStatus: Record<TaskStatus, number>;
    noteCount: number;
    dependencyCount: number;
  };
  storage: {
    totalSize: number;
    pageSize: number;
    pageCount: number;
    walSize: number;
    cache: {
      hits: number;
      misses: number;
      size: number;
      maxSize: number;
      hitRate: number;
      evictions: number;
      memoryUsage: number;
    };
  };
}

export class SqliteMetrics {
  constructor(private readonly connection: SqliteConnection) {}

  /**
   * Get storage metrics
   */
  async getMetrics(): Promise<StorageMetrics> {
    const [taskStats, statusStats, storageStats] = await Promise.all([
      this.getTaskStats(),
      this.getStatusStats(),
      this.getStorageStats(),
    ]);

    // Convert status stats array to object
    const byStatus = Object.values(TaskStatus).reduce(
      (acc, status) => {
        acc[status] = statusStats.find(s => s.status === status)?.count || 0;
        return acc;
      },
      {} as Record<TaskStatus, number>
    );

    const memUsage = process.memoryUsage();

    return {
      tasks: {
        total: taskStats.total,
        byStatus,
        noteCount: taskStats.noteCount,
        dependencyCount: taskStats.dependencyCount,
      },
      storage: {
        totalSize: storageStats.totalSize,
        pageSize: storageStats.pageSize,
        pageCount: storageStats.pageCount,
        walSize: storageStats.walSize,
        cache: {
          hits: 0,
          misses: 0,
          size: 0,
          maxSize: 0,
          hitRate: 0,
          evictions: 0,
          memoryUsage: memUsage.heapUsed,
        },
      },
    };
  }

  /**
   * Run database maintenance
   */
  async maintenance(): Promise<void> {
    try {
      await this.connection.executeWithRetry(async () => {
        await this.connection.execute(async db => {
          // Run VACUUM to reclaim space and defragment
          await db.exec('VACUUM;');

          // Analyze tables for query optimization
          await db.exec('ANALYZE tasks;');
          await db.exec('ANALYZE sqlite_master;');

          // Update statistics
          await db.exec('PRAGMA optimize;');

          // Checkpoint WAL
          await db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        }, 'maintenance');
      }, 'maintenance');

      getLogger().info('Storage maintenance completed');
    } catch (error) {
      getLogger().error('Storage maintenance failed', { error });
      throw createError(
        ErrorCodes.STORAGE_ERROR,
        'Storage maintenance failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get task statistics
   */
  private async getTaskStats(): Promise<{
    total: number;
    noteCount: number;
    dependencyCount: number;
  }> {
    return this.connection.execute(async db => {
      const result = await db.get<{
        total: number;
        noteCount: number;
        dependencyCount: number;
      }>(`
        SELECT 
          COUNT(*) as total,
          SUM(
            CASE 
              WHEN notes IS NOT NULL 
              OR planning_notes IS NOT NULL 
              OR progress_notes IS NOT NULL 
              OR completion_notes IS NOT NULL 
              OR troubleshooting_notes IS NOT NULL 
              THEN 1 
              ELSE 0 
            END
          ) as noteCount,
          SUM(
            CASE 
              WHEN dependencies IS NOT NULL 
              AND json_valid(dependencies) 
              AND json_array_length(dependencies) > 0 
              THEN json_array_length(dependencies) 
              ELSE 0 
            END
          ) as dependencyCount
        FROM tasks
      `);

      return {
        total: Number(result?.total || 0),
        noteCount: Number(result?.noteCount || 0),
        dependencyCount: Number(result?.dependencyCount || 0),
      };
    }, 'getTaskStats');
  }

  /**
   * Get status statistics
   */
  private async getStatusStats(): Promise<Array<{ status: string; count: number }>> {
    return this.connection.execute(async db => {
      return db.all<{ status: string; count: number }[]>(`
        SELECT status, COUNT(*) as count
        FROM tasks
        GROUP BY status
      `);
    }, 'getStatusStats');
  }

  /**
   * Get storage statistics
   */
  private async getStorageStats(): Promise<{
    totalSize: number;
    pageSize: number;
    pageCount: number;
    walSize: number;
  }> {
    const [pageStats, walStats] = await Promise.all([
      this.connection.execute(async db => {
        return db.get<{
          page_count: number;
          page_size: number;
        }>(`
          SELECT 
            page_count,
            page_size
          FROM pragma_page_count, pragma_page_size
          LIMIT 1
        `);
      }, 'getPageStats'),
      this.getWalSize(),
    ]);

    const pageSize = Number(pageStats?.page_size || 0);
    const pageCount = Number(pageStats?.page_count || 0);

    return {
      totalSize: pageSize * pageCount,
      pageSize,
      pageCount,
      walSize: walStats,
    };
  }

  /**
   * Get WAL file size
   */
  private async getWalSize(): Promise<number> {
    try {
      const fs = await import('fs/promises');
      const dbPath = this.connection.dbPath;
      const walPath = `${dbPath}-wal`;

      try {
        const stats = await fs.stat(walPath);
        return stats.size;
      } catch {
        return 0; // WAL file doesn't exist
      }
    } catch {
      return 0; // Error accessing file system
    }
  }
}
