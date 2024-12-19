import { jest } from '@jest/globals';
import { 
  ValidationContext, 
  ValidationResult, 
  ValidationError,
  createMockValidationContext,
  createValidResult,
  createInvalidResult,
  ValidationErrorCodes,
  Task,
  TaskStatus,
  TaskType,
  TaskStore
} from '../../src/core/validation/types.js';
import type {
  TaskNote,
  TaskReasoning,
  TaskMetadata
} from '../../src/shared/types/task.js';

export type { TaskStore };

export function createMockTask(
  id: string = 'test-task',
  overrides: Partial<Task> = {}
): Task {
  const now = new Date().toISOString();
  const defaultTask: Task = {
    id,
    name: 'Test Task',
    type: TaskType.TASK,
    status: TaskStatus.PENDING,
    parentId: null,
    description: undefined,
    notes: [],
    reasoning: {
      approach: '',
      assumptions: [],
      alternatives: [],
      risks: [],
      tradeoffs: [],
      constraints: [],
      dependencies_rationale: [],
      impact_analysis: []
    },
    dependencies: [],
    metadata: {
      created: now,
      updated: now,
      sessionId: 'test-session',
      tags: [],
      context: undefined
    },
    subtasks: []
  };

  return { ...defaultTask, ...overrides };
}

export function createMockContext(
  operation: string = 'test',
  value: unknown = {},
  shared: Map<string, unknown> = new Map()
): ValidationContext {
  return createMockValidationContext(operation, value, shared);
}

export function createTestValidationSuccess<T = unknown>(data?: T): ValidationResult {
  return createValidResult(data ?? {});
}

export function createTestValidationError(
  message: string,
  code: keyof typeof ValidationErrorCodes = 'RUNTIME_ERROR',
  details?: unknown
): ValidationResult {
  return createInvalidResult(ValidationErrorCodes[code], message, details);
}

export function createTestTaskContext(
  operation: string = 'test',
  value: unknown = {},
  shared: Map<string, unknown> = new Map()
): ValidationContext {
  const context = createMockValidationContext(operation, value, shared);
  context.taskStore = createMockTaskStore();
  return context;
}

export function createTestValidationContext(
  operation: string = 'test',
  value: unknown = {},
  shared: Map<string, unknown> = new Map()
): ValidationContext {
  return createMockValidationContext(operation, value, shared);
}

// Mock task store factory
export function createMockTaskStore(): TaskStore {
  return {
    get: jest.fn().mockReturnValue(Promise.resolve(null)),
    set: jest.fn().mockReturnValue(Promise.resolve()),
    delete: jest.fn().mockReturnValue(Promise.resolve()),
    clear: jest.fn().mockReturnValue(Promise.resolve()),
    getAll: jest.fn().mockReturnValue(Promise.resolve([])),
    getByIds: jest.fn().mockReturnValue(Promise.resolve([])),
    exists: jest.fn().mockReturnValue(Promise.resolve(false))
  } as TaskStore;
}

// Helper to create a mock task store with specific task data
export function createMockTaskStoreWithData(tasks: Task[]): TaskStore {
  const taskMap = new Map(tasks.map(task => [task.id, task]));
  
  return {
    get: jest.fn().mockImplementation((id: string) => 
      Promise.resolve(taskMap.get(id) || null)),
    set: jest.fn().mockImplementation((id: string, task: Task) => {
      taskMap.set(id, task);
      return Promise.resolve();
    }),
    delete: jest.fn().mockImplementation((id: string) => {
      taskMap.delete(id);
      return Promise.resolve();
    }),
    clear: jest.fn().mockImplementation(() => {
      taskMap.clear();
      return Promise.resolve();
    }),
    getAll: jest.fn().mockImplementation(() => 
      Promise.resolve(Array.from(taskMap.values()))),
    getByIds: jest.fn().mockImplementation((ids: string[]) => 
      Promise.resolve(ids.map(id => taskMap.get(id)).filter((t): t is Task => t !== undefined))),
    exists: jest.fn().mockImplementation((id: string) => 
      Promise.resolve(taskMap.has(id)))
  } as TaskStore;
}
