export { TaskStore } from './task-store.js';
export { TaskErrorHandler } from './error-handler.js';

// Re-export batch processors
export {
  UnifiedBatchProcessor,
  BaseBatchProcessor,
  type BatchDependencies,
  type BatchOptions,
} from './batch/index.js';

// Re-export batch services
export {
  DependencyValidationService,
  type DependencyValidationResult,
  ValidationMode,
} from './batch/services/dependency-validation-service.js';

export {
  StatusTransitionService,
  type StatusTransitionResult,
} from './batch/services/status-transition-service.js';

// Re-export batch utils
export {
  type BatchData,
  type BatchResult,
  type BatchValidationResult,
  type BatchItemResult,
} from './batch/common/batch-utils.js';

// Re-export cache management
export { CacheManager } from './cache/index.js';

// Re-export cache types
export type {
  CacheOptions,
  CacheStats,
  CacheEntry,
  CacheMetricsData,
  CacheCoordinatorOptions,
  TaskCacheEntry,
} from '../../types/cache.js';

// Re-export indexing
export { TaskIndexManager } from './indexing/index.js';

// Re-export transactions
export { TransactionManager } from './transactions/index.js';

// Re-export types
export type {
  Task,
  TaskStatus,
  TaskType,
  CreateTaskInput,
  UpdateTaskInput,
  TaskResponse,
} from '../../types/task.js';
