**Storage System Refactoring Specification**

**Goal:** A single, well-defined, efficient, and maintainable storage system that is easy to use,
extend, and integrates with a template management system that loads templates from the filesystem.

**Key Principles:**

- **Consistency:** A single, unified API for all storage interactions.
- **Abstraction:** Clear separation between the storage interface and the underlying implementation.
- **Maintainability:** Modular design, well-documented code, and comprehensive testing.
- **Performance:** Optimized for common use cases, with caching and batch operations.
- **Reliability:** Robust error handling, data validation, and transaction management.
- **Extensibility:** Easy to add new features and support different storage backends in the future.
- **Security:** Secure by design, with input sanitization and protection against common
  vulnerabilities.

**Detailed Specifications**

**I. Core Storage Interface (`src/storage/interfaces/storage.ts`)**

- **Modification:** Define a single `TaskStorage` interface that all storage implementations must
  adhere to. This interface will be the primary way other parts of the application interact with the
  storage system.
- **Details:**
  - **Methods:**
    ```typescript
    interface TaskStorage {
      initialize(): Promise<void>;
      close(): Promise<void>;
      createTask(input: CreateTaskInput): Promise<Task>;
      updateTask(path: string, updates: UpdateTaskInput): Promise<Task>;
      getTask(path: string): Promise<Task | null>;
      getTasks(paths: string[]): Promise<Task[]>;
      getTasksByPattern(pattern: string, limit?: number, offset?: number): Promise<Task[]>; // Added pagination
      getTasksByStatus(status: TaskStatus, pathPattern?: string): Promise<Task[]>; // Added optional pathPattern
      getChildren(parentPath: string, recursive?: boolean): Promise<Task[]>; // Added recursive option
      deleteTask(path: string): Promise<void>;
      deleteTasks(paths: string[]): Promise<void>;
      hasChildren(path: string): Promise<boolean>;
      getDependentTasks(path: string): Promise<Task[]>; // Clarified: Gets tasks that depend ON this task
      saveTask(task: Task): Promise<void>; // Internal use
      saveTasks(tasks: Task[]): Promise<void>; // Internal use
      clearAllTasks(confirm: boolean): Promise<void>; // Added confirm flag
      beginTransaction(): Promise<void>;
      commitTransaction(): Promise<void>;
      rollbackTransaction(): Promise<void>;
      executeInTransaction<T>(work: () => Promise<T>, retries?: number): Promise<T>;
      vacuum(): Promise<void>;
      analyze(): Promise<void>;
      checkpoint(): Promise<void>;
      repairRelationships(dryRun?: boolean): Promise<{ fixed: number; issues: string[] }>;
      clearCache(): Promise<void>;
      verifyIntegrity(): Promise<boolean>;
      getStats(): Promise<StorageStats>;
      getMetrics(): Promise<StorageMetrics>;
      getTaskResource(uri: string): Promise<Resource>;
      listTaskResources(): Promise<Resource[]>;
      getTemplateResource(uri: string): Promise<Resource>;
      listTemplateResources(): Promise<Resource[]>;
      getHierarchyResource(rootPath: string): Promise<Resource>;
      getStatusResource(taskPath: string): Promise<Resource>;
      getResourceTemplates(): Promise<ResourceTemplate[]>;
      resolveResourceTemplate(template: string, vars: Record<string, string>): Promise<Resource>;
      notifyResourceUpdate(uri: string): Promise<void>;
    }
    ```
  - **Error Handling:** All methods should throw well-defined errors (using `createError` from
    `src/errors/`) in case of failure.
  - **Input Validation:** All methods should validate their inputs using the defined schemas.

**II. SQLite Implementation (`src/storage/sqlite/storage.ts`)**

- **Modification:** Refactor the existing `SqliteStorage` class to implement the `TaskStorage`
  interface.
- **Details:**
  - **Connection Management:** Use the `ConnectionPool` from `src/storage/core/connection/pool.ts`
    to manage database connections efficiently.
  - **Query Building:** Use the `QueryBuilder` from `src/storage/core/query/builder.ts` to construct
    SQL queries safely and efficiently.
  - **Transactions:** Implement transaction management using the `TransactionManager` from
    `src/task/core/transactions/transaction-manager.ts`.
  - **Error Handling:** Use the `SqliteErrorHandler` to handle SQLite-specific errors and translate
    them into generic storage errors.
  - **Schema Management:** Use the `SchemaManager` to handle database schema migrations.
  - **WAL:** Ensure WAL mode is enabled and configured correctly.
  - **Performance:** Optimize queries using appropriate indexes and query patterns. Use `PRAGMA`
    statements to fine-tune SQLite performance.
  - **Caching:** Implement a caching layer to reduce database load.
  - **Batch Operations:** Implement batch operations for efficient bulk inserts, updates, and
    deletes.
  - **Security:** Sanitize all inputs to prevent SQL injection vulnerabilities.
  - **Testing:** Write comprehensive unit and integration tests to ensure correctness and prevent
    regressions.

**III. Core Components (`src/storage/core/`)**

- **Connection Management (`src/storage/core/connection/`)**
  - **Modification:** Refactor `ConnectionManager`, `ConnectionPool`, `HealthMonitor`, and
    `ConnectionStateManager` to handle connection pooling, health checks, and state management.
  - **Details:**
    - `ConnectionManager`: Should manage the connection pool and provide methods for acquiring and
      releasing connections.
    - `ConnectionPool`: Should maintain a pool of active connections, handle connection timeouts,
      and support configuration options for minimum/maximum pool size, idle timeout, etc.
    - `HealthMonitor`: Should periodically check the health of connections in the pool and remove
      unhealthy connections.
    - `ConnectionStateManager`: Should track the state of each connection (in use, idle, error
      count, etc.).
- **Query Handling (`src/storage/core/query/`)**
  - **Modification:** Refactor `QueryBuilder`, `QueryExecutor`, and `QueryOptimizer` to provide a
    type-safe and efficient way to construct and execute SQL queries.
  - **Details:**
    - `QueryBuilder`: Should provide a fluent interface for building SQL queries, handling
      parameterization, and preventing SQL injection.
    - `QueryExecutor`: Should execute queries, handle caching, and collect performance metrics.
    - `QueryOptimizer`: Should analyze and optimize query plans.
- **Schema Management (`src/storage/core/schema/`)**
  - **Modification:** Refactor `SchemaManager`, `SchemaValidator`, and `BackupManager` to handle
    schema migrations, validation, and backup/restore operations.
  - **Details:**
    - `SchemaManager`: Should apply schema migrations in the correct order and ensure data
      integrity.
    - `SchemaValidator`: Should validate the database schema against the defined schema.
    - `BackupManager`: Should provide methods for creating and restoring database backups.
- **Transactions (`src/storage/core/transactions/`)**
  - **Modification:** Refactor `TransactionManager` to handle nested transactions and provide a way
    to execute operations within a transaction scope.
  - **Details:**
    - `TransactionManager`: Should manage transaction state, handle rollbacks, and ensure atomicity.
    - `TransactionScope`: Should provide a way to execute operations within a transaction.
- **WAL Management (`src/storage/core/wal/`)**
  - **Modification:** Refactor `WALManager`, `CheckpointManager`, `MetricsCollector`, and
    `FileHandler` to manage the WAL file and perform checkpoints.
  - **Details:**
    - `WALManager`: Should enable and configure WAL mode, handle checkpointing, and provide metrics.
    - `CheckpointManager`: Should execute checkpoints with retries and mode fallback.
    - `MetricsCollector`: Should collect WAL-related metrics.
    - `FileHandler`: Should handle WAL file system operations and integrity checks.

**IV. Storage Factory (`src/storage/factory.ts`)**

- **Modification:** Refactor the `createStorage` function to create instances of the refactored
  `SqliteStorage` based on the provided configuration.
- **Details:**
  - The factory should handle the initialization of all core components (connection pool, query
    executor, schema manager, etc.).
  - It should provide a way to configure the storage system through environment variables and
    configuration files.
  - It should handle errors during initialization and provide a fallback mechanism.

**V. Error Handling (`src/errors/`)**

- **Modification:** Ensure consistent error handling throughout the storage module using the
  `ErrorFactory` and specialized error classes.
- **Details:**
  - All errors should be created using `createError` from `src/errors/error-factory.ts`.
  - Use specific error codes defined in `src/types/error.ts`.
  - Provide informative error messages and context information.
  - Log errors with appropriate severity levels using the `Logger`.

**VI. Logging (`src/logging/`)**

- **Modification:** Ensure consistent logging throughout the storage module using the `Logger`.
- **Details:**
  - Log important events, errors, and warnings.
  - Include relevant context information in log messages.
  - Use appropriate log levels (debug, info, warn, error).

**VII. Events (`src/events/`)**

- **Modification:** Emit events for significant storage operations, such as task creation, updates,
  deletions, and cache invalidations.
- **Details:**
  - Use the `EventManager` to emit events.
  - Define clear event types and metadata.

**VIII. Monitoring (`src/storage/monitoring/`)**

- **Modification:** Implement metrics collection and health monitoring for the storage system.
- **Details:**
  - Use the `MetricsCollector` to track key metrics like query latency, cache hit rate, and
    connection pool usage.
  - Use the `HealthMonitor` to check the health of the storage system and its components.
  - Expose metrics through a dedicated endpoint or API.

**IX. Template System**

- **Template Storage Interface (`src/storage/interfaces/template-storage.ts`)**
  - **Modification:** Create a `TemplateStorage` interface for managing task templates.
  - **Details:**
    ```typescript
    interface TemplateStorage {
      initialize(): Promise<void>;
      saveTemplate(template: TaskTemplate): Promise<void>;
      getTemplate(id: string): Promise<TaskTemplate>;
      listTemplates(tag?: string): Promise<TemplateInfo[]>;
      deleteTemplate(id: string): Promise<void>;
      close(): Promise<void>;
    }
    ```
- **SQLite Template Storage (`src/storage/sqlite/template-storage.ts`)**
  - **Modification:** Implement the `TemplateStorage` interface using SQLite as the backend.
  - **Details:**
    - Create a `templates` table to store template data.
    - Implement methods for saving, retrieving, listing, and deleting templates.
    - Use the `SqliteConnection` to interact with the database.
    - Handle errors and logging consistently with the rest of the storage system.
- **Template Manager (`src/template/manager.ts`)**
  - **Modification:** Update the `TemplateManager` to use the new `TemplateStorage` interface.
  - **Details:**
    - Inject the `TemplateStorage` instance into the `TemplateManager`.
    - Update the `initialize` method to load templates from the storage.
    - Modify the `listTemplates`, `getTemplate`, and `instantiateTemplate` methods to use the
      `TemplateStorage`.
- **Template Loader (`src/template/loader/template-loader.ts`)**
  - **Modification:** Update the `TemplateLoader` to use the `TemplateStorage` interface for saving
    templates and add a file watcher.
  - **Details:**
    - Inject the `TemplateStorage` instance into the `TemplateLoader`.
    - Modify the `loadTemplateFromFile` method to save the validated template to the storage.
    - Implement a file watcher using `fs.watch` to monitor the template directories for changes.
    - Reload templates on file creation, modification, or deletion.
    - Add a method `initialize` to load templates from both the built-in directory and the workspace
      template directory.
    - Add a method `close` to stop the file watchers.
- **Tool Definitions (`src/tools/definitions/tools/template-tools.ts`)**
  - **Modification:** Update the template-related tools to use the new `TemplateManager` and
    `TemplateStorage`.
  - **Details:**
    - Update the `listTemplatesToolImpl`, `useTemplateToolImpl`, and `getTemplateInfoToolImpl`
      functions to use the new methods.
- **Server Integration (`src/server/index.ts`)**
  - **Modification:** Update the server initialization to create and inject the `TemplateStorage`
    and `TemplateManager` instances.
  - **Details:**
    - Create a `SqliteTemplateStorage` instance using the `SqliteStorage` instance.
    - Initialize the `TemplateStorage`.
    - Create a `TemplateManager` instance, passing in the `TemplateStorage` and `TaskManager`.
    - Initialize the `TemplateManager` with the appropriate template directories (built-in and
      workspace).
    - Pass the `TemplateManager` instance to the `ToolHandler`.
- **Documentation:**
  - Update the `README.md` files in `src/template/` and `src/tools/` to reflect the changes made to
    the template system.
  - Provide a clear overview of the template system architecture and components.
  - Document the template structure, variable usage, and metadata format.
  - Provide examples of how to create, use, and manage templates.

**X. Documentation**

- **Modification:** Update the `README.md` file in `src/storage/` to reflect the changes made during
  the refactoring process.
- **Details:**
  - Provide a clear overview of the storage system architecture.
  - Document the public API and usage examples.
  - Explain the error handling strategy.
  - Describe the configuration options.
  - Document the testing strategy.

**XI. Deletions**

- Remove any unused or deprecated code from the `src/storage/` directory.
- Delete any implementations that are no longer needed after the refactoring.
- Remove any redundant tests or documentation.

**XII. Additions**

- Add new components as needed to support the refactored architecture (e.g., caching layer, batch
  processor).
- Implement new features as required by the design.
- Add comprehensive documentation for all new components and features.

**XII. Modifications**

- Refactor existing code to use the new `TaskStorage` interface and core components.
- Update all dependencies to use the new storage module.
- Modify error handling to use the new error classes and logging mechanisms.
- Update tests to reflect the changes made during refactoring.

This detailed specification sheet provides a solid foundation for refactoring the `src/storage/`
system. Remember to break down the implementation into smaller, manageable tasks and to test
thoroughly at each stage. Good luck!
