# Changelog

All notable changes to this project will be documented in this file.

## [2.8.7] - 2025-05-22

### Changed
- **Development Tooling & Code Quality**:
  - Refactored utility scripts in `scripts/` directory for improved clarity, error handling, and security (e.g., path resolution within project root). This includes `clean.ts`, `db-backup.ts`, `db-import.ts`, `fetch-openapi-spec.ts`, `make-executable.ts`, and `tree.ts`.
  - Applied Prettier formatting across the entire codebase (`src/`, `examples/`, `scripts/`) for consistent styling.
- **Build & Configuration**:
  - Added `tsconfig.typedoc.json` for dedicated TypeDoc generation settings.
  - Updated `repomix.config.json` to adjust ignore patterns.
  - Minor formatting adjustment in `tsconfig.json`.
- **Documentation**:
  - Regenerated `docs/tree.md` to reflect the current project structure.
  - Updated version badge in `README.md` to 2.8.7.
- **Search Service**:
  - Refined tag-based search logic in `SearchService` to more robustly extract the core tag value from various regex patterns, improving search reliability.
- **Examples**: Minor formatting consistency updates to JSON files in `examples/backup-example/` and `examples/deep-research-example/`.

## [2.8.6] - 2025-05-22

### Added

- **Development Tooling**:
  - Integrated `prettier` for consistent code formatting.
  - Added a `format` script to `package.json` for running Prettier.
  - Included `mcp.json` for MCP client configuration and inspection.
- **Configuration**:
  - Introduced `LOGS_DIR` environment variable and configuration to specify the directory for log files, with validation to ensure it's within the project root.
  - Added new optional environment variables and corresponding configurations in `src/config/index.ts` for:
    - OpenRouter integration (`OPENROUTER_APP_URL`, `OPENROUTER_APP_NAME`, `OPENROUTER_API_KEY`).
    - Default LLM parameters (`LLM_DEFAULT_MODEL`, `LLM_DEFAULT_TEMPERATURE`, `LLM_DEFAULT_TOP_P`, `LLM_DEFAULT_MAX_TOKENS`, `LLM_DEFAULT_TOP_K`, `LLM_DEFAULT_MIN_P`).
    - OAuth Proxy settings (`OAUTH_PROXY_AUTHORIZATION_URL`, `OAUTH_PROXY_TOKEN_URL`, etc.).
- **Search**:
  - Added `assignedToUserId` filter to `atlas_unified_search` tool and `SearchService` for targeted task searches when performing property-specific queries.

### Changed

- **Configuration System (`src/config/index.ts`)**:
  - Major refactor to use Zod for robust environment variable validation, type safety, default values, and clearer error messages.
  - Improved `package.json` reading for default server name and version.
  - Generalized directory creation and validation logic (for `BACKUP_FILE_DIR` and new `LOGS_DIR`) into a reusable `ensureDirectory` function, enhancing security and robustness.
- **Search Functionality**:
  - **`atlas_unified_search` Tool**:
    - Behavior now differentiates:
      - If `property` is specified: Performs a regex-based search on that specific property. `caseInsensitive` and `fuzzy` (for 'contains' matching) options apply.
      - If `property` is omitted: Performs a full-text index search across default indexed fields. `fuzzy` option attempts a Lucene fuzzy query (e.g., `term~1`).
    - Updated input schema (`types.ts`) and implementation (`unifiedSearch.ts`) to reflect this dual-mode logic and new filters.
  - **`SearchService` (`src/services/neo4j/searchService.ts`)**:
    - `search()` method (for property-specific search) updated to handle `assignedToUserId` filter for tasks and pass through `caseInsensitive` and `fuzzy` flags.
    - `fullTextSearch()` method now executes full-text queries for each entity type (project, task, knowledge) sequentially, each within its own Neo4j session, to improve resource management and error isolation.
    - Updated `SearchOptions` type in `src/services/neo4j/types.ts`.
- **Logging (`src/utils/internal/logger.ts`)**:
  - Logger now directly uses the validated `config.logsPath` from the central configuration, ensuring logs are stored in the correctly specified and verified directory.
- **Build & Packaging (`package.json`, `package-lock.json`)**:
  - Added `prettier` as a dev dependency.
  - Updated `package.json` to include an `exports` field for better module resolution.
  - Added `engines` field specifying Node.js version compatibility (>=16.0.0).
  - Updated author information format.
- **Smithery Configuration (`smithery.yaml`)**:
  - Added `LOGS_DIR` to environment variable definitions.
- **Documentation**:
  - Updated `docs/tree.md` with the latest file structure and generation timestamp.
  - `typedoc.json`: Included `scripts` directory in documentation generation and updated the project name for API docs.

### Fixed

- **Configuration Robustness**: Enhanced safety in `src/config/index.ts` by ensuring `package.json` path resolution stays within the project root and by providing more context in console messages (e.g., when `package.json` cannot be read, or directories cannot be created), especially when `stdout` is a TTY.

## [2.8.5] - 2025-05-22

### Changed

- **Logging & Error Handling**:
  - Integrated `RequestContext` (from `src/utils/internal/requestContext.ts`) throughout the application, including all MCP tools, resources, and Neo4j services. This provides a unique `requestId` and `timestamp` for every operation, significantly improving log tracing and debugging capabilities.
  - Refactored the `logger.ts` to properly handle `RequestContext` and to ensure that error objects are passed directly to logging methods (e.g., `logger.error("message", errorAsError, context)`).
  - Updated `errorHandler.ts` to correctly utilize `RequestContext`, improve error detail consolidation, and ensure consistent logging of error metadata.
  - Modified `idGenerator.ts` to remove internal logging calls that were causing circular dependencies with `requestContextService` during application startup.
- **Dependencies**: Updated various dependencies to their latest versions, including `@modelcontextprotocol/sdk` (to 1.11.5), `@types/node` (to 22.15.21), `node-cron` (to 4.0.6), `openai` (to 4.102.0), `zod` (to 3.25.20), and `@types/validator` (to 13.15.1).
- **README.md**: Removed the "Automatic Backups (Note)" section as this functionality was previously deprecated.
- **Version Bump**: Updated project version to `2.8.5` in `package.json`, `package-lock.json`, and `README.md`.

## [2.8.4] - 2025-05-21

### Added

- Enhanced Web UI with new features:
  - **Task Flow Visualization**: Integrated Mermaid.js to display task dependencies as a flow chart.
  - **View Toggles**: Added "Compact View" and "Detailed View" toggles for Tasks and Knowledge sections.
  - **Improved Accessibility**: Enhanced HTML structure with ARIA attributes.

### Changed

- **Web UI Overhaul**:
  - Refactored `src/webui/script.js` into modular components (`config`, `dom`, `state`, `utils`, `apiService`, `renderService`, `eventHandlers`) for better maintainability and readability.
  - Redesigned `src/webui/style.css` for a modern minimalist aesthetic, including full dark mode support, improved responsiveness, and refined data presentation.
  - Updated `src/webui/index.html` with new structural elements, Mermaid.js CDN, and accessibility improvements.
- **Documentation**: Updated `docs/tree.md` to reflect the latest directory structure and generation date.
- **Version Bump**: Updated project version to `2.8.4` in `package.json` and `README.md`.

## [2.8.3] - 2025-05-20

### Added

- Basic Web UI for interacting with the Atlas MCP server. Includes `index.html`, `script.js`, and `style.css` under `src/webui/`.

### Changed

- Updated `docs/tree.md` to reflect the new `src/webui/` directory and current generation date.

## [2.8.2] - 2025-05-19

### Changed

- Updated various dependencies including `@modelcontextprotocol/sdk`, `commander`, `openai`, and `zod`.
- Standardized `RequestContext` usage across the MCP server (`server.ts`) and transport layers (`authMiddleware.ts`, `httpTransport.ts`, `stdioTransport.ts`) for improved logging and request tracing.
- Aligned `req.auth` in `authMiddleware.ts` with the SDK's `AuthInfo` type and enhanced JWT claim extraction for `clientId` and `scopes`.
- Alphabetized tool registration imports in `src/mcp/server.ts` for better organization.

## [2.8.0] - 2025-05-11

- **Repository Alignment**: Updated project structure, dependencies, and development scripts to align with the latest version of the `mcp-ts-template` (https://github.com/cyanheads/mcp-ts-template), ensuring consistency with best practices and template enhancements.

### Added

- **HTTP Transport Support**: Implemented an alternative HTTP transport layer for the MCP server, allowing connections over HTTP in addition to the existing stdio transport. This includes basic authentication middleware.
- **Enhanced Configuration System**: Integrated Zod for environment variable validation, providing type safety and clear error reporting for server configuration. Extended configuration options for server identity, logging, transport, HTTP settings, authentication, and rate limiting.
- **New Utility Modules**: Introduced new utility modules for:
  - `metrics`: Includes a `tokenCounter`.
  - `parsing`: Includes `dateParser` and `jsonParser`.
  - `security`: Includes `rateLimiter` and `sanitization` utilities.
- **Request Context Service**: Added a service for creating and managing request contexts, improving traceability and logging across operations.
- **Dependency Updates**:
  - Added `chrono-node` for advanced date parsing.
  - Added `openai`, `partial-json`, `sanitize-html`, `tiktoken` to support future AI and text processing capabilities.
  - Added `validator` for input validation.
- **New Dependencies & Scripts**: Added `ignore`, `winston-daily-rotate-file`, `yargs` as core dependencies, and `axios`, `js-yaml`, `typedoc` as development dependencies. Introduced new npm scripts for enhanced development workflows, including `docs:generate`, `fetch-spec`, `inspector`, `start:http`, and `start:stdio`.
- **OpenAPI Spec Fetching**: Added a new script `scripts/fetch-openapi-spec.ts` to retrieve OpenAPI specifications, likely for documentation or client generation.
- **Raw JSON for Unified Search**: The `atlas_unified_search` tool can now return raw JSON responses when specified, offering more flexibility for programmatic consumption.
- **Development Tooling**: Added `smithery.yaml`

### Changed

- **README Updates**: Improved clarity, accuracy, and formatting of the README.md. Updated tool descriptions, Neo4j setup instructions, and environment variable explanations.
- **Scripts & Configuration**:
  - Updated `db:backup` and `db:import` scripts in `package.json` to use `node --loader ts-node/esm`.
  - Standardized logger imports in database scripts to use barrel files.
  - Enhanced error logging in `db-import.ts`.
  - Changed default `BACKUP_FILE_DIR` in `src/config/index.ts` to `./atlas-backups` and corrected `fs` import order.
  - Updated `repomix.config.json` to ignore `.clinerules` and ensure a trailing newline.
- **Project Version**: Bumped version from 2.7.3 to 2.8.0.
- **Dependency Updates**:
  - Updated `@modelcontextprotocol/sdk` to `^1.11.1`.
  - Updated `@types/node` to `^22.15.17`.
  - Updated `node-cron` to `^4.0.3`.
- **Server Core Refactor**: Significantly refactored the main server startup (`src/index.ts`) and MCP server logic (`src/mcp/server.ts`) for better modularity, improved error handling, and to support multiple transport types.
- **Utilities Refactor**: Reorganized the `src/utils` directory into a more modular structure with subdirectories for `internal`, `metrics`, `parsing`, and `security`. Legacy top-level utility files were removed or relocated.
- **Internal Import Paths**: Updated internal import paths for logger, `ErrorHandler`, `McpError`, and `BaseErrorCode` across multiple service and utility files to align with the refactored `src/utils` structure and `src/types/errors.ts`.
- **Error Handling**: Adjusted error code mappings in `errorHandler.ts` (e.g., `PERMISSION_DENIED` from `FORBIDDEN`, `INTERNAL_ERROR` from `UNKNOWN_ERROR`) and updated specific error codes used in `dateParser.ts` (e.g. `VALIDATION_ERROR` from `PARSING_ERROR`).
- **Tool Response Creation**: Standardized MCP tool response creation by replacing custom `createFormattedResponse` utilities and `ResponseFormatter` interfaces with a local interface and the centralized `createToolResponse` function from `types/mcp.js`. This enhances consistency in how tools format and return their results.
- **Type Definitions**: Refactored `ToolContext` in `src/types/tool.ts` to be an alias for `OperationContext` and updated tool registration logic to reflect changes in middleware and permission handling.
- **Configuration Loading**: Improved project root detection and backup directory handling with enhanced security checks.
- **Developer Guidelines**: Significantly updated the developer cheat sheet (`.clinerules`) with comprehensive guidelines on request context, logging, error handling, sanitization, and an expanded repository structure overview.
- **`atlas_deep_research` Tool**: (Moved from Unreleased) Introduced a new MCP tool (`atlas_deep_research`) designed to initiate and structure deep research processes within the Atlas knowledge base. This tool allows users to define a primary research topic, goal, and scope, and break it down into manageable sub-topics with initial search queries. It creates a hierarchical knowledge graph in Neo4j, consisting of a root 'research-plan' node and child 'research-subtopic' nodes, facilitating organized research efforts. The tool supports client-provided IDs, domain categorization, initial tagging, and flexible response formatting (formatted string or raw JSON). Core logic resides in `src/mcp/tools/atlas_deep_research/deepResearch.ts`, with input validation using Zod schemas in `types.ts` and response formatting handled in `responseFormat.ts`. An example demonstrating its usage and output can be found in the [`examples/deep-research-example/`](./examples/deep-research-example/) directory.
- **Package Metadata**: Updated `package.json` with `files` directive, repository details (`repository`, `bugs`, `homepage`), an updated project description, and expanded keywords for better discoverability.
- **Knowledge Service Response**: The `KnowledgeService.addKnowledge` method now includes the `domain` name and `citations` in its response, providing more comprehensive data.
- **Task Service Response**: The `TaskService.createTask` method now includes `assignedToUserId` in its response, directly providing the assignee's identifier.

### Fixed

- **Documentation**: Updated the `docs/tree.md` to reflect the latest directory structure timestamp and changes from recent refactoring.
- **Task Creation Response**: Corrected the `atlas_task_create` tool to ensure the `assignedTo` field in the JSON response accurately reflects the `assignedToUserId` from the service layer, aligning output with input schema expectations.
