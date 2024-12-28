# atlas-mcp-server

├── examples/
│   ├── portfolio-website/
│   │   ├── atlas-tasks.db
│   │   ├── prompt.md
│   │   ├── README.md
│   │   ├── task-hierarchy-full.json
│   │   └── task-hierarchy-full.txt
│   └── README.md
├── scripts/
│   └── generate-tree.js
├── src/
│   ├── config/
│   │   └── index.ts
│   ├── errors/
│   │   ├── base-error.ts
│   │   ├── config-error.ts
│   │   ├── error-factory.ts
│   │   ├── index.ts
│   │   ├── README.md
│   │   ├── storage-error.ts
│   │   ├── task-error.ts
│   │   └── tool-error.ts
│   ├── events/
│   │   ├── batch-processor.ts
│   │   ├── event-manager.ts
│   │   └── health-monitor.ts
│   ├── logging/
│   │   ├── error-formatter.ts
│   │   ├── file-transport.ts
│   │   ├── health-monitor.ts
│   │   ├── index.ts
│   │   ├── logger.ts
│   │   └── transport-manager.ts
│   ├── server/
│   │   ├── health-monitor.ts
│   │   ├── index.ts
│   │   ├── metrics-collector.ts
│   │   ├── rate-limiter.ts
│   │   └── request-tracer.ts
│   ├── storage/
│   │   ├── base/
│   │   │   └── base-storage.ts
│   │   ├── core/
│   │   │   ├── connection/
│   │   │   │   ├── health.ts
│   │   │   │   ├── manager.ts
│   │   │   │   ├── pool.ts
│   │   │   │   └── state.ts
│   │   │   ├── query/
│   │   │   │   ├── builder.ts
│   │   │   │   ├── executor.ts
│   │   │   │   └── optimizer.ts
│   │   │   ├── schema/
│   │   │   │   ├── backup.ts
│   │   │   │   ├── migrations.ts
│   │   │   │   └── validator.ts
│   │   │   ├── transactions/
│   │   │   │   ├── manager.ts
│   │   │   │   └── scope.ts
│   │   │   ├── wal/
│   │   │   │   └── manager.ts
│   │   │   └── index.ts
│   │   ├── factory/
│   │   │   └── error-handler.ts
│   │   ├── interfaces/
│   │   │   ├── config.ts
│   │   │   └── storage.ts
│   │   ├── monitoring/
│   │   │   ├── health.ts
│   │   │   ├── index.ts
│   │   │   └── metrics.ts
│   │   ├── sqlite/
│   │   │   ├── config.ts
│   │   │   ├── error-handler.ts
│   │   │   ├── index.ts
│   │   │   ├── init.ts
│   │   │   └── storage.ts
│   │   ├── connection-manager.ts
│   │   ├── factory.ts
│   │   ├── index.ts
│   │   └── sqlite-storage.ts
│   ├── task/
│   │   ├── core/
│   │   │   ├── batch/
│   │   │   │   ├── common/
│   │   │   │   │   └── batch-utils.ts
│   │   │   │   ├── base-batch-processor.ts
│   │   │   │   ├── dependency-aware-batch-processor.ts
│   │   │   │   ├── generic-batch-processor.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── status-update-batch.ts
│   │   │   │   └── task-status-batch-processor.ts
│   │   │   ├── cache/
│   │   │   │   ├── cache-coordinator.ts
│   │   │   │   ├── cache-manager.ts
│   │   │   │   ├── cache-metrics.ts
│   │   │   │   └── index.ts
│   │   │   ├── indexing/
│   │   │   │   ├── index-manager.ts
│   │   │   │   └── index.ts
│   │   │   ├── transactions/
│   │   │   │   ├── index.ts
│   │   │   │   └── transaction-manager.ts
│   │   │   ├── error-handler.ts
│   │   │   ├── index.ts
│   │   │   └── task-store.ts
│   │   ├── manager/
│   │   │   ├── error-handler.ts
│   │   │   ├── index.ts
│   │   │   ├── task-cache-manager.ts
│   │   │   ├── task-event-handler.ts
│   │   │   └── task-manager.ts
│   │   ├── operations/
│   │   │   ├── index.ts
│   │   │   └── task-operations.ts
│   │   └── validation/
│   │       ├── schemas/
│   │       │   ├── base-schema.ts
│   │       │   ├── bulk-operations-schema.ts
│   │       │   ├── create-schema.ts
│   │       │   ├── index.ts
│   │       │   ├── metadata-schema.ts
│   │       │   └── update-schema.ts
│   │       ├── validators/
│   │       │   ├── dependency-validator.ts
│   │       │   ├── hierarchy-validator.ts
│   │       │   ├── index.ts
│   │       │   └── status-validator.ts
│   │       ├── index.ts
│   │       └── task-validator.ts
│   ├── tools/
│   │   ├── error-handler.ts
│   │   ├── handler.ts
│   │   ├── index.ts
│   │   ├── schemas.ts
│   │   ├── session-schemas.ts
│   │   └── utils.ts
│   ├── types/
│   │   ├── batch.ts
│   │   ├── cache.ts
│   │   ├── config.ts
│   │   ├── error.ts
│   │   ├── events.ts
│   │   ├── index.ts
│   │   ├── indexing.ts
│   │   ├── logging.ts
│   │   ├── project.ts
│   │   ├── session.ts
│   │   ├── storage.ts
│   │   ├── task.ts
│   │   └── transaction.ts
│   ├── utils/
│   │   ├── date-formatter.ts
│   │   ├── error-utils.ts
│   │   ├── id-generator.ts
│   │   ├── path-utils.ts
│   │   ├── pattern-matcher.ts
│   │   └── platform-utils.ts
│   ├── validation/
│   │   ├── config.ts
│   │   ├── id-schema.ts
│   │   ├── index.ts
│   │   ├── logging.ts
│   │   └── path-validator.ts
│   └── index.ts
├── .eslintrc.json
├── .gitignore
├── LICENSE
├── package.json
├── README.md
├── repo-tree.md
└── tsconfig.json
