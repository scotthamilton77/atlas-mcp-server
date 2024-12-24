# atlas-mcp-server

./
|-- src/
|   |-- config/
|   |   `-- index.ts
|   |-- errors/
|   |   `-- index.ts
|   |-- events/
|   |   `-- event-manager.ts
|   |-- logging/
|   |   `-- index.ts
|   |-- server/
|   |   |-- health-monitor.ts
|   |   |-- index.ts
|   |   |-- metrics-collector.ts
|   |   |-- rate-limiter.ts
|   |   `-- request-tracer.ts
|   |-- storage/
|   |   |-- core/
|   |   |   |-- connection/
|   |   |   |   |-- health.ts
|   |   |   |   |-- manager.ts
|   |   |   |   |-- pool.ts
|   |   |   |   `-- state.ts
|   |   |   |-- query/
|   |   |   |   |-- builder.ts
|   |   |   |   |-- executor.ts
|   |   |   |   `-- optimizer.ts
|   |   |   |-- schema/
|   |   |   |   |-- backup.ts
|   |   |   |   |-- migrations.ts
|   |   |   |   `-- validator.ts
|   |   |   |-- transactions/
|   |   |   |   |-- manager.ts
|   |   |   |   `-- scope.ts
|   |   |   |-- wal/
|   |   |   |   `-- manager.ts
|   |   |   `-- index.ts
|   |   |-- monitoring/
|   |   |   |-- health.ts
|   |   |   |-- index.ts
|   |   |   `-- metrics.ts
|   |   |-- sqlite/
|   |   |   |-- index.ts
|   |   |   |-- init.ts
|   |   |   `-- storage.ts
|   |   |-- connection-manager.ts
|   |   |-- factory.ts
|   |   |-- index.ts
|   |   `-- sqlite-storage.ts
|   |-- task/
|   |   |-- core/
|   |   |   |-- batch/
|   |   |   |   |-- common/
|   |   |   |   |   `-- batch-utils.ts
|   |   |   |   |-- base-batch-processor.ts
|   |   |   |   |-- dependency-aware-batch-processor.ts
|   |   |   |   |-- generic-batch-processor.ts
|   |   |   |   |-- index.ts
|   |   |   |   |-- status-update-batch.ts
|   |   |   |   `-- task-status-batch-processor.ts
|   |   |   |-- cache/
|   |   |   |   |-- cache-coordinator.ts
|   |   |   |   |-- cache-manager.ts
|   |   |   |   |-- cache-metrics.ts
|   |   |   |   `-- index.ts
|   |   |   |-- indexing/
|   |   |   |   |-- index-manager.ts
|   |   |   |   `-- index.ts
|   |   |   |-- transactions/
|   |   |   |   |-- index.ts
|   |   |   |   |-- transaction-manager.ts
|   |   |   |   `-- transaction-types.ts
|   |   |   |-- index.ts
|   |   |   `-- task-store.ts
|   |   |-- operations/
|   |   |   |-- index.ts
|   |   |   `-- task-operations.ts
|   |   `-- validation/
|   |       |-- index.ts
|   |       `-- task-validator.ts
|   |-- tools/
|   |   |-- handler.ts
|   |   |-- index.ts
|   |   |-- schemas.ts
|   |   |-- session-schemas.ts
|   |   `-- utils.ts
|   |-- types/
|   |   |-- batch.ts
|   |   |-- cache.ts
|   |   |-- config.ts
|   |   |-- error.ts
|   |   |-- events.ts
|   |   |-- index.ts
|   |   |-- indexing.ts
|   |   |-- logging.ts
|   |   |-- project.ts
|   |   |-- session.ts
|   |   |-- storage.ts
|   |   |-- task.ts
|   |   `-- transaction.ts
|   |-- utils/
|   |   |-- id-generator.ts
|   |   |-- path-utils.ts
|   |   `-- pattern-matcher.ts
|   |-- validation/
|   |   |-- config.ts
|   |   |-- id-schema.ts
|   |   |-- index.ts
|   |   |-- logging.ts
|   |   `-- path-validator.ts
|   |-- index.ts
|   `-- task-manager.ts
|-- LICENSE
|-- README.md
|-- jest.config.js
|-- package.json
|-- repo-tree.md
`-- tsconfig.json

29 directories, 89 files
