# Types System

The types system provides TypeScript type definitions and interfaces used throughout the Atlas Task
Manager, ensuring type safety and consistent data structures.

## Overview

The types system provides:

- Core type definitions
- Interface declarations
- Enum definitions
- Type utilities
- Type guards

## Type Categories

### Core Types

#### Task Types

```typescript
type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'CANCELLED';

interface TaskMetadata {
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  reasoning?: string;
  technicalRequirements?: {
    language?: string;
    framework?: string;
    dependencies?: string[];
    environment?: string;
  };
}

interface TaskNotes {
  planning?: string[];
  progress?: string[];
  completion?: string[];
  troubleshooting?: string[];
}
```

#### Storage Types

```typescript
interface StorageMetrics {
  size: number;
  pageSize: number;
  pageCount: number;
  freePages: number;
  cacheSize: number;
  cacheUsed: number;
}

interface TransactionOptions {
  timeout?: number;
  readonly?: boolean;
  isolation?: IsolationLevel;
}
```

#### Event Types

```typescript
interface EventMetadata {
  timestamp: number;
  source: string;
  context?: Record<string, unknown>;
}

type EventHandler<T> = (event: T) => Promise<void>;
```

#### Configuration Types

```typescript
interface LogConfig {
  console: boolean;
  file: boolean;
  level: LogLevel;
  maxFiles?: number;
  maxSize?: number;
}

interface ServerConfig {
  port: number;
  host: string;
  timeout: number;
  maxConnections: number;
}
```

### Utility Types

```typescript
// Deep partial type
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Readonly recursive
type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// Non-nullable
type NonNullable<T> = T extends null | undefined ? never : T;

// Type guards
function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === 'string' &&
    ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'].includes(value)
  );
}
```

## Best Practices

1. **Type Design**

   - Use descriptive names
   - Keep types focused
   - Document constraints
   - Use type guards

2. **Interface Design**

   - Clear property names
   - Consistent patterns
   - Optional vs required
   - Extend when needed

3. **Type Safety**

   - Use strict types
   - Avoid any
   - Add constraints
   - Validate inputs

4. **Documentation**

   - Document types
   - Add examples
   - Explain constraints
   - Note changes

5. **Organization**
   - Group related types
   - Use namespaces
   - Maintain hierarchy
   - Control exports

## Usage Examples

```typescript
// Using task types
function createTask(input: CreateTaskInput): Task {
  validateTask(input);
  return {
    ...input,
    status: 'PENDING' as TaskStatus,
    createdAt: Date.now(),
  };
}

// Type guards
function validateTaskStatus(status: unknown): TaskStatus {
  if (!isTaskStatus(status)) {
    throw new Error(`Invalid task status: ${status}`);
  }
  return status;
}

// Generic constraints
function updateMetadata<T extends { metadata?: Record<string, unknown> }>(
  entity: T,
  updates: Partial<T['metadata']>
): T {
  return {
    ...entity,
    metadata: {
      ...entity.metadata,
      ...updates,
    },
  };
}
```
