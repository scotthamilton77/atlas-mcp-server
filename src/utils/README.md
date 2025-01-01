# Utilities System

The utilities system provides common helper functions, platform utilities, and shared functionality
used throughout the Atlas Task Manager.

## Overview

The utilities system provides:

- Date formatting
- Error utilities
- ID generation
- Path utilities
- Pattern matching
- Platform utilities

## Core Utilities

### Date Formatter

```typescript
// Format dates consistently
function formatDate(date: Date): string;
function parseDate(dateString: string): Date;
function getTimestamp(): number;
```

### Error Utilities

```typescript
// Error handling helpers
function isOperationalError(error: Error): boolean;
function formatErrorStack(error: Error): string;
function enrichErrorContext(error: Error, context: Record<string, unknown>): Error;
```

### ID Generator

```typescript
// Generate unique identifiers
function generateId(prefix?: string): string;
function isValidId(id: string): boolean;
function parseIdComponents(id: string): { prefix: string; value: string };
```

### Path Utilities

```typescript
// Path manipulation and validation
function normalizePath(path: string): string;
function isValidPath(path: string): boolean;
function joinPaths(...paths: string[]): string;
function getPathComponents(path: string): string[];
```

### Pattern Matcher

```typescript
// Pattern matching utilities
function matchPattern(pattern: string, value: string): boolean;
function extractVariables(pattern: string, value: string): Record<string, string>;
function replaceVariables(pattern: string, variables: Record<string, string>): string;
```

### Platform Utilities

```typescript
// Platform-specific functionality
class PlatformPaths {
  static getDocumentsDir(): string;
  static getTempDir(): string;
  static getConfigDir(): string;
}

class PlatformCapabilities {
  static getMaxMemory(): number;
  static ensureDirectoryPermissions(path: string, mode: number): Promise<void>;
  static isProcessActive(pid: number): boolean;
}

class ProcessManager {
  static setupSignalHandlers(): void;
  static registerCleanupHandler(handler: () => Promise<void>): void;
  static cleanup(): Promise<void>;
}
```

## Usage Examples

```typescript
// Using date formatter
const timestamp = formatDate(new Date());
logger.info('Operation completed', { timestamp });

// Using ID generator
const taskId = generateId('task');
if (isValidId(taskId)) {
  // Use task ID
}

// Using path utilities
const normalizedPath = normalizePath('project//backend/auth');
if (isValidPath(normalizedPath)) {
  // Use normalized path
}

// Using pattern matcher
const pattern = 'project/:type/:name';
const path = 'project/backend/auth';
const vars = extractVariables(pattern, path);
// vars = { type: 'backend', name: 'auth' }

// Using platform utilities
const docsDir = PlatformPaths.getDocumentsDir();
await PlatformCapabilities.ensureDirectoryPermissions(docsDir, 0o755);

// Using process manager
ProcessManager.registerCleanupHandler(async () => {
  await database.close();
});
```

## Best Practices

1. **Function Design**

   - Pure functions when possible
   - Clear parameters
   - Consistent returns
   - Error handling

2. **Platform Handling**

   - Abstract platform differences
   - Handle permissions
   - Check capabilities
   - Provide fallbacks

3. **Error Handling**

   - Validate inputs
   - Clear error messages
   - Proper propagation
   - Context preservation

4. **Performance**

   - Optimize common cases
   - Cache when appropriate
   - Minimize allocations
   - Handle large inputs

5. **Testing**
   - Unit test utilities
   - Test edge cases
   - Platform variations
   - Error conditions
