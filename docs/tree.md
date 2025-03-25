# atlas-mcp-server - Directory Structure

Generated on: 2025-03-25 11:40:52


```
atlas-mcp-server
├── docs
    ├── atlas-reference.md
    └── tree.md
├── scripts
    ├── clean.ts
    ├── db-backup.ts
    ├── generate-tree.ts
    ├── make-executable.ts
    └── update-deps.ts
├── src
    ├── config
    │   └── index.ts
    ├── docs
    ├── mcp
    │   ├── resources
    │   │   ├── knowledge
    │   │   │   └── knowledgeResources.ts
    │   │   ├── projects
    │   │   │   └── projectResources.ts
    │   │   ├── tasks
    │   │   │   └── taskResources.ts
    │   │   ├── index.ts
    │   │   └── types.ts
    │   ├── tools
    │   │   ├── atlas_database_clean
    │   │   │   ├── cleanDatabase.ts
    │   │   │   ├── index.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   └── types.ts
    │   │   ├── atlas_knowledge_add
    │   │   │   ├── addKnowledge.ts
    │   │   │   ├── index.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   └── types.ts
    │   │   ├── atlas_knowledge_delete
    │   │   │   ├── deleteKnowledge.ts
    │   │   │   ├── index.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   └── types.ts
    │   │   ├── atlas_knowledge_list
    │   │   │   ├── index.ts
    │   │   │   ├── listKnowledge.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   └── types.ts
    │   │   ├── atlas_project_create
    │   │   │   ├── createProject.ts
    │   │   │   ├── index.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   └── types.ts
    │   │   ├── atlas_project_delete
    │   │   │   ├── deleteProject.ts
    │   │   │   ├── index.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   └── types.ts
    │   │   ├── atlas_project_list
    │   │   │   ├── index.ts
    │   │   │   ├── listProjects.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   └── types.ts
    │   │   ├── atlas_project_update
    │   │   │   ├── index.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   ├── types.ts
    │   │   │   └── updateProject.ts
    │   │   ├── atlas_task_create
    │   │   │   ├── createTask.ts
    │   │   │   ├── index.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   └── types.ts
    │   │   ├── atlas_task_delete
    │   │   │   ├── deleteTask.ts
    │   │   │   ├── index.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   └── types.ts
    │   │   ├── atlas_task_list
    │   │   │   ├── index.ts
    │   │   │   ├── listTasks.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   └── types.ts
    │   │   ├── atlas_task_update
    │   │   │   ├── index.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   ├── types.ts
    │   │   │   └── updateTask.ts
    │   │   └── atlas_unified_search
    │   │   │   ├── index.ts
    │   │   │   ├── responseFormat.ts
    │   │   │   ├── types.ts
    │   │   │   └── unifiedSearch.ts
    │   └── server.ts
    ├── services
    │   └── neo4j
    │   │   ├── backup_services
    │   │       ├── autoExportManager.ts
    │   │       ├── backupCoordinator.ts
    │   │       ├── backupManager.ts
    │   │       ├── backupMonitor.ts
    │   │       ├── exportService.ts
    │   │       ├── importService.ts
    │   │       └── resilientConnection.ts
    │   │   ├── driver.ts
    │   │   ├── events.ts
    │   │   ├── helpers.ts
    │   │   ├── index.ts
    │   │   ├── knowledgeService.ts
    │   │   ├── projectService.ts
    │   │   ├── searchService.ts
    │   │   ├── taskService.ts
    │   │   ├── types.ts
    │   │   └── utils.ts
    ├── types
    │   ├── errors.ts
    │   ├── mcp.ts
    │   └── tool.ts
    ├── utils
    │   ├── errorHandler.ts
    │   ├── idGenerator.ts
    │   ├── logger.ts
    │   ├── responseFormatter.ts
    │   └── security.ts
    └── index.ts
├── tests
    ├── atlas-mcp-server-production-readiness-report-03-05-25.md
    ├── atlas-mcp-server-production-readiness-report-03-07-25.md
    └── prompt.md
├── .clinerules
├── .repomixignore
├── docker-compose.yml
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
├── repomix.config.json
└── tsconfig.json

```

_Note: This tree excludes files and directories matched by .gitignore and common patterns like node_modules._
