# Atlas MCP Server Indexing Refactoring

## Current Indexing System Analysis

### Strengths
1. **Multiple Index Types**
   - By ID (primary index)
   - By status
   - By parent
   - By session
   - By dependency

2. **Performance Features**
   - Parallel operations support
   - Batch processing
   - Efficient lookups
   - Memory optimization

3. **Operational Features**
   - Comprehensive logging
   - Error handling
   - Statistics tracking
   - Clean transaction support

## Integration Requirements

The current indexing system needs to be integrated with:
1. Unified storage system
2. New transaction coordinator
3. Enhanced validation system

## Proposed Architecture

### 1. Directory Structure

```typescript
src/
└── core/
    └── indexing/
        ├── indexes/
        │   ├── primary.ts
        │   ├── status.ts
        │   ├── hierarchy.ts
        │   ├── session.ts
        │   └── dependency.ts
        ├── operations/
        │   ├── batch.ts
        │   ├── parallel.ts
        │   └── transaction.ts
        ├── types/
        │   ├── common.ts
        │   ├── indexes.ts
        │   └── operations.ts
        └── coordinator.ts
```

### 2. Core Components

#### IndexCoordinator
```typescript
class IndexCoordinator {
    constructor(
        private indexes: IndexRegistry,
        private operationManager: IndexOperationManager,
        private transactionManager: TransactionCoordinator
    ) {}

    async atomic<T>(operation: () => Promise<T>): Promise<T> {
        return this.transactionManager.atomic(async () => {
            const snapshot = await this.createSnapshot();
            try {
                const result = await operation();
                await this.verifyIndexIntegrity();
                return result;
            } catch (error) {
                await this.restoreSnapshot(snapshot);
                throw error;
            }
        });
    }

    private async createSnapshot(): Promise<IndexSnapshot> {
        return {
            byId: new Map(this.indexes.primary.entries()),
            byStatus: this.cloneNestedMap(this.indexes.status),
            byParent: this.cloneNestedMap(this.indexes.hierarchy),
            bySession: this.cloneNestedMap(this.indexes.session),
            byDependency: this.cloneNestedMap(this.indexes.dependency)
        };
    }
}
```

#### IndexRegistry
```typescript
class IndexRegistry {
    constructor(
        readonly primary: PrimaryIndex,
        readonly status: StatusIndex,
        readonly hierarchy: HierarchyIndex,
        readonly session: SessionIndex,
        readonly dependency: DependencyIndex
    ) {}

    async initialize(): Promise<void> {
        await Promise.all([
            this.primary.initialize(),
            this.status.initialize(),
            this.hierarchy.initialize(),
            this.session.initialize(),
            this.dependency.initialize()
        ]);
    }

    async verify(): Promise<IndexVerificationResult> {
        const results = await Promise.all([
            this.primary.verify(),
            this.status.verify(),
            this.hierarchy.verify(),
            this.session.verify(),
            this.dependency.verify()
        ]);

        return this.mergeVerificationResults(results);
    }
}
```

#### IndexOperationManager
```typescript
class IndexOperationManager {
    constructor(
        private config: IndexOperationConfig,
        private metrics: MetricsCollector
    ) {}

    async batch<T>(
        operations: IndexOperation[],
        options: BatchOptions
    ): Promise<BatchResult<T>> {
        const batches = this.createBatches(operations, options.batchSize);
        const results = [];

        for (const batch of batches) {
            if (options.parallel) {
                results.push(...await Promise.all(
                    batch.map(op => this.executeOperation(op))
                ));
            } else {
                for (const operation of batch) {
                    results.push(await this.executeOperation(operation));
                }
            }
        }

        return this.processBatchResults(results);
    }

    private createBatches<T>(
        items: T[],
        size: number
    ): T[][] {
        return items.reduce((batches, item) => {
            const current = batches[batches.length - 1];
            if (current.length < size) {
                current.push(item);
            } else {
                batches.push([item]);
            }
            return batches;
        }, [[]] as T[][]);
    }
}
```

### 3. Index Types

#### Primary Index
```typescript
class PrimaryIndex implements Index {
    private store: Map<string, Task>;
    
    async get(id: string): Promise<Task | null> {
        const task = this.store.get(id);
        if (task) {
            this.metrics.recordHit('primary_index');
            return task;
        }
        this.metrics.recordMiss('primary_index');
        return null;
    }

    async set(task: Task): Promise<void> {
        this.store.set(task.id, task);
        this.metrics.recordWrite('primary_index');
    }
}
```

#### Status Index
```typescript
class StatusIndex implements Index {
    private store: Map<TaskStatus, Set<string>>;
    
    async getByStatus(status: TaskStatus): Promise<Task[]> {
        const ids = this.store.get(status) || new Set();
        return this.loadTasks(Array.from(ids));
    }

    private async loadTasks(ids: string[]): Promise<Task[]> {
        const tasks = await Promise.all(
            ids.map(id => this.primaryIndex.get(id))
        );
        return tasks.filter((t): t is Task => t !== null);
    }
}
```

### 4. Integration with Storage

```typescript
class UnifiedStorageEngine {
    constructor(
        private storage: StorageManager,
        private indexing: IndexCoordinator,
        private transactions: TransactionCoordinator
    ) {}

    async saveTask(task: Task): Promise<void> {
        await this.transactions.atomic(async () => {
            // Update storage
            await this.storage.save(task);

            // Update indexes
            await this.indexing.atomic(async () => {
                await this.indexing.primary.set(task);
                await this.indexing.status.add(task);
                await this.indexing.hierarchy.add(task);
                await this.indexing.session.add(task);
                await this.indexing.dependency.add(task);
            });
        });
    }

    async getTask(id: string): Promise<Task | null> {
        // Try index first
        const task = await this.indexing.primary.get(id);
        if (task) {
            return task;
        }

        // Fall back to storage
        const storedTask = await this.storage.load(id);
        if (storedTask) {
            // Update index
            await this.indexing.atomic(async () => {
                await this.indexing.primary.set(storedTask);
            });
        }

        return storedTask;
    }
}
```

## Performance Optimizations

### 1. Index Caching
```typescript
class CachedIndex<K, V> implements Index<K, V> {
    constructor(
        private cache: Cache,
        private store: Store<K, V>,
        private config: CacheConfig
    ) {}

    async get(key: K): Promise<V | null> {
        // Try cache
        const cached = await this.cache.get(this.getCacheKey(key));
        if (cached) {
            return cached;
        }

        // Load from store
        const value = await this.store.get(key);
        if (value) {
            await this.cache.set(
                this.getCacheKey(key),
                value,
                this.config.ttl
            );
        }

        return value;
    }
}
```

### 2. Batch Operations
```typescript
class BatchProcessor {
    async process<T>(
        items: T[],
        operation: (item: T) => Promise<void>,
        options: BatchOptions
    ): Promise<void> {
        const batches = this.createBatches(items, options.batchSize);
        
        for (const batch of batches) {
            if (options.parallel) {
                await Promise.all(
                    batch.map(item => operation(item))
                );
            } else {
                for (const item of batch) {
                    await operation(item);
                }
            }
        }
    }
}
```

## Testing Strategy

### 1. Unit Tests
```typescript
describe('IndexCoordinator', () => {
    it('maintains index consistency during operations', async () => {
        const coordinator = new IndexCoordinator();
        
        await coordinator.atomic(async () => {
            await coordinator.primary.set(task);
            await coordinator.status.add(task);
            
            // Verify immediate consistency
            const indexed = await coordinator.primary.get(task.id);
            expect(indexed).toEqual(task);
            
            const byStatus = await coordinator.status.get(task.status);
            expect(byStatus).toContain(task.id);
        });
    });
});
```

### 2. Performance Tests
```typescript
describe('Index Performance', () => {
    it('handles concurrent operations efficiently', async () => {
        const operations = Array.from(
            { length: 1000 },
            (_, i) => ({ type: 'set', task: createTask(i) })
        );

        const startTime = Date.now();
        await indexing.batch(operations, { parallel: true });
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(1000); // 1 second
    });
});
```

### 3. Integration Tests
```typescript
describe('Storage Integration', () => {
    it('coordinates storage and index operations', async () => {
        const engine = new UnifiedStorageEngine();
        
        await engine.saveTask(task);
        
        // Verify storage
        const stored = await engine.storage.load(task.id);
        expect(stored).toEqual(task);
        
        // Verify indexes
        const indexed = await engine.indexing.primary.get(task.id);
        expect(indexed).toEqual(task);
        
        const byStatus = await engine.indexing.status.get(task.status);
        expect(byStatus).toContain(task.id);
    });
});
```

## Migration Strategy

### 1. Phase 1: Infrastructure
- Create new index directory structure
- Implement core interfaces
- Set up metrics collection

### 2. Phase 2: Core Components
- Implement IndexCoordinator
- Create specialized indexes
- Add caching layer
- Implement batch processing

### 3. Phase 3: Integration
- Connect with UnifiedStorageEngine
- Integrate with TransactionCoordinator
- Update existing code to use new system

### 4. Phase 4: Optimization
- Add performance monitoring
- Implement caching strategies
- Optimize batch operations
- Add parallel processing

This indexing refactoring will:
1. Preserve existing efficient indexing capabilities
2. Integrate with new storage and transaction systems
3. Improve performance through caching and batching
4. Provide better monitoring and debugging
5. Maintain system reliability
