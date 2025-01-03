```text
atlas-mcp-server
├── .husky/
│   ├── _/
│   │   ├── .gitignore
│   │   ├── applypatch-msg
│   │   ├── commit-msg
│   │   ├── h
│   │   ├── husky.sh
│   │   ├── post-applypatch
│   │   ├── post-checkout
│   │   ├── post-commit
│   │   ├── post-merge
│   │   ├── post-rewrite
│   │   ├── pre-applypatch
│   │   ├── pre-auto-gc
│   │   ├── pre-commit
│   │   ├── pre-merge-commit
│   │   ├── pre-push
│   │   ├── pre-rebase
│   │   └── prepare-commit-msg
│   └── pre-commit
├── config/
│   ├── default.json
│   └── notes.json
├── examples/
│   ├── portfolio-website/
│   │   ├── prompt.md
│   │   ├── README.md
│   │   └── task-hierarchy-full.json
│   ├── templates_showcase/
│   │   ├── atlas-tasks.db
│   │   ├── tasks-2025-01-03.json
│   │   └── tasks-2025-01-03.md
│   └── README.md
├── notes/
│   ├── task-creation.md
│   ├── task-maintenance.md
│   └── task-update.md
├── scripts/
│   ├── generate-tree.js
│   ├── postinstall.js
│   ├── prestart.js
│   └── set-build-permissions.js
├── src/
│   ├── config/
│   │   ├── config-initializer.ts
│   │   ├── config-manager.ts
│   │   ├── index.ts
│   │   └── README.md
│   ├── errors/
│   │   ├── base-error.ts
│   │   ├── config-error.ts
│   │   ├── error-factory.ts
│   │   ├── index.ts
│   │   ├── logging-error.ts
│   │   ├── README.md
│   │   ├── storage-error.ts
│   │   ├── task-error.ts
│   │   └── tool-error.ts
│   ├── events/
│   │   ├── batch-processor.ts
│   │   ├── event-manager.ts
│   │   ├── health-monitor.ts
│   │   └── README.md
│   ├── logging/
│   │   ├── error-formatter.ts
│   │   ├── file-transport.ts
│   │   ├── health-monitor.ts
│   │   ├── index.ts
│   │   ├── logger.ts
│   │   ├── README.md
│   │   ├── transaction-logger.ts
│   │   └── transport-manager.ts
│   ├── notes/
│   │   ├── index.ts
│   │   ├── note-manager.ts
│   │   └── notes-initializer.ts
│   ├── server/
│   │   ├── health-monitor.ts
│   │   ├── index.ts
│   │   ├── metrics-collector.ts
│   │   ├── rate-limiter.ts
│   │   ├── README.md
│   │   └── request-tracer.ts
│   ├── storage/
│   │   ├── base/
│   │   │   └── base-storage.ts
│   │   ├── connection/
│   │   │   ├── pool/
│   │   │   │   ├── connection-pool.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── sqlite-connection-factory.ts
│   │   │   │   ├── sqlite-connection.ts
│   │   │   │   └── types.ts
│   │   │   ├── index.ts
│   │   │   └── manager.ts
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
│   │   │   │   ├── coordinator.ts
│   │   │   │   ├── manager.ts
│   │   │   │   └── scope.ts
│   │   │   ├── wal/
│   │   │   │   ├── checkpoint-manager.ts
│   │   │   │   ├── file-handler.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── manager.ts
│   │   │   │   ├── metrics-collector.ts
│   │   │   │   └── types.ts
│   │   │   └── index.ts
│   │   ├── factory/
│   │   │   └── error-handler.ts
│   │   ├── interfaces/
│   │   │   ├── config.ts
│   │   │   ├── storage.ts
│   │   │   ├── template-storage.ts
│   │   │   └── types.ts
│   │   ├── monitoring/
│   │   │   ├── health.ts
│   │   │   ├── index.ts
│   │   │   └── metrics.ts
│   │   ├── query/
│   │   │   ├── builder/
│   │   │   │   ├── query-builder.ts
│   │   │   │   └── sqlite-query-builder.ts
│   │   │   ├── optimizer/
│   │   │   │   ├── index.ts
│   │   │   │   └── sqlite-optimizer.ts
│   │   │   ├── executor.ts
│   │   │   └── index.ts
│   │   ├── sqlite/
│   │   │   ├── database/
│   │   │   │   ├── connection.ts
│   │   │   │   └── schema.ts
│   │   │   ├── metrics/
│   │   │   │   └── storage-metrics.ts
│   │   │   ├── operations/
│   │   │   │   └── task-operations.ts
│   │   │   ├── config.ts
│   │   │   ├── error-handler.ts
│   │   │   ├── index.ts
│   │   │   ├── init.ts
│   │   │   ├── storage.ts
│   │   │   └── template-storage.ts
│   │   ├── utils/
│   │   │   ├── index.ts
│   │   │   ├── storage-error-handler.ts
│   │   │   └── storage-path-utils.ts
│   │   ├── factory.ts
│   │   ├── index.ts
│   │   └── README.md
│   ├── task/
│   │   ├── core/
│   │   │   ├── batch/
│   │   │   │   ├── common/
│   │   │   │   │   └── batch-utils.ts
│   │   │   │   ├── services/
│   │   │   │   │   ├── dependency-validation-service.ts
│   │   │   │   │   └── status-transition-service.ts
│   │   │   │   ├── base-batch-processor.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── README.md
│   │   │   │   └── unified-batch-processor.ts
│   │   │   ├── cache/
│   │   │   │   ├── cache-coordinator.ts
│   │   │   │   ├── cache-manager.ts
│   │   │   │   ├── cache-metrics.ts
│   │   │   │   ├── index.ts
│   │   │   │   └── resource-cache-manager.ts
│   │   │   ├── indexing/
│   │   │   │   ├── index-manager.ts
│   │   │   │   └── index.ts
│   │   │   ├── transactions/
│   │   │   │   ├── index.ts
│   │   │   │   ├── task-transaction-manager.ts
│   │   │   │   └── transaction-manager.ts
│   │   │   ├── error-handler.ts
│   │   │   ├── index.ts
│   │   │   ├── status-state-machine.ts
│   │   │   ├── task-resource-handler.ts
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
│   │   ├── validation/
│   │   │   ├── schemas/
│   │   │   │   ├── base-schema.ts
│   │   │   │   ├── bulk-operations-schema.ts
│   │   │   │   ├── create-schema.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── metadata-schema.ts
│   │   │   │   ├── task-schemas.ts
│   │   │   │   └── update-schema.ts
│   │   │   ├── validators/
│   │   │   │   ├── dependency-validator.ts
│   │   │   │   ├── hierarchy-validator.ts
│   │   │   │   ├── index.ts
│   │   │   │   └── status-validator.ts
│   │   │   ├── index.ts
│   │   │   └── task-validator.ts
│   │   └── README.md
│   ├── template/
│   │   ├── interpolation/
│   │   │   ├── metadata-transformer.ts
│   │   │   └── variable-interpolator.ts
│   │   ├── loader/
│   │   │   ├── template-loader.ts
│   │   │   └── template-validator.ts
│   │   ├── validation/
│   │   │   └── schemas/
│   │   │       └── template-schemas.ts
│   │   ├── manager.ts
│   │   └── README.md
│   ├── tools/
│   │   ├── definitions/
│   │   │   ├── tools/
│   │   │   │   ├── shared/
│   │   │   │   │   ├── response-formatter.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── agent-builder-tool.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── task-creation.ts
│   │   │   │   ├── task-deletion.ts
│   │   │   │   ├── task-maintenance.ts
│   │   │   │   ├── task-operations.ts
│   │   │   │   ├── task-queries.ts
│   │   │   │   ├── task-update.ts
│   │   │   │   └── template-tools.ts
│   │   │   ├── agent-builder.ts
│   │   │   └── tool-definitions.ts
│   │   ├── error-handler.ts
│   │   ├── handler.ts
│   │   ├── index.ts
│   │   ├── README.md
│   │   ├── schemas.ts
│   │   ├── session-schemas.ts
│   │   ├── types.ts
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
│   │   ├── lru-cache.d.ts
│   │   ├── notes.ts
│   │   ├── project.ts
│   │   ├── README.md
│   │   ├── session.ts
│   │   ├── storage.ts
│   │   ├── task-core.ts
│   │   ├── task-metadata.ts
│   │   ├── task-types.ts
│   │   ├── task.ts
│   │   ├── template.ts
│   │   ├── tool.ts
│   │   └── transaction.ts
│   ├── utils/
│   │   ├── date-formatter.ts
│   │   ├── error-utils.ts
│   │   ├── id-generator.ts
│   │   ├── path-utils.ts
│   │   ├── pattern-matcher.ts
│   │   ├── platform-utils.ts
│   │   └── README.md
│   ├── validation/
│   │   ├── core/
│   │   │   ├── config/
│   │   │   │   └── schema.ts
│   │   │   ├── id/
│   │   │   │   └── schema.ts
│   │   │   ├── path/
│   │   │   │   └── schema.ts
│   │   │   ├── constants.ts
│   │   │   └── index.ts
│   │   ├── config.ts
│   │   ├── id-schema.ts
│   │   ├── index.ts
│   │   └── README.md
│   ├── visualization/
│   │   ├── formatters/
│   │   │   ├── base-formatter.ts
│   │   │   ├── index.ts
│   │   │   ├── json-formatter.ts
│   │   │   └── markdown-formatter.ts
│   │   ├── index.ts
│   │   ├── README.md
│   │   ├── task-visualizer.ts
│   │   └── visualization-manager.ts
│   └── index.ts
├── templates/
│   ├── software_engineer/
│   │   ├── devops_engineer.json
│   │   ├── product_designer.json
│   │   ├── security_engineer.json
│   │   ├── system_architect.json
│   │   ├── team.json
│   │   └── tech_lead.json
│   ├── README.md
│   └── web-project.json
├── .eslintrc.json
├── .gitignore
├── .prettierrc
├── eslint.config.js
├── LICENSE
├── package.json
├── README.md
├── repo-tree.md
├── storage-refactor.md
└── tsconfig.json
```
