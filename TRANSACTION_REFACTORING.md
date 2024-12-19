# Atlas MCP Server Transaction Refactoring

## Current Transaction Systems Analysis

### 1. TaskTransactionManager Strengths
- Timeout handling
- Operation tracking
- Statistics collection
- Rollback support
- Proper cleanup
- Comprehensive logging

### 2. StorageManager Transaction Features
- File-level atomic operations
- Backup creation during transactions
- Checksum verification
- Basic rollback support

## Issues to Address

1. **Separate Transaction Domains**
   - Memory transactions (TaskTransactionManager)
   - File transactions (StorageManager)
   - No coordination between domains

2. **Inconsistent Guarantees**
   - Different timeout handling
   - Different rollback mechanisms
   - Different error handling

3. **Performance Concerns**
   - Double validation
   - Redundant operations
   - Multiple commits

## Proposed Transaction Architecture

### 1. Directory Structure

```typescript
src/
└── core/
    └── transaction/
        ├── coordinator/
        │   ├── memory.ts
        │   ├── storage.ts
        │   └── index.ts
        ├── managers/
        │   ├── file-transaction.ts
        │   └── memory-transaction.ts
        ├── types/
        │   ├── common.ts
        │   ├── operations.ts
        │   └── results.ts
        └── utils/
            ├── timeout.ts
            └── rollback.ts
```

### 2. Core Components

#### TransactionCoordinator
```typescript
class TransactionCoordinator {
    constructor(
        private memoryManager: MemoryTransactionManager,
        private fileManager: FileTransactionManager,
        private config: TransactionConfig
    ) {}

    async atomic<T>(operation: () => Promise<T>): Promise<T> {
        const transactionId = this.startTransaction();
        
        try {
            // Start both transaction types
            await this.memoryManager.begin(transactionId);
            await this.fileManager.begin(transactionId);

            // Execute operation
            const result = await operation();

            // Commit both transactions
            await this.memoryManager.prepare(transactionId);
            await this.fileManager.prepare(transactionId);
            
            await this.memoryManager.commit(transactionId);
            await this.fileManager.commit(transactionId);

            return result;
        } catch (error) {
            // Rollback both transactions
            await this.rollbackAll(transactionId);
            throw error;
        }
    }

    private async rollbackAll(transactionId: string): Promise<void> {
        try {
            await Promise.all([
                this.memoryManager.rollback(transactionId),
                this.fileManager.rollback(transactionId)
            ]);
        } catch (error) {
            this.logger.error('Rollback failed', {
                transactionId,
                error
            });
            throw error;
        }
    }
}
```

#### MemoryTransactionManager
```typescript
class MemoryTransactionManager {
    constructor(
        private timeoutManager: TimeoutManager,
        private operationLogger: OperationLogger
    ) {}

    async begin(transactionId: string): Promise<void> {
        this.timeoutManager.startTimeout(transactionId);
        await this.operationLogger.logBegin(transactionId);
    }

    async prepare(transactionId: string): Promise<void> {
        // Verify all operations are valid
        await this.validateOperations(transactionId);
        
        // Create operation snapshot
        await this.createSnapshot(transactionId);
    }

    async commit(transactionId: string): Promise<void> {
        this.timeoutManager.clearTimeout(transactionId);
        await this.operationLogger.logCommit(transactionId);
    }

    async rollback(transactionId: string): Promise<void> {
        // Restore from snapshot
        await this.restoreSnapshot(transactionId);
        
        this.timeoutManager.clearTimeout(transactionId);
        await this.operationLogger.logRollback(transactionId);
    }
}
```

#### FileTransactionManager
```typescript
class FileTransactionManager {
    constructor(
        private backupManager: BackupManager,
        private checksumValidator: ChecksumValidator
    ) {}

    async begin(transactionId: string): Promise<void> {
        // Create pre-transaction backup
        await this.backupManager.createBackup(transactionId);
    }

    async prepare(transactionId: string): Promise<void> {
        // Verify file integrity
        await this.checksumValidator.validate(transactionId);
        
        // Prepare temporary files
        await this.prepareTempFiles(transactionId);
    }

    async commit(transactionId: string): Promise<void> {
        // Atomic file operations
        await this.atomicFileOperations(transactionId);
        
        // Cleanup temporary files
        await this.cleanup(transactionId);
    }

    async rollback(transactionId: string): Promise<void> {
        // Restore from backup
        await this.backupManager.restore(transactionId);
        
        // Cleanup temporary files
        await this.cleanup(transactionId);
    }
}
```

### 3. Transaction Operation Types

```typescript
interface TransactionOperation {
    id: string;
    type: OperationType;
    timestamp: string;
    metadata: {
        domain: 'memory' | 'file';
        priority: number;
        requires: string[];
    };
}

interface MemoryOperation extends TransactionOperation {
    domain: 'memory';
    data: {
        target: string;
        action: 'create' | 'update' | 'delete';
        payload: unknown;
    };
}

interface FileOperation extends TransactionOperation {
    domain: 'file';
    data: {
        path: string;
        action: 'write' | 'delete' | 'move';
        content?: string;
        checksum?: string;
    };
}
```

### 4. Integration Example

```typescript
class UnifiedStorageEngine {
    constructor(
        private transactionCoordinator: TransactionCoordinator,
        private validator: ValidationCoordinator
    ) {}

    async saveTask(task: Task): Promise<void> {
        await this.transactionCoordinator.atomic(async () => {
            // Validate task
            const validationResult = await this.validator.validate(task);
            if (!validationResult.success) {
                throw new ValidationError(validationResult.error);
            }

            // Save to memory
            await this.memoryStore.set(task.id, task);

            // Save to file
            await this.fileStore.write(
                this.getTaskPath(task.id),
                JSON.stringify(task)
            );
        });
    }
}
```

## Migration Strategy

### 1. Phase 1: Infrastructure
- Create new transaction directory structure
- Implement core interfaces
- Set up logging and monitoring

### 2. Phase 2: Core Components
- Implement TransactionCoordinator
- Create domain-specific managers
- Add timeout handling
- Implement rollback mechanisms

### 3. Phase 3: Integration
- Update UnifiedStorageEngine
- Modify existing transaction usage
- Add new transaction hooks
- Update error handling

### 4. Phase 4: Testing
- Add unit tests for each component
- Create integration tests
- Test failure scenarios
- Verify rollback functionality

## Testing Strategy

### 1. Unit Tests
```typescript
describe('TransactionCoordinator', () => {
    it('coordinates memory and file transactions', async () => {
        const coordinator = new TransactionCoordinator(
            new MemoryTransactionManager(),
            new FileTransactionManager()
        );

        await coordinator.atomic(async () => {
            // Test operations
        });

        // Verify state
    });

    it('handles rollback on failure', async () => {
        const coordinator = new TransactionCoordinator(
            new MemoryTransactionManager(),
            new FileTransactionManager()
        );

        try {
            await coordinator.atomic(async () => {
                throw new Error('Test error');
            });
        } catch {
            // Verify rollback
        }
    });
});
```

### 2. Integration Tests
```typescript
describe('UnifiedStorageEngine', () => {
    it('maintains consistency across storage layers', async () => {
        const engine = new UnifiedStorageEngine(
            new TransactionCoordinator(),
            new ValidationCoordinator()
        );

        await engine.saveTask(testTask);

        // Verify memory state
        const memoryTask = await engine.memoryStore.get(testTask.id);
        expect(memoryTask).toEqual(testTask);

        // Verify file state
        const fileTask = await engine.fileStore.read(testTask.id);
        expect(fileTask).toEqual(testTask);
    });
});
```

### 3. Stress Tests
```typescript
describe('Transaction Stress Tests', () => {
    it('handles concurrent transactions', async () => {
        const coordinator = new TransactionCoordinator();
        
        const operations = Array.from({ length: 100 }, (_, i) => 
            coordinator.atomic(async () => {
                // Concurrent operations
            })
        );

        await Promise.all(operations);
        // Verify system state
    });
});
```

## Rollback Plan

### 1. Backup Strategy
- Create system state snapshots
- Store transaction logs
- Maintain file backups
- Track memory state

### 2. Recovery Process
1. Stop incoming transactions
2. Roll back active transactions
3. Restore from backups
4. Verify system state
5. Resume operations

### 3. Monitoring
- Track transaction success rate
- Monitor operation latency
- Log rollback frequency
- Alert on failures

This transaction refactoring will:
1. Ensure data consistency across storage layers
2. Improve error handling and recovery
3. Enhance performance through coordinated operations
4. Provide better monitoring and debugging capabilities
5. Maintain system reliability during failures
