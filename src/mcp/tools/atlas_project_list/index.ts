import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { ProjectStatus } from '../../../types/mcp.js';
import { createToolExample, createToolMetadata, registerTool } from '../../../types/tool.js';
import { listProjects } from './listProjects.js';
import { ProjectListRequest } from './types.js';
import { formatProjectListResponse } from './responseFormat.js';

/**
 * Registers the atlas_project_list tool with the MCP server
 * 
 * @param server The MCP server instance
 */
export function registerAtlasProjectListTool(server: McpServer): void {
  registerTool(
    server,
    "atlas_project_list",
    "Retrieves and filters project entities based on specified criteria",
    {
      mode: z.enum(['all', 'details']).optional().default('all')
        .describe('Listing mode - "all" for paginated list, "details" for single project'),
      id: z.string().optional()
        .describe('Project ID to retrieve details for (required for mode="details")'),
      page: z.number().min(1).optional().default(1)
        .describe('Page number for paginated results (Default: 1)'),
      limit: z.number().min(1).max(100).optional().default(20)
        .describe('Number of results per page, maximum 100 (Default: 20)'),
      includeKnowledge: z.boolean().optional().default(false)
        .describe('Boolean flag to include associated knowledge items (Default: false)'),
      includeTasks: z.boolean().optional().default(false)
        .describe('Boolean flag to include associated tasks (Default: false)'),
      taskType: z.string().optional()
        .describe('Filter results by project classification'),
      status: z.union([
        z.enum(['active', 'pending', 'completed', 'archived']),
        z.array(z.enum(['active', 'pending', 'completed', 'archived']))
      ]).optional()
        .describe('Filter results by project status')
    },
    async (input, context) => {
      // Parse and process input
      const result = await listProjects(input as unknown as ProjectListRequest);
      
      // Return the result using the formatter for rich display
      return formatProjectListResponse(result);
    },
    createToolMetadata({
      examples: [
        createToolExample(
          {
            mode: "all",
            limit: 5
          },
          `{
            "projects": [
              {
                "id": "proj_ms_migration",
                "name": "Microservice Architecture Migration",
                "description": "Refactor monolithic application into scalable microservices architecture with distributed data stores and API gateway",
                "status": "active",
                "urls": [
                  {"title": "Architecture RFC", "url": "https://github.com/company/arch-specs/rfc-2023.md"}, 
                  {"title": "Technical Spec", "url": "file:///specs/microservice-migration.ts"}
                ],
                "completionRequirements": "All critical services migrated with 100% test coverage, performance metrics meeting SLAs, and zero regressions in core functionality",
                "outputFormat": "Containerized services with CI/CD pipelines, comprehensive API documentation, and migration runbook",
                "taskType": "integration",
                "createdAt": "2025-03-23T10:11:24.123Z",
                "updatedAt": "2025-03-23T10:11:24.123Z"
              },
              {
                "id": "proj_graphql",
                "name": "GraphQL API Implementation",
                "description": "Design and implement GraphQL API layer to replace existing REST endpoints with optimized query capabilities",
                "status": "in-progress",
                "urls": [
                  {"title": "GraphQL Schema Design", "url": "https://github.com/company/api-specs/graphql-schema.graphql"},
                  {"title": "Apollo Server Config", "url": "file:///specs/apollo-config.ts"}
                ],
                "completionRequirements": "API supports all current use cases with n+1 query optimization, proper error handling, and 95% test coverage",
                "outputFormat": "TypeScript-based GraphQL schema with resolvers, documentation, and integration tests",
                "taskType": "generation",
                "createdAt": "2025-03-23T10:11:24.456Z",
                "updatedAt": "2025-03-23T10:11:24.456Z"
              }
            ],
            "total": 2,
            "page": 1,
            "limit": 5,
            "totalPages": 1
          }`,
          "Retrieve project portfolio with pagination controls"
        ),
        createToolExample(
          {
            mode: "details",
            id: "proj_ms_migration",
            includeTasks: true,
            includeKnowledge: true
          },
          `{
            "projects": [
              {
                "id": "proj_ms_migration",
                "name": "Microservice Architecture Migration",
                "description": "Refactor monolithic application into scalable microservices architecture with distributed data stores and API gateway",
                "status": "active",
                "urls": [
                  {"title": "Architecture RFC", "url": "https://github.com/company/arch-specs/rfc-2023.md"}, 
                  {"title": "Technical Spec", "url": "file:///specs/microservice-migration.ts"},
                  {"title": "Service Mesh Docs", "url": "https://istio.io/latest/docs/"}
                ],
                "completionRequirements": "All critical services migrated with 100% test coverage, performance metrics meeting SLAs, and zero regressions in core functionality",
                "outputFormat": "Containerized services with CI/CD pipelines, comprehensive API documentation, and migration runbook",
                "taskType": "integration",
                "createdAt": "2025-03-23T10:11:24.123Z",
                "updatedAt": "2025-03-23T10:11:24.123Z",
                "tasks": [
                  {
                    "id": "task_auth_svc",
                    "title": "Authentication Service Extraction",
                    "status": "in_progress",
                    "priority": "critical",
                    "createdAt": "2025-03-23T10:15:32.123Z"
                  },
                  {
                    "id": "task_api_gateway",
                    "title": "API Gateway Implementation with Kong",
                    "status": "todo",
                    "priority": "high",
                    "createdAt": "2025-03-23T10:17:45.123Z"
                  }
                ],
                "knowledge": [
                  {
                    "id": "know_saga_pattern",
                    "text": "Distributed transactions must use Saga pattern with compensating actions to maintain data integrity across services",
                    "tags": ["architecture", "data-integrity", "patterns"],
                    "domain": "technical",
                    "createdAt": "2025-03-23T11:22:14.789Z"
                  },
                  {
                    "id": "know_rate_limiting",
                    "text": "Rate limiting should be implemented at the API Gateway level using Redis-based token bucket algorithm",
                    "tags": ["api-gateway", "performance", "security"],
                    "domain": "technical",
                    "createdAt": "2025-03-23T12:34:27.456Z"
                  }
                ]
              }
            ],
            "total": 1,
            "page": 1,
            "limit": 20,
            "totalPages": 1
          }`,
          "Retrieve comprehensive project details with associated tasks and technical knowledge"
        ),
        createToolExample(
          {
            mode: "all",
            status: ["active", "in-progress"],
            taskType: "analysis"
          },
          `{
            "projects": [
              {
                "id": "proj_perf",
                "name": "Performance Optimization Suite",
                "description": "Identify and resolve frontend rendering bottlenecks in React application through profiling and optimization techniques",
                "status": "active",
                "urls": [
                  {"title": "Lighthouse CI Results", "url": "https://lighthouse-ci.app/dashboard?project=frontend-perf"},
                  {"title": "Web Vitals Tracking", "url": "https://analytics.google.com/web-vitals"}
                ],
                "completionRequirements": "Core React components meet Web Vitals thresholds with 50% reduction in LCP and TTI metrics",
                "outputFormat": "Optimized component library, performance test suite, and technical recommendation document",
                "taskType": "analysis",
                "createdAt": "2025-03-23T10:11:24.123Z",
                "updatedAt": "2025-03-23T10:11:24.123Z"
              },
              {
                "id": "proj_security",
                "name": "Security Vulnerability Assessment",
                "description": "Comprehensive security analysis of authentication flow and data storage with OWASP compliance verification",
                "status": "in-progress",
                "urls": [
                  {"title": "OWASP Top 10", "url": "https://owasp.org/Top10/"},
                  {"title": "Security Checklist", "url": "file:///security/assessment-checklist.md"}
                ],
                "completionRequirements": "All high and critical vulnerabilities resolved, compliance with OWASP Top 10, and security test coverage exceeding 90%",
                "outputFormat": "Security report with remediation steps, updated authentication flow, and automated security test suite",
                "taskType": "analysis",
                "createdAt": "2025-03-24T09:34:12.789Z",
                "updatedAt": "2025-03-24T09:34:12.789Z"
              }
            ],
            "total": 2,
            "page": 1,
            "limit": 20,
            "totalPages": 1
          }`,
          "Query projects by lifecycle state and classification type"
        )
      ],
      requiredPermission: "project:read",
      entityType: 'project',
      returnSchema: z.object({
        projects: z.array(z.object({
          id: z.string().describe("Project ID"),
          name: z.string().describe("Project name"),
          description: z.string().describe("Project description"),
          status: z.string().describe("Project status"),
          urls: z.array(z.object({
            title: z.string(),
            url: z.string()
          })).describe("Reference materials"),
          completionRequirements: z.string().describe("Completion criteria"),
          outputFormat: z.string().describe("Deliverable format"),
          taskType: z.string().describe("Project classification"),
          createdAt: z.string().describe("Creation timestamp"),
          updatedAt: z.string().describe("Last update timestamp"),
          knowledge: z.array(z.object({
            id: z.string(),
            text: z.string(),
            tags: z.array(z.string()).optional(),
            domain: z.string(),
            createdAt: z.string()
          })).optional().describe("Associated knowledge items (if requested)"),
          tasks: z.array(z.object({
            id: z.string(),
            title: z.string(),
            status: z.string(),
            priority: z.string(),
            createdAt: z.string()
          })).optional().describe("Associated tasks (if requested)")
        })),
        total: z.number().describe("Total number of projects matching criteria"),
        page: z.number().describe("Current page number"),
        limit: z.number().describe("Number of items per page"),
        totalPages: z.number().describe("Total number of pages")
      }),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30 // 30 requests per minute
      }
    })
  );
}
