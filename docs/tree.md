# Project Directory Structure

```
├── .github
    ├── workflows
    │   └── publish.yml
    └── .DS_Store
├── docs
    └── tree.md
├── scripts
    ├── clean.js
    ├── generate-tree.js
    └── make-executable.js
├── src
    ├── config
    │   └── index.ts
    ├── mcp
    │   ├── prompts
    │   │   └── projectSummary
    │   │   │   ├── index.ts
    │   │   │   ├── projectSummary.ts
    │   │   │   └── types.ts
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
    ├── .DS_Store
    └── index.ts
├── .DS_Store
├── .env
├── .env.example
├── .gitignore
├── docker-compose.yml
├── LICENSE
├── package-lock.json
├── package.json
├── project-spec.md
├── README.md
└── tsconfig.json
```
