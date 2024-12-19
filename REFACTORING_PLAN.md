# Atlas MCP Server Refactoring Plan

## Current Architecture Assessment

After detailed code review, we've identified the following key insights:

### 1. Component Strengths

#### StorageManager (storage/index.ts)
- **Excellent File Operations**
  - Atomic writes with temp files
  - Proper file locking
  - Robust backup system
  - Checksum verification
  - Data migration support
  - Permission management
  - Cleanup routines

#### TaskStore (task/core/task-store.ts)
- **Superior In-Memory Operations**
  - Efficient caching (AdaptiveCacheManager)
  - Advanced indexing (TaskIndexManager)
  - Rich query capabilities
  - Optimized batch operations
  - Memory-efficient transactions

#### TaskManager (task-manager.ts)
- **API Layer**
  - Task validation
  - Error handling
  - Session management
  - Response formatting
  - Bulk operations

### 2. Current Issues

1. **Duplicate Persistence Logic**
   - Both StorageManager and TaskStore implement:
     * Transaction management
     * Data validation
     * Error handling
     * Status tracking

2. **Mixed Responsibilities**
   - TaskManager handles both:
     * High-level coordination
     * Low-level storage details

3. **Redundant Validation**
   - Validation occurs in multiple places:
     * StorageManager
     * TaskStore
     * TaskManager
     * Individual validators

## Refactoring Strategy

### 1. Core Architecture Changes

#### Create New Core Components

1. **UnifiedStorageEngine**
```typescript
class UnifiedStorageEngine {
    constructor(
        private fileManager: FileManager,
        private memoryManager: MemoryManager,
        private transactionCoordinator: TransactionCoordinator
    ) {}
    
    // Atomic operations across both storage layers
    async atomic<T>(operation: () => Promise<T>): Promise<T>;
    
    // Coordinated storage operations
    async save(data: Task[]): Promise<void>;
    async load(): Promise<Task[]>;
    
    // Transaction management
    async beginTransaction(): Promise<string>;
    async commit(transactionId: string): Promise<void>;
    async rollback(transactionId: string): Promise<void>;
}
```

2. **FileManager** (Extracted from StorageManager)
```typescript
class FileManager {
    // File operations
    async write(path: string, data: string): Promise<void>;
    async read(path: string): Promise<string>;
    
    // Backup management
    async createBackup(): Promise<void>;
    async restore(): Promise<void>;
    
    // File locking
    async acquireLock(key: string): Promise<void>;
    async releaseLock(key: string): Promise<void>;
}
```

3. **MemoryManager** (Extracted from TaskStore)
```typescript
class MemoryManager {
    constructor(
        private cache: AdaptiveCacheManager,
        private index: TaskIndexManager
    ) {}
    
    // Memory operations
    set(key: string, value: Task): void;
    get(key: string): Task | null;
    
    // Indexing
    updateIndex(task: Task): void;
    query(criteria: QueryCriteria): Task[];
}
```

4. **TransactionCoordinator**
```typescript
class TransactionCoordinator {
    // Coordinate transactions across storage layers
    async coordinate<T>(
        operation: () => Promise<T>,
        options: TransactionOptions
    ): Promise<T>;
    
    // Transaction lifecycle
    async prepare(transactionId: string): Promise<void>;
    async commit(transactionId: string): Promise<void>;
    async rollback(transactionId: string): Promise<void>;
}
```

### 2. Implementation Plan

1. **Phase 1: Core Infrastructure**
   - Create new directory structure:
   ```
   src/
   ├── core/
   │   ├── storage/
   │   │   ├── file-manager.ts
   │   │   ├── memory-manager.ts
   │   │   └── unified-engine.ts
   │   ├── transaction/
   │   │   ├── coordinator.ts
   │   │   └── types.ts
   │   └── task/
   │       ├── manager.ts
   │       └── validator.ts
   ```
   
   - Implement core components
   - Add comprehensive tests
   - Create migration utilities

2. **Phase 2: Storage Layer**
   - Implement FileManager
   - Implement MemoryManager
   - Add storage tests
   - Create data migration tools

3. **Phase 3: Task Management**
   - Refactor TaskManager
   - Implement new validators
   - Update task operations
   - Add integration tests

4. **Phase 4: Integration**
   - Connect all components
   - Implement transaction coordination
   - Add system tests
   - Create monitoring tools

### 3. Migration Steps

1. **Preparation**
```bash
# Create new directory structure
mkdir -p src/core/{storage,transaction,task}

# Create backup of current state
cp -r src/storage src/storage.bak
cp -r src/task src/task.bak
```

2. **Implementation**
```typescript
// Start with core interfaces
interface StorageEngine {
    atomic<T>(operation: () => Promise<T>): Promise<T>;
    save(data: Task[]): Promise<void>;
    load(): Promise<Task[]>;
}

interface TransactionManager {
    begin(): Promise<string>;
    commit(id: string): Promise<void>;
    rollback(id: string): Promise<void>;
}
```

3. **Testing**
```typescript
describe('UnifiedStorageEngine', () => {
    it('handles atomic operations across storage layers', async () => {
        // Test atomic operations
    });
    
    it('coordinates file and memory operations', async () => {
        // Test coordination
    });
    
    it('manages transactions properly', async () => {
        // Test transactions
    });
});
```

### 4. File-by-File Changes

1. **Files to Remove**
   - `src/storage/index.ts` (split into new components)
   - `src/task/core/task-store.ts` (functionality moved to MemoryManager)
   - `src/task/core/transactions/transaction-manager.ts` (replaced by TransactionCoordinator)

2. **Files to Create**
   - `src/core/storage/file-manager.ts`
   - `src/core/storage/memory-manager.ts`
   - `src/core/storage/unified-engine.ts`
   - `src/core/transaction/coordinator.ts`
   - `src/core/task/manager.ts`

3. **Files to Modify**
   - `src/index.ts` (update initialization)
   - `src/task-manager.ts` (simplify to use new components)
   - `src/types/task.ts` (add new interfaces)

### 5. Testing Strategy

1. **Unit Tests**
   - Test each component in isolation
   - Mock dependencies
   - Test edge cases
   - Verify error handling

2. **Integration Tests**
   - Test component interactions
   - Verify transaction integrity
   - Test recovery scenarios
   - Check performance

3. **System Tests**
   - End-to-end workflows
   - Load testing
   - Failure recovery
   - Performance benchmarks

### 6. Rollback Plan

1. **Backup Current State**
   ```bash
   # Create backup
   tar -czf atlas-backup-$(date +%Y%m%d).tar.gz src/
   
   # Store configuration
   cp config/*.json config/backup/
   ```

2. **Verification Points**
   - Data integrity checks
   - Performance benchmarks
   - Error rate monitoring
   - Transaction success rate

3. **Rollback Procedure**
   ```bash
   # Restore from backup
   tar -xzf atlas-backup-*.tar.gz
   
   # Restore configuration
   cp config/backup/*.json config/
   ```

This refactoring plan provides a clear path forward while maintaining system stability and data integrity throughout the process.
