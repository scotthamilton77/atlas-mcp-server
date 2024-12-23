# Atlas MCP Server Implementation Plan

## Core System Improvements

### 1. Import Path Standardization & Index Files
```typescript
// Update all imports to use .js extension
import { Task, TaskStatus } from './types/task.js';
import { TaskStorage } from './types/storage.js';
import { Logger } from './logging/index.js';
import { ErrorCodes, createError } from './errors/index.js';

// Add missing index files
// /task/core/batch/index.ts
export * from './base-batch-processor.js';
export * from './dependency-aware-batch-processor.js';
export * from './generic-batch-processor.js';
export * from './task-status-batch-processor.js';

// /task/core/cache/index.ts
export * from './cache-manager.js';
export * from './cache-types.js';

// /task/core/indexing/index.ts
export * from './index-manager.js';

// /task/core/transactions/index.ts
export * from './transaction-manager.js';
export * from './transaction-types.js';
```

### 2. Batch Processing Architecture
```typescript
// src/task/core/batch/common/batch-utils.ts
export class BatchUtils {
  static validateBatch(batch: BatchData[]): ValidationResult {
    return {
      valid: true,
      errors: []
    };
  }

  static async processBatch<T>(
    batch: BatchData[],
    processor: (item: BatchData) => Promise<T>
  ): Promise<BatchResult<T>> {
    const results: T[] = [];
    const errors: Error[] = [];
    
    for (const item of batch) {
      try {
        results.push(await processor(item));
      } catch (error) {
        errors.push(error);
      }
    }
    
    return { results, errors };
  }
}

// src/task/core/batch/base-batch-processor.ts
export abstract class BaseBatchProcessor {
  constructor(protected readonly dependencies: BatchDependencies) {}
  
  protected abstract process(): Promise<void>;
  protected abstract validate(): Promise<boolean>;
  
  async execute(): Promise<void> {
    if (await this.validate()) {
      await this.process();
    }
  }
}

// src/task/core/batch/dependency-aware-batch-processor.ts
export class DependencyAwareBatchProcessor extends BaseBatchProcessor {
  protected async process(): Promise<void> {
    const { validator, logger, storage } = this.dependencies;
    // Implementation
  }
  
  protected async validate(): Promise<boolean> {
    // Implementation
    return true;
  }
}
```

### 3. Event System Integration
```typescript
// src/events/event-manager.ts
export class EventManager {
  private static instance: EventManager;
  private emitter: EventEmitter;
  private logger: Logger;
  
  private constructor() {
    this.emitter = new EventEmitter();
    this.logger = Logger.getInstance().child({ component: 'EventManager' });
    this.setupErrorHandling();
  }
  
  static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager();
    }
    return EventManager.instance;
  }
  
  emit(event: EventTypes, data: unknown): void {
    try {
      this.logger.debug('Emitting event', { event, data });
      this.emitter.emit(event, data);
    } catch (error) {
      this.logger.error('Event emission failed', { event, error });
    }
  }
  
  on(event: EventTypes, handler: (data: unknown) => void): void {
    this.emitter.on(event, handler);
  }
  
  private setupErrorHandling(): void {
    this.emitter.on('error', (error) => {
      this.logger.error('Event emitter error', { error });
    });
  }
}

// src/types/events.ts
export enum EventTypes {
  TASK_CREATED = 'task:created',
  TASK_UPDATED = 'task:updated',
  TASK_DELETED = 'task:deleted',
  TASK_STATUS_CHANGED = 'task:status:changed',
  CACHE_INVALIDATED = 'cache:invalidated',
  ERROR_OCCURRED = 'error:occurred',
  MEMORY_PRESSURE = 'memory:pressure',
  STORAGE_ERROR = 'storage:error',
  BATCH_COMPLETED = 'batch:completed'
}

export interface TaskEvent {
  task: Task;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface CacheEvent {
  type: 'invalidated' | 'cleared' | 'pressure';
  timestamp: number;
  metadata?: {
    reason?: string;
    memoryUsage?: number;
  };
}
```

### 4. Task Management Architecture
```typescript
// src/task/operations/task-operations.ts
export class TaskOperations {
  constructor(
    private storage: TaskStorage,
    private validator: TaskValidator,
    private eventManager: EventManager,
    private logger: Logger
  ) {}

  async createTask(input: CreateTaskInput): Promise<Task> {
    await this.validator.validateCreate(input);
    const task = await this.storage.createTask(input);
    this.eventManager.emit(EventTypes.TASK_CREATED, { task, timestamp: Date.now() });
    return task;
  }

  async updateTask(path: string, updates: UpdateTaskInput): Promise<Task> {
    await this.validator.validateUpdate(path, updates);
    const task = await this.storage.updateTask(path, updates);
    this.eventManager.emit(EventTypes.TASK_UPDATED, { task, timestamp: Date.now() });
    return task;
  }
}

// src/task/validation/task-validator.ts
export class TaskValidator {
  constructor(
    private storage: TaskStorage,
    private logger: Logger
  ) {}

  async validateCreate(input: CreateTaskInput): Promise<void> {
    // Implementation
  }

  async validateUpdate(path: string, updates: UpdateTaskInput): Promise<void> {
    // Implementation
  }
}

// src/task/relationships/task-relationships.ts
export class TaskRelationships {
  constructor(
    private storage: TaskStorage,
    private eventManager: EventManager,
    private logger: Logger
  ) {}

  async updateDependencies(task: Task, dependencies: string[]): Promise<void> {
    // Implementation
  }

  async validateHierarchy(parentPath: string, childType: TaskType): Promise<void> {
    // Implementation
  }
}

// src/task/memory/task-memory-manager.ts
export class TaskMemoryManager {
  constructor(
    private eventManager: EventManager,
    private logger: Logger
  ) {
    this.setupMemoryMonitoring();
  }

  private setupMemoryMonitoring(): void {
    // Implementation
  }

  async clearCaches(): Promise<void> {
    // Implementation
  }
}
```

### 5. Cache System Enhancement
```typescript
// src/task/core/cache/cache-coordinator.ts
export class CacheCoordinator {
  private metrics: CacheMetrics;
  
  constructor(
    private cacheManager: CacheManager,
    private eventManager: EventManager,
    private logger: Logger
  ) {
    this.metrics = new CacheMetrics();
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    this.eventManager.on(EventTypes.TASK_UPDATED, () => this.invalidateTaskCache());
    this.eventManager.on(EventTypes.MEMORY_PRESSURE, () => this.reduceCacheSize());
  }
  
  private async invalidateTaskCache(): Promise<void> {
    await this.cacheManager.invalidate();
    this.eventManager.emit(EventTypes.CACHE_INVALIDATED, {
      timestamp: Date.now(),
      metadata: { reason: 'task_update' }
    });
  }
  
  private async reduceCacheSize(): Promise<void> {
    const before = this.metrics.getCacheSize();
    await this.cacheManager.reduce();
    const after = this.metrics.getCacheSize();
    
    this.logger.info('Cache size reduced', {
      before,
      after,
      reduction: before - after
    });
  }
}

// src/task/core/cache/cache-metrics.ts
export class CacheMetrics {
  private hits = 0;
  private misses = 0;
  private size = 0;
  private lastCleanup: number = Date.now();
  
  recordHit(): void {
    this.hits++;
  }
  
  recordMiss(): void {
    this.misses++;
  }
  
  updateSize(newSize: number): void {
    this.size = newSize;
  }
  
  getMetrics(): CacheMetricsData {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRatio: this.getHitRatio(),
      size: this.size,
      lastCleanup: this.lastCleanup
    };
  }
  
  private getHitRatio(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }
}
```

## Integration Testing

```typescript
// src/tests/integration/task-lifecycle.test.ts
describe('Task Lifecycle Integration', () => {
  let taskManager: TaskManager;
  let eventManager: EventManager;
  let events: any[] = [];

  beforeEach(() => {
    events = [];
    eventManager = EventManager.getInstance();
    eventManager.on(EventTypes.TASK_CREATED, (e) => events.push(e));
    eventManager.on(EventTypes.TASK_UPDATED, (e) => events.push(e));
  });

  it('should handle complete task lifecycle', async () => {
    // Create task
    const task = await taskManager.createTask({
      name: 'Test Task',
      type: TaskType.TASK
    });

    // Update task
    await taskManager.updateTask(task.path, {
      status: TaskStatus.IN_PROGRESS
    });

    // Verify events
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe(EventTypes.TASK_CREATED);
    expect(events[1].type).toBe(EventTypes.TASK_UPDATED);
  });
});

// src/tests/integration/cache-coordination.test.ts
describe('Cache Coordination Integration', () => {
  let cacheCoordinator: CacheCoordinator;
  let eventManager: EventManager;

  it('should handle cache invalidation on task updates', async () => {
    const events: CacheEvent[] = [];
    eventManager.on(EventTypes.CACHE_INVALIDATED, (e) => events.push(e));

    // Trigger task update
    await taskManager.updateTask('test/task', { status: TaskStatus.COMPLETED });

    // Verify cache invalidation
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('invalidated');
  });
});
```

## System Validation

1. Code Quality Checks:
   - Run TypeScript compiler
   - Execute linting rules
   - Check code coverage
   - Run integration tests

2. Performance Validation:
   - Monitor memory usage
   - Track cache efficiency
   - Measure operation latency
   - Verify event processing

3. Reliability Checks:
   - Test error handling
   - Verify transaction rollbacks
   - Check memory pressure handling
   - Validate cache coordination
