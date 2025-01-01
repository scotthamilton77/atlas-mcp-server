# Storage System

The storage system provides ACID-compliant data persistence for the Atlas Task Manager, with support
for transactions, caching, and optimized query execution.

## Overview

The storage system provides:

- ACID-compliant transactions
- Query optimization
- Connection pooling
- Schema management
- WAL (Write-Ahead Logging)

## Architecture

### Core Components

#### StorageFactory

- Creates storage instances
- Manages configurations
- Handles initialization
- Coordinates components

#### Core Subsystems

##### Connection Management

- Connection pooling
- Health monitoring
- State management
- Retry handling

##### Query System

- Query building
- Execution planning
- Result caching
- Performance optimization

##### Schema Management

- Schema validation
- Migration handling
- Backup coordination
- Version control

##### Transaction Management

- ACID compliance
- Transaction scoping
- Rollback handling
- Deadlock prevention

##### WAL System

- Write-ahead logging
- Checkpoint management
- Recovery handling
- Performance metrics

## Storage Configuration

```typescript
interface StorageConfig {
  baseDir: string;
  name: string;
  connection: {
    maxRetries: number;
    retryDelay: number;
    busyTimeout: number;
  };
  performance: {
    checkpointInterval: number;
    cacheSize: number;
    mmapSize: number;
    pageSize: number;
  };
}
```

## Usage Examples

```typescript
// Initialize storage
const storage = await createStorage({
  baseDir: dataDir,
  name: 'atlas-tasks',
  connection: {
    maxRetries: 3,
    retryDelay: 1000,
    busyTimeout: 5000,
  },
});

// Transaction example
await storage.transaction(async tx => {
  // Perform operations
  await tx.execute('INSERT INTO tasks ...');
  await tx.execute('UPDATE task_status ...');
});

// Query with parameters
const result = await storage.query('SELECT * FROM tasks WHERE status = ?', ['IN_PROGRESS']);

// Maintenance operations
await storage.vacuum();
await storage.analyze();
await storage.checkpoint();
```

## Best Practices

1. **Transaction Management**

   - Use appropriate isolation levels
   - Keep transactions short
   - Handle deadlocks
   - Ensure proper rollback

2. **Query Optimization**

   - Use prepared statements
   - Optimize query plans
   - Index properly
   - Monitor performance

3. **Connection Handling**

   - Use connection pooling
   - Monitor connection health
   - Handle timeouts
   - Manage resources

4. **Data Integrity**

   - Validate data
   - Handle constraints
   - Maintain consistency
   - Backup regularly

5. **Performance**
   - Use appropriate caching
   - Monitor WAL size
   - Schedule maintenance
   - Optimize configurations
