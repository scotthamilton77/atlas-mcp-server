# Atlas MCP Server Error Handling Refactoring

## Current Error System Analysis

### Strengths
1. **Well-Organized Error Categories**
   - Task errors (1000-1999)
   - Storage errors (2000-2999)
   - Configuration errors (3000-3999)
   - Validation errors (4000-4999)
   - Operation errors (5000-5999)

2. **Rich Error Information**
   - Error codes
   - Detailed messages
   - Recovery suggestions
   - Error context
   - Type-safe error handling

3. **Error Hierarchy**
   - BaseError foundation
   - Specialized error types
   - Error wrapping support
   - User-friendly messages

## Integration Requirements

The error system needs to support:
1. New unified storage system
2. Enhanced validation system
3. Transaction coordination
4. Index operations
5. Batch processing

## Proposed Error Architecture

### 1. Directory Structure

```typescript
src/
└── core/
    └── errors/
        ├── categories/
        │   ├── task.ts
        │   ├── storage.ts
        │   ├── validation.ts
        │   ├── transaction.ts
        │   └── index.ts
        ├── handlers/
        │   ├── global.ts
        │   ├── domain.ts
        │   └── recovery.ts
        ├── types/
        │   ├── codes.ts
        │   ├── messages.ts
        │   └── handlers.ts
        └── coordinator.ts
```

### 2. Enhanced Error Categories

```typescript
// New error codes for unified systems
export const ErrorCodes = {
    // Existing codes...

    // Transaction errors (6000-6999)
    TRANSACTION_START: 'TRANSACTION_6001',
    TRANSACTION_COMMIT: 'TRANSACTION_6002',
    TRANSACTION_ROLLBACK: 'TRANSACTION_6003',
    TRANSACTION_TIMEOUT: 'TRANSACTION_6004',
    TRANSACTION_CONFLICT: 'TRANSACTION_6005',
    TRANSACTION_STATE: 'TRANSACTION_6006',

    // Index errors (7000-7999)
    INDEX_NOT_FOUND: 'INDEX_7001',
    INDEX_CORRUPTION: 'INDEX_7002',
    INDEX_SYNC: 'INDEX_7003',
    INDEX_OPERATION: 'INDEX_7004',
    INDEX_CONSTRAINT: 'INDEX_7005',

    // Batch errors (8000-8999)
    BATCH_SIZE: 'BATCH_8001',
    BATCH_TIMEOUT: 'BATCH_8002',
    BATCH_PARTIAL: 'BATCH_8003',
    BATCH_VALIDATION: 'BATCH_8004',
    
    // Recovery errors (9000-9999)
    RECOVERY_FAILED: 'RECOVERY_9001',
    BACKUP_FAILED: 'RECOVERY_9002',
    RESTORE_FAILED: 'RECOVERY_9003',
    CHECKPOINT_FAILED: 'RECOVERY_9004'
} as const;
```

### 3. Error Coordinator

```typescript
class ErrorCoordinator {
    constructor(
        private handlers: ErrorHandlerRegistry,
        private recovery: RecoveryManager,
        private logger: Logger
    ) {}

    async handle(error: unknown, context: ErrorContext): Promise<void> {
        const normalizedError = this.normalizeError(error);
        
        // Log error with context
        this.logger.error(normalizedError.getUserMessage(), {
            code: normalizedError.code,
            context,
            details: normalizedError.details
        });

        // Find appropriate handler
        const handler = this.handlers.getHandler(normalizedError.code);
        if (handler) {
            await handler.handle(normalizedError, context);
        }

        // Attempt recovery if needed
        if (this.shouldAttemptRecovery(normalizedError)) {
            await this.recovery.attemptRecovery(normalizedError, context);
        }
    }

    private normalizeError(error: unknown): BaseError {
        if (error instanceof BaseError) {
            return error;
        }
        return new BaseError(
            ErrorCodes.INTERNAL_ERROR,
            error instanceof Error ? error.message : 'Unknown error'
        );
    }

    private shouldAttemptRecovery(error: BaseError): boolean {
        return [
            ErrorCodes.STORAGE_ERROR,
            ErrorCodes.INDEX_CORRUPTION,
            ErrorCodes.TRANSACTION_STATE,
            ErrorCodes.RECOVERY_FAILED
        ].includes(error.code);
    }
}
```

### 4. Domain-Specific Error Handlers

#### Transaction Error Handler
```typescript
class TransactionErrorHandler implements ErrorHandler {
    constructor(
        private transactionManager: TransactionManager,
        private recovery: RecoveryManager
    ) {}

    async handle(error: BaseError, context: ErrorContext): Promise<void> {
        if (error.code.startsWith('TRANSACTION_')) {
            const txId = context.transactionId;
            if (txId) {
                await this.transactionManager.rollback(txId);
                await this.recovery.checkpointAfterRollback(txId);
            }
        }
    }
}
```

#### Index Error Handler
```typescript
class IndexErrorHandler implements ErrorHandler {
    constructor(
        private indexManager: IndexManager,
        private validator: IndexValidator
    ) {}

    async handle(error: BaseError, context: ErrorContext): Promise<void> {
        if (error.code.startsWith('INDEX_')) {
            // Verify index integrity
            const validation = await this.validator.verify();
            if (!validation.valid) {
                await this.indexManager.rebuild(validation.errors);
            }
        }
    }
}
```

### 5. Recovery Management

```typescript
class RecoveryManager {
    constructor(
        private storage: StorageManager,
        private indexing: IndexManager,
        private transactions: TransactionManager
    ) {}

    async attemptRecovery(error: BaseError, context: ErrorContext): Promise<void> {
        const strategy = this.getRecoveryStrategy(error);
        if (strategy) {
            await strategy.execute(context);
        }
    }

    private getRecoveryStrategy(error: BaseError): RecoveryStrategy | null {
        switch (error.code) {
            case ErrorCodes.STORAGE_ERROR:
                return new StorageRecoveryStrategy(this.storage);
            case ErrorCodes.INDEX_CORRUPTION:
                return new IndexRecoveryStrategy(this.indexing);
            case ErrorCodes.TRANSACTION_STATE:
                return new TransactionRecoveryStrategy(this.transactions);
            default:
                return null;
        }
    }
}
```

### 6. Integration Example

```typescript
class UnifiedStorageEngine {
    constructor(
        private errorCoordinator: ErrorCoordinator,
        // ... other dependencies
    ) {}

    async saveTask(task: Task): Promise<void> {
        try {
            await this.transactions.atomic(async () => {
                await this.storage.save(task);
                await this.indexing.updateIndexes(task);
            });
        } catch (error) {
            await this.errorCoordinator.handle(error, {
                operation: 'saveTask',
                taskId: task.id,
                transactionId: this.transactions.getCurrentId()
            });
            throw error; // Re-throw after handling
        }
    }
}
```

## Testing Strategy

### 1. Error Generation Tests
```typescript
describe('ErrorCoordinator', () => {
    it('handles and recovers from storage errors', async () => {
        const coordinator = new ErrorCoordinator();
        const error = new StorageError(
            ErrorCodes.STORAGE_ERROR,
            'Test error'
        );

        await coordinator.handle(error, {
            operation: 'test'
        });

        // Verify recovery attempted
        expect(mockRecovery.attemptRecovery).toHaveBeenCalled();
    });
});
```

### 2. Recovery Tests
```typescript
describe('RecoveryManager', () => {
    it('successfully recovers from index corruption', async () => {
        const manager = new RecoveryManager();
        const error = new IndexError(
            ErrorCodes.INDEX_CORRUPTION,
            'Corruption detected'
        );

        await manager.attemptRecovery(error, {
            operation: 'test'
        });

        // Verify index rebuilt
        expect(mockIndex.isValid()).toBe(true);
    });
});
```

### 3. Integration Tests
```typescript
describe('Error Integration', () => {
    it('coordinates error handling across systems', async () => {
        const engine = new UnifiedStorageEngine();
        
        // Simulate cascading failure
        mockStorage.save.mockRejectedValue(new Error('Storage failed'));
        
        await expect(engine.saveTask(task)).rejects.toThrow();
        
        // Verify proper error handling
        expect(mockTransaction.wasRolledBack).toBe(true);
        expect(mockIndex.wasValidated).toBe(true);
        expect(mockRecovery.wasAttempted).toBe(true);
    });
});
```

## Migration Strategy

### 1. Phase 1: Error System Enhancement
- Add new error categories
- Implement ErrorCoordinator
- Create recovery strategies
- Update error messages

### 2. Phase 2: Handler Implementation
- Create domain-specific handlers
- Implement recovery logic
- Add error tracking
- Update logging

### 3. Phase 3: Integration
- Connect with UnifiedStorageEngine
- Update existing error handling
- Add recovery points
- Implement monitoring

### 4. Phase 4: Testing & Monitoring
- Add error generation tests
- Test recovery scenarios
- Add error tracking
- Implement alerts

This error handling refactoring will:
1. Support new unified architecture
2. Improve error recovery
3. Enhance debugging capabilities
4. Maintain system reliability
5. Provide better error guidance
