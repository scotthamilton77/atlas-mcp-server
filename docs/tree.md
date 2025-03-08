# atlas-mcp-server - Directory Structure

Generated on: 2025-03-08 17:04:16


```
atlas-mcp-server
├── docs
    └── tree.md
├── scripts
    ├── clean.ts
    ├── generate-tree.ts
    ├── make-executable.ts
    └── update-deps.ts
├── skills
    └── coding-standards.md
├── src
    ├── config
    │   └── index.ts
    ├── mcp
    │   ├── resources
    │   │   ├── projectDependencies
    │   │   │   ├── getProjectDependencies.ts
    │   │   │   ├── index.ts
    │   │   │   └── types.ts
    │   │   ├── projectDetails
    │   │   │   ├── getProjectDetails.ts
    │   │   │   ├── index.ts
    │   │   │   └── types.ts
    │   │   ├── projectLinks
    │   │   │   ├── getProjectLinks.ts
    │   │   │   ├── index.ts
    │   │   │   └── types.ts
    │   │   ├── projectList
    │   │   │   ├── index.ts
    │   │   │   ├── listProjects.ts
    │   │   │   └── types.ts
    │   │   ├── projectMembers
    │   │   │   ├── getProjectMembers.ts
    │   │   │   ├── index.ts
    │   │   │   └── types.ts
    │   │   └── projectNotes
    │   │   │   ├── getProjectNotes.ts
    │   │   │   ├── index.ts
    │   │   │   └── types.ts
    │   ├── tools
    │   │   ├── addProjectNote
    │   │   │   ├── addProjectNote.ts
    │   │   │   ├── index.ts
    │   │   │   └── types.ts
    │   │   ├── atlas-skill
    │   │   │   ├── index.ts
    │   │   │   ├── invoke-skills.ts
    │   │   │   ├── list-skills.ts
    │   │   │   ├── README.md
    │   │   │   ├── skill-manager.ts
    │   │   │   ├── skill-resolver.ts
    │   │   │   └── types.ts
    │   │   ├── createProject
    │   │   │   ├── createProject.ts
    │   │   │   ├── index.ts
    │   │   │   └── types.ts
    │   │   ├── databaseManagement
    │   │   │   ├── cleanDatabase.ts
    │   │   │   ├── index.ts
    │   │   │   └── types.ts
    │   │   ├── deleteProject
    │   │   │   ├── deleteProject.ts
    │   │   │   ├── index.ts
    │   │   │   └── types.ts
    │   │   ├── manageDependencies
    │   │   │   ├── addDependency.ts
    │   │   │   ├── index.ts
    │   │   │   ├── listDependencies.ts
    │   │   │   ├── removeDependency.ts
    │   │   │   └── types.ts
    │   │   ├── manageMembers
    │   │   │   ├── addMember.ts
    │   │   │   ├── index.ts
    │   │   │   ├── listMembers.ts
    │   │   │   ├── removeMember.ts
    │   │   │   └── types.ts
    │   │   ├── manageProjectLinks
    │   │   │   ├── addProjectLink.ts
    │   │   │   ├── deleteProjectLink.ts
    │   │   │   ├── index.ts
    │   │   │   ├── types.ts
    │   │   │   └── updateProjectLink.ts
    │   │   ├── neo4jSearch
    │   │   │   ├── index.ts
    │   │   │   ├── neo4jSearch.ts
    │   │   │   ├── neo4jSearchTool.ts
    │   │   │   └── types.ts
    │   │   ├── skills
    │   │   │   ├── base
    │   │   │   │   ├── coding-standards.ts
    │   │   │   │   └── software-engineer.ts
    │   │   │   ├── languages
    │   │   │   │   ├── react.ts
    │   │   │   │   └── typescript.ts
    │   │   │   └── tools
    │   │   │   │   ├── ci-cd.ts
    │   │   │   │   ├── docker.ts
    │   │   │   │   └── git.ts
    │   │   ├── updateProject
    │   │   │   ├── index.ts
    │   │   │   ├── types.ts
    │   │   │   └── updateProject.ts
    │   │   └── whiteboard
    │   │   │   ├── createWhiteboard.ts
    │   │   │   ├── deleteWhiteboard.ts
    │   │   │   ├── getWhiteboard.ts
    │   │   │   ├── index.ts
    │   │   │   ├── types.ts
    │   │   │   └── updateWhiteboard.ts
    │   └── server.ts
    ├── neo4j
    │   ├── projectService
    │   │   ├── projectContent.ts
    │   │   ├── projectCore.ts
    │   │   ├── projectRelations.ts
    │   │   ├── types.ts
    │   │   └── utils.ts
    │   ├── driver.ts
    │   ├── projectService.ts
    │   └── whiteboardService.ts
    ├── types
    │   ├── errors.ts
    │   ├── mcp.ts
    │   └── tool.ts
    ├── utils
    │   ├── bulkOperationManager.ts
    │   ├── errorHandler.ts
    │   ├── idGenerator.ts
    │   ├── logger.ts
    │   ├── projectHelpers.ts
    │   └── security.ts
    └── index.ts
├── tests
    ├── atlas-mcp-server-production-readiness-report-03-05-25.md
    ├── atlas-mcp-server-production-readiness-report-03-07-25.md
    └── prompt.md
├── docker-compose.yml
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
└── tsconfig.json

```

_Note: This tree excludes files and directories matched by .gitignore and common patterns like node_modules._
