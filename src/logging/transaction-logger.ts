import { Logger } from './index.js';
import { Task, TaskStatus } from '../types/task.js';

interface TransactionLogEntry {
  timestamp: string;
  operation: string;
  taskPath: string;
  details: {
    fromStatus?: TaskStatus;
    toStatus?: TaskStatus;
    dependencies?: string[];
    metadata?: Record<string, unknown>;
    error?: string;
    warnings?: string[];
  };
  duration: number;
}

/**
 * Specialized logger for task transactions with detailed debugging information
 */
export class TransactionLogger {
  private static instance: TransactionLogger;
  private logger: Logger;
  private transactionLog: TransactionLogEntry[] = [];

  private constructor() {
    this.logger = Logger.getInstance().child({ component: 'TransactionLogger' });
  }

  static getInstance(): TransactionLogger {
    if (!TransactionLogger.instance) {
      TransactionLogger.instance = new TransactionLogger();
    }
    return TransactionLogger.instance;
  }

  /**
   * Log a task operation with timing and details
   */
  async logTransaction(
    operation: string,
    task: Task,
    details: {
      fromStatus?: TaskStatus;
      toStatus?: TaskStatus;
      dependencies?: string[];
      metadata?: Record<string, unknown>;
      error?: string;
      warnings?: string[];
    },
    startTime: number
  ): Promise<void> {
    const duration = Date.now() - startTime;

    const entry: TransactionLogEntry = {
      timestamp: new Date().toISOString(),
      operation,
      taskPath: task.path,
      details,
      duration,
    };

    this.transactionLog.push(entry);

    // Log to standard logger as well
    if (details.error) {
      this.logger.error(`Transaction failed: ${operation}`, {
        taskPath: task.path,
        error: details.error,
        duration,
      });
    } else {
      this.logger.info(`Transaction completed: ${operation}`, {
        taskPath: task.path,
        statusChange:
          details.fromStatus && details.toStatus
            ? `${details.fromStatus} -> ${details.toStatus}`
            : undefined,
        duration,
      });
    }

    // Log any warnings
    if (details.warnings?.length) {
      details.warnings.forEach(warning => {
        this.logger.warn(warning, { taskPath: task.path });
      });
    }
  }

  /**
   * Get recent transactions for a task
   */
  getTaskTransactions(taskPath: string, limit = 10): TransactionLogEntry[] {
    return this.transactionLog.filter(entry => entry.taskPath === taskPath).slice(-limit);
  }

  /**
   * Get transactions by type
   */
  getTransactionsByType(operation: string, limit = 50): TransactionLogEntry[] {
    return this.transactionLog.filter(entry => entry.operation === operation).slice(-limit);
  }

  /**
   * Get failed transactions
   */
  getFailedTransactions(limit = 50): TransactionLogEntry[] {
    return this.transactionLog.filter(entry => entry.details.error).slice(-limit);
  }

  /**
   * Get slow transactions (taking longer than threshold ms)
   */
  getSlowTransactions(thresholdMs = 1000, limit = 50): TransactionLogEntry[] {
    return this.transactionLog.filter(entry => entry.duration > thresholdMs).slice(-limit);
  }

  /**
   * Clear old transactions beyond retention limit
   */
  pruneTransactions(maxEntries = 10000): void {
    if (this.transactionLog.length > maxEntries) {
      this.transactionLog = this.transactionLog.slice(-maxEntries);
    }
  }

  /**
   * Get transaction statistics
   */
  getStats(): {
    totalTransactions: number;
    failureRate: number;
    averageDuration: number;
    operationCounts: Record<string, number>;
  } {
    const total = this.transactionLog.length;
    if (total === 0) {
      return {
        totalTransactions: 0,
        failureRate: 0,
        averageDuration: 0,
        operationCounts: {},
      };
    }

    const failed = this.transactionLog.filter(t => t.details.error).length;
    const totalDuration = this.transactionLog.reduce((sum, t) => sum + t.duration, 0);

    const operationCounts = this.transactionLog.reduce(
      (counts, t) => {
        counts[t.operation] = (counts[t.operation] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>
    );

    return {
      totalTransactions: total,
      failureRate: failed / total,
      averageDuration: totalDuration / total,
      operationCounts,
    };
  }
}
