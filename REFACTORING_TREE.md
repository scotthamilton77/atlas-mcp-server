# Atlas MCP Server Refactoring Tree

This document provides a complete mapping of every file in the repository and its fate during the refactoring process.

## File Actions Key
- NEW: New file to be created
- MODIFY: Existing file to be updated
- PRESERVE: Existing file to remain unchanged
- REMOVE: File to be deleted or moved
- AUTO: File automatically generated (like build artifacts)

## Complete File Tree

```
atlas-mcp-server/
├── src/                              # Source directory
│   ├── core/                         # NEW: Core directory
│   │   ├── storage/                  # DONE: Unified storage system
│   │   │   ├── file-manager.ts      # DONE: Persistent file storage with backup/restore
│   │   │   ├── memory-manager.ts    # DONE: In-memory storage with LRU caching
│   │   │   ├── storage-transaction.ts # DONE: Transaction management
│   │   │   ├── unified-engine.ts    # DONE: Storage coordination with transactions
│   │   │   ├── index.ts            # DONE: Storage system exports
│   │   │   └── types/              # NEW: Storage type definitions
│   │   │       ├── operations.ts   # NEW: Storage operation types
│   │   │       ├── results.ts      # NEW: Operation result types
│   │   │       └── errors.ts       # NEW: Storage error types
│   │   ├── transaction/            # NEW: Transaction system
│   │   │   ├── coordinator/        # NEW: Transaction coordination
│   │   │   │   ├── memory.ts      # NEW: Memory transaction coordinator
│   │   │   │   ├── storage.ts     # NEW: Storage transaction coordinator
│   │   │   │   └── index.ts       # NEW: Main coordinator
│   │   │   ├── managers/          # NEW: Transaction managers
│   │   │   │   ├── file-transaction.ts  # NEW: File transaction manager
│   │   │   │   └── memory-transaction.ts # NEW: Memory transaction manager
│   │   │   ├── types/            # NEW: Transaction types
│   │   │   │   ├── common.ts     # NEW: Common type definitions
│   │   │   │   ├── operations.ts # NEW: Operation definitions
│   │   │   │   └── results.ts    # NEW: Result definitions
│   │   │   └── utils/           # NEW: Transaction utilities
│   │   │       ├── timeout.ts   # NEW: Timeout handling
│   │   │       └── rollback.ts  # NEW: Rollback utilities
│   │   ├── validation/          # NEW: Validation system
│   │   │   ├── schemas/         # NEW: Schema validation
│   │   │   │   ├── task.ts     # NEW: Task schemas
│   │   │   │   ├── note.ts     # NEW: Note schemas
│   │   │   │   └── metadata.ts # NEW: Metadata schemas
│   │   │   ├── rules/          # NEW: Business rules
│   │   │   │   ├── dependency.ts # NEW: Dependency rules
│   │   │   │   ├── status.ts    # NEW: Status rules
│   │   │   │   └── relationship.ts # NEW: Relationship rules
│   │   │   ├── runtime/         # NEW: Runtime validation
│   │   │   │   ├── integrity.ts # NEW: Data integrity
│   │   │   │   └── consistency.ts # NEW: Data consistency
│   │   │   └── coordinator.ts   # NEW: Validation coordination
│   │   ├── indexing/           # NEW: Indexing system
│   │   │   ├── indexes/        # NEW: Index implementations
│   │   │   │   ├── primary.ts  # NEW: Primary index
│   │   │   │   ├── status.ts   # NEW: Status index
│   │   │   │   ├── hierarchy.ts # NEW: Hierarchy index
│   │   │   │   ├── session.ts  # NEW: Session index
│   │   │   │   └── dependency.ts # NEW: Dependency index
│   │   │   ├── operations/     # NEW: Index operations
│   │   │   │   ├── batch.ts    # NEW: Batch operations
│   │   │   │   ├── parallel.ts # NEW: Parallel operations
│   │   │   │   └── transaction.ts # NEW: Transactional operations
│   │   │   ├── types/         # NEW: Index types
│   │   │   │   ├── common.ts  # NEW: Common types
│   │   │   │   ├── indexes.ts # NEW: Index definitions
│   │   │   │   └── operations.ts # NEW: Operation types
│   │   │   └── coordinator.ts # NEW: Index coordination
│   │   ├── batch/            # NEW: Batch processing
│   │   │   ├── processors/   # NEW: Batch processors
│   │   │   │   ├── memory.ts # NEW: Memory processor
│   │   │   │   ├── storage.ts # NEW: Storage processor
│   │   │   │   └── index.ts  # NEW: Main processor
│   │   │   ├── strategies/   # NEW: Processing strategies
│   │   │   │   ├── concurrent.ts # NEW: Concurrent strategy
│   │   │   │   ├── sequential.ts # NEW: Sequential strategy
│   │   │   │   └── adaptive.ts   # NEW: Adaptive strategy
│   │   │   ├── monitors/     # NEW: Batch monitoring
│   │   │   │   ├── progress.ts # NEW: Progress tracking
│   │   │   │   ├── performance.ts # NEW: Performance monitoring
│   │   │   │   └── health.ts  # NEW: Health monitoring
│   │   │   └── coordinator.ts # NEW: Batch coordination
│   │   ├── errors/          # NEW: Error handling
│   │   │   ├── categories/  # NEW: Error categories
│   │   │   │   ├── task.ts  # NEW: Task errors
│   │   │   │   ├── storage.ts # NEW: Storage errors
│   │   │   │   ├── validation.ts # NEW: Validation errors
│   │   │   │   ├── transaction.ts # NEW: Transaction errors
│   │   │   │   └── index.ts # NEW: Index errors
│   │   │   ├── handlers/   # NEW: Error handlers
│   │   │   │   ├── global.ts # NEW: Global handler
│   │   │   │   ├── domain.ts # NEW: Domain handlers
│   │   │   │   └── recovery.ts # NEW: Recovery handlers
│   │   │   ├── types/     # NEW: Error types
│   │   │   │   ├── codes.ts # NEW: Error codes
│   │   │   │   ├── messages.ts # NEW: Error messages
│   │   │   │   └── handlers.ts # NEW: Handler types
│   │   │   └── coordinator.ts # NEW: Error coordination
│   │   ├── scheduling/    # NEW: Task scheduling system
│   │   │   ├── triggers/  # NEW: Time-based triggers
│   │   │   │   ├── cron.ts     # NEW: Cron-based scheduling
│   │   │   │   ├── interval.ts # NEW: Interval-based triggers
│   │   │   │   └── calendar.ts # NEW: Calendar-based scheduling
│   │   │   ├── recurring/  # NEW: Recurring task support
│   │   │   │   ├── patterns.ts # NEW: Recurrence patterns
│   │   │   │   └── generator.ts # NEW: Task generation
│   │   │   └── coordinator.ts # NEW: Schedule coordination
│   │   ├── templates/     # NEW: Task template system
│   │   │   ├── presets/   # NEW: Predefined templates
│   │   │   │   ├── common.ts   # NEW: Common templates
│   │   │   │   └── custom.ts   # NEW: Custom templates
│   │   │   ├── generator.ts # NEW: Template generation
│   │   │   └── validator.ts # NEW: Template validation
│   │   ├── search/       # NEW: Advanced search system
│   │   │   ├── engine/   # NEW: Search engine
│   │   │   │   ├── indexer.ts  # NEW: Content indexing
│   │   │   │   └── query.ts    # NEW: Query processing
│   │   │   ├── filters/  # NEW: Search filters
│   │   │   │   ├── content.ts  # NEW: Content filters
│   │   │   │   └── metadata.ts # NEW: Metadata filters
│   │   │   └── coordinator.ts # NEW: Search coordination
│   │   └── monitoring/     # NEW: System monitoring
│   │       ├── health/    # NEW: Health monitoring
│   │       │   ├── checks.ts # NEW: Health checks
│   │       │   └── alerts.ts # NEW: Health alerts
│   │       ├── performance/ # NEW: Performance monitoring
│   │       │   ├── metrics.ts # NEW: Performance metrics
│   │       │   └── tracking.ts # NEW: Performance tracking
│   │       └── alerts/    # NEW: Alert system
│   │           ├── rules.ts # NEW: Alert rules
│   │           └── notifications.ts # NEW: Alert notifications
│   │
│   ├── config/                   # Configuration directory
│   │   └── index.ts             # MODIFY: Update configuration
│   │
│   ├── docs/                    # Documentation directory
│   │   └── api.ts              # MODIFY: Update API docs
│   │
│   ├── errors/                 # Error handling directory
│   │   └── index.ts           # MODIFY: Update error handling
│   │
│   ├── logging/               # Logging directory
│   │   └── index.ts          # PRESERVE: Core logging functionality
│   │
│   ├── server/               # Server components
│   │   ├── health-monitor.ts   # MODIFY: Enhanced monitoring
│   │   ├── index.ts           # MODIFY: Update initialization
│   │   ├── metrics-collector.ts # MODIFY: Add new metrics
│   │   ├── rate-limiter.ts    # PRESERVE: Rate limiting
│   │   └── request-tracer.ts  # PRESERVE: Request tracing
│   │
│   ├── storage/              # REMOVE: Move to core/storage
│   │   └── index.ts         # REMOVE: Functionality moved to core/storage
│   │
│   ├── task/                # REMOVE: Move to core/*
│   │   └── core/           # REMOVE: All functionality moved to core/*
│   │       ├── batch/      # REMOVE: Move to core/batch
│   │       │   ├── batch-processor.ts  # REMOVE: Move to core/batch/processor.ts
│   │       │   └── batch-types.ts      # REMOVE: Move to core/batch/types.ts
│   │       ├── cache/      # REMOVE: Move to core/storage/cache
│   │       │   ├── cache-manager.ts    # REMOVE: Move to core/storage/cache/manager.ts
│   │       │   └── cache-types.ts      # REMOVE: Move to core/storage/cache/types.ts
│   │       ├── indexing/   # REMOVE: Move to core/indexing
│   │       │   ├── index-manager.ts    # REMOVE: Move to core/indexing/manager.ts
│   │       │   └── index-types.ts      # REMOVE: Move to core/indexing/types.ts
│   │       ├── transactions/ # REMOVE: Move to core/transaction
│   │       │   ├── transaction-manager.ts # REMOVE: Move to core/transaction/manager.ts
│   │       │   └── transaction-types.ts   # REMOVE: Move to core/transaction/types.ts
│   │       ├── dependency-validator.ts    # REMOVE: Move to core/validation/dependency.ts
│   │       ├── index.ts                  # REMOVE: No longer needed
│   │       ├── status-manager.ts         # REMOVE: Move to core/task/status-manager.ts
│   │       └── task-store.ts             # REMOVE: Split across core/*
│   │
│   ├── tools/               # MCP tools directory
│   │   ├── handler.ts      # MODIFY: Update for new architecture
│   │   ├── index.ts       # MODIFY: Update exports
│   │   ├── schemas.ts     # MODIFY: Update schemas
│   │   └── utils.ts       # PRESERVE: Utility functions
│   │
│   ├── types/             # Type definitions
│   │   ├── config.ts     # MODIFY: Add new types
│   │   ├── error.ts      # MODIFY: Update error types
│   │   ├── index.ts      # MODIFY: Update exports
│   │   ├── logging.ts    # PRESERVE: Logging types
│   │   └── task.ts       # MODIFY: Update task types
│   │
│   ├── validation/       # REMOVE: Move to core/validation
│   │   ├── config.ts    # REMOVE: Move to core/validation
│   │   ├── index.ts     # REMOVE: Move to core/validation
│   │   ├── logging.ts   # REMOVE: Move to core/validation
│   │   └── task.ts      # REMOVE: Move to core/validation
│   │
│   ├── index.ts         # MODIFY: Update for new architecture
│   ├── task-manager.ts  # REMOVE: Replace with core/task/manager.ts
│   └── types.ts         # REMOVE: Move to core/types
│
├── build/               # Build output directory
│   ├── config/         # AUTO: Configuration build artifacts
│   │   ├── index.d.ts  # AUTO: Type definitions
│   │   └── index.js    # AUTO: Compiled JavaScript
│   ├── docs/          # AUTO: Documentation build artifacts
│   │   ├── api.d.ts   # AUTO: Type definitions
│   │   └── api.js     # AUTO: Compiled JavaScript
│   ├── errors/       # AUTO: Error handling build artifacts
│   │   ├── index.d.ts # AUTO: Type definitions
│   │   └── index.js   # AUTO: Compiled JavaScript
│   ├── logging/      # AUTO: Logging build artifacts
│   │   ├── index.d.ts # AUTO: Type definitions
│   │   └── index.js   # AUTO: Compiled JavaScript
│   ├── server/       # AUTO: Server build artifacts
│   │   ├── health-monitor.d.ts    # AUTO: Type definitions
│   │   ├── health-monitor.js      # AUTO: Compiled JavaScript
│   │   ├── index.d.ts            # AUTO: Type definitions
│   │   ├── index.js              # AUTO: Compiled JavaScript
│   │   ├── metrics-collector.d.ts # AUTO: Type definitions
│   │   ├── metrics-collector.js   # AUTO: Compiled JavaScript
│   │   ├── rate-limiter.d.ts     # AUTO: Type definitions
│   │   ├── rate-limiter.js       # AUTO: Compiled JavaScript
│   │   ├── request-tracer.d.ts   # AUTO: Type definitions
│   │   └── request-tracer.js     # AUTO: Compiled JavaScript
│   ├── storage/      # AUTO: Storage build artifacts
│   │   ├── index.d.ts # AUTO: Type definitions
│   │   └── index.js   # AUTO: Compiled JavaScript
│   ├── task/         # AUTO: Task system build artifacts
│   │   └── core/     # AUTO: Core task artifacts
│   │       ├── batch/  # AUTO: Batch processing artifacts
│   │       │   ├── batch-processor.d.ts # AUTO: Type definitions
│   │       │   ├── batch-processor.js   # AUTO: Compiled JavaScript
│   │       │   ├── batch-types.d.ts     # AUTO: Type definitions
│   │       │   └── batch-types.js       # AUTO: Compiled JavaScript
│   │       ├── cache/  # AUTO: Cache system artifacts
│   │       │   ├── cache-manager.d.ts   # AUTO: Type definitions
│   │       │   ├── cache-manager.js     # AUTO: Compiled JavaScript
│   │       │   ├── cache-types.d.ts     # AUTO: Type definitions
│   │       │   └── cache-types.js       # AUTO: Compiled JavaScript
│   │       ├── indexing/ # AUTO: Indexing system artifacts
│   │       │   ├── index-manager.d.ts   # AUTO: Type definitions
│   │       │   ├── index-manager.js     # AUTO: Compiled JavaScript
│   │       │   ├── index-types.d.ts     # AUTO: Type definitions
│   │       │   └── index-types.js       # AUTO: Compiled JavaScript
│   │       ├── transactions/ # AUTO: Transaction system artifacts
│   │       │   ├── transaction-manager.d.ts # AUTO: Type definitions
│   │       │   ├── transaction-manager.js   # AUTO: Compiled JavaScript
│   │       │   ├── transaction-types.d.ts   # AUTO: Type definitions
│   │       │   └── transaction-types.js     # AUTO: Compiled JavaScript
│   │       ├── dependency-validator.d.ts # AUTO: Type definitions
│   │       ├── dependency-validator.js   # AUTO: Compiled JavaScript
│   │       ├── index.d.ts               # AUTO: Type definitions
│   │       ├── index.js                 # AUTO: Compiled JavaScript
│   │       ├── status-manager.d.ts      # AUTO: Type definitions
│   │       ├── status-manager.js        # AUTO: Compiled JavaScript
│   │       ├── task-store.d.ts          # AUTO: Type definitions
│   │       └── task-store.js            # AUTO: Compiled JavaScript
│   ├── test/        # AUTO: Test build artifacts
│   │   ├── setup.d.ts  # AUTO: Type definitions
│   │   ├── setup.js    # AUTO: Compiled JavaScript
│   │   ├── types.d.ts  # AUTO: Type definitions
│   │   └── types.js    # AUTO: Compiled JavaScript
│   ├── tools/       # AUTO: Tools build artifacts
│   │   ├── handler.d.ts # AUTO: Type definitions
│   │   ├── handler.js   # AUTO: Compiled JavaScript
│   │   ├── index.d.ts   # AUTO: Type definitions
│   │   ├── index.js     # AUTO: Compiled JavaScript
│   │   ├── schemas.d.ts # AUTO: Type definitions
│   │   ├── schemas.js   # AUTO: Compiled JavaScript
│   │   ├── utils.d.ts   # AUTO: Type definitions
│   │   ├── utils.js     # AUTO: Compiled JavaScript
│   │   ├── visualization-handler.d.ts # AUTO: Type definitions
│   │   └── visualization-handler.js   # AUTO: Compiled JavaScript
│   ├── types/       # AUTO: Type definition artifacts
│   │   ├── config.d.ts  # AUTO: Type definitions
│   │   ├── config.js    # AUTO: Compiled JavaScript
│   │   ├── error.d.ts   # AUTO: Type definitions
│   │   ├── error.js     # AUTO: Compiled JavaScript
│   │   ├── index.d.ts   # AUTO: Type definitions
│   │   ├── index.js     # AUTO: Compiled JavaScript
│   │   ├── logging.d.ts # AUTO: Type definitions
│   │   ├── logging.js   # AUTO: Compiled JavaScript
│   │   ├── task.d.ts    # AUTO: Type definitions
│   │   └── task.js      # AUTO: Compiled JavaScript
│   ├── validation/  # AUTO: Validation build artifacts
│   │   ├── config.d.ts  # AUTO: Type definitions
│   │   ├── config.js    # AUTO: Compiled JavaScript
│   │   ├── index.d.ts   # AUTO: Type definitions
│   │   ├── index.js     # AUTO: Compiled JavaScript
│   │   ├── logging.d.ts # AUTO: Type definitions
│   │   ├── logging.js   # AUTO: Compiled JavaScript
│   │   ├── task.d.ts    # AUTO: Type definitions
│   │   └── task.js      # AUTO: Compiled JavaScript
│   ├── visualization/ # AUTO: Visualization build artifacts
│   │   ├── index.d.ts   # AUTO: Type definitions
│   │   └── index.js     # AUTO: Compiled JavaScript
│   ├── index.d.ts    # AUTO: Type definitions
│   ├── index.js      # AUTO: Compiled JavaScript
│   ├── task-manager.d.ts # AUTO: Type definitions
│   ├── task-manager.js   # AUTO: Compiled JavaScript
│   ├── types.d.ts        # AUTO: Type definitions
│   └── types.js          # AUTO: Compiled JavaScript
│
├── examples/           # Example code directory
│   ├── basic/         # NEW: Basic usage examples
│   │   ├── task.ts    # NEW: Basic task examples
│   │   └── batch.ts   # NEW: Basic batch examples
│   ├── advanced/      # NEW: Advanced usage examples
│   │   ├── workflow.ts # NEW: Workflow examples
│   │   └── custom.ts  # NEW: Custom implementation examples
│   └── README.md      # NEW: Examples documentation
│
├── tests/             # Test directory
│   ├── unit/         # NEW: Unit tests
│   │   ├── core/     # NEW: Core system tests
│   │   │   ├── storage/    # NEW: Storage tests
│   │   │   ├── transaction/ # NEW: Transaction tests
│   │   │   ├── validation/  # NEW: Validation tests
│   │   │   ├── indexing/    # NEW: Indexing tests
│   │   │   ├── batch/       # NEW: Batch tests
│   │   │   └── errors/      # NEW: Error handling tests
│   │   └── setup.ts  # NEW: Unit test setup
│   ├── integration/  # NEW: Integration tests
│   │   ├── workflows/  # NEW: Workflow tests
│   │   ├── api/       # NEW: API tests
│   │   └── setup.ts   # NEW: Integration test setup
│   ├── system/       # NEW: System tests
│   │   ├── performance/ # NEW: Performance tests
│   │   ├── stress/     # NEW: Stress tests
│   │   └── setup.ts    # NEW: System test setup
│   ├── mocks/        # NEW: Test mocks
│   │   ├── storage.ts  # NEW: Storage mocks
│   │   └── api.ts      # NEW: API mocks
│   ├── fixtures/     # NEW: Test fixtures
│   │   ├── tasks.ts    # NEW: Task fixtures
│   │   └── data.ts     # NEW: Data fixtures
│   └── types.ts      # NEW: Test type definitions
│
├── scripts/          # Utility scripts directory
│   ├── setup/       # NEW: Setup scripts
│   │   ├── install.sh  # NEW: Installation script
│   │   └── config.sh   # NEW: Configuration script
│   ├── monitoring/  # NEW: Monitoring scripts
│   │   ├── health.sh   # NEW: Health check script
│   │   └── metrics.sh  # NEW: Metrics collection script
│   ├── backup/      # NEW: Backup scripts
│   │   ├── data.sh     # NEW: Data backup script
│   │   └── restore.sh  # NEW: Restore script
│   ├── ci/          # NEW: CI/CD scripts
│   │   ├── build.sh    # NEW: Build script
│   │   └── deploy.sh   # NEW: Deployment script
│   └── utils/       # NEW: Utility scripts
│       ├── cleanup.sh  # NEW: Cleanup script
│       └── verify.sh   # NEW: Verification script
│
├── .eslintrc.json    # MODIFY: Update rules
├── .gitignore       # MODIFY: Update ignored files
├── LICENSE          # PRESERVE: Project license
├── README.md        # MODIFY: Update documentation
├── REFACTORING.md   # NEW: Refactoring documentation
├── jest.config.js   # MODIFY: Update test config
├── package.json     # MODIFY: Update dependencies
└── tsconfig.json    # MODIFY: Update configuration

## Summary of Changes

1. File Counts by Action:
   - NEW: 65 files (including examples, tests, and scripts)
   - MODIFY: 20 files
   - PRESERVE: 6 files
   - REMOVE: 18 files
   - AUTO: 82 build artifacts

2. Key Movements:
   - task/core/* → core/* (with restructuring)
   - validation/* → core/validation/*
   - storage/* → core/storage/*

3. New Components:
   - Complete test infrastructure
   - Example code structure
   - Utility scripts organization
   - Documentation updates

4. Build System:
   - All .d.ts and .js files in build/ are auto-generated
   - Build process remains the same
   - New build targets for core modules
