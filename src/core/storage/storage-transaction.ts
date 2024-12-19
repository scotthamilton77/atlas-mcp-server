import { Task } from '../../shared/types/task.js';

/**
 * Represents a storage operation to be executed within a transaction
 */
interface StorageOperation {
  type: 'save' | 'delete';
  taskId: string;
  task?: Task;
}

/**
 * Manages atomic storage operations with rollback capability
 */
export class StorageTransaction {
  private operations: StorageOperation[] = [];
  private backupTasks: Map<string, Task | null> = new Map();
  private committed = false;
  private rolledBack = false;

  /**
   * Add a save operation to the transaction
   */
  async addSave(task: Task): Promise<void> {
    this.validateState();
    this.operations.push({ type: 'save', taskId: task.id, task });
  }

  /**
   * Add a delete operation to the transaction
   */
  async addDelete(taskId: string): Promise<void> {
    this.validateState();
    this.operations.push({ type: 'delete', taskId });
  }

  /**
   * Record the original state of a task for potential rollback
   */
  async backup(taskId: string, task: Task | null): Promise<void> {
    if (!this.backupTasks.has(taskId)) {
      this.backupTasks.set(taskId, task ? { ...task } : null);
    }
  }

  /**
   * Get all operations in this transaction
   */
  getOperations(): StorageOperation[] {
    return [...this.operations];
  }

  /**
   * Get backup task for rollback
   */
  getBackup(taskId: string): Task | null | undefined {
    return this.backupTasks.get(taskId);
  }

  /**
   * Mark transaction as committed
   */
  commit(): void {
    this.validateState();
    this.committed = true;
  }

  /**
   * Mark transaction as rolled back
   */
  rollback(): void {
    this.validateState();
    this.rolledBack = true;
  }

  /**
   * Check if transaction is committed
   */
  isCommitted(): boolean {
    return this.committed;
  }

  /**
   * Check if transaction is rolled back
   */
  isRolledBack(): boolean {
    return this.rolledBack;
  }

  /**
   * Get affected task IDs
   */
  getAffectedIds(): string[] {
    return [...new Set(this.operations.map(op => op.taskId))];
  }

  /**
   * Validate transaction state
   */
  private validateState(): void {
    if (this.committed) {
      throw new Error('Transaction already committed');
    }
    if (this.rolledBack) {
      throw new Error('Transaction already rolled back');
    }
  }

  /**
   * Get transaction size
   */
  size(): number {
    return this.operations.length;
  }

  /**
   * Check if transaction is empty
   */
  isEmpty(): boolean {
    return this.operations.length === 0;
  }

  /**
   * Get transaction summary
   */
  getSummary(): {
    operations: number;
    saves: number;
    deletes: number;
    affectedIds: string[];
  } {
    const saves = this.operations.filter(op => op.type === 'save').length;
    const deletes = this.operations.filter(op => op.type === 'delete').length;

    return {
      operations: this.operations.length,
      saves,
      deletes,
      affectedIds: this.getAffectedIds()
    };
  }
}
