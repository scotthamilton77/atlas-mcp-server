import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ResponseFormat, createResponseFormatEnum, createToolResponse } from "../../../types/mcp.js";
import { createToolExample, createToolMetadata, registerTool } from "../../../types/tool.js";
import { atlasUnifiedSearch } from "./unifiedSearch.js";
import { UnifiedSearchRequestInput, UnifiedSearchRequestSchema } from "./types.js"; // Corrected type import
import { formatUnifiedSearchResponse } from "./responseFormat.js";

export const registerAtlasUnifiedSearchTool = (server: McpServer) => {
  registerTool(
    server,
    "atlas_unified_search",
    "Performs a unified search across all entity types (projects, tasks, and knowledge) with relevance scoring and flexible filtering options",
    {
      property: z.string().optional().describe(
        "Specific property to search within (e.g., name, description, text)"
      ),
      value: z.string().describe(
        "Search term or phrase to find across the knowledge base (required)"
      ),
      entityTypes: z.array(
        z.enum(['project', 'task', 'knowledge'])
      ).optional().describe(
        "Array of entity types to include in search (Default: all types)"
      ),
      caseInsensitive: z.boolean().optional().default(true).describe(
        "Boolean flag to ignore case sensitivity when searching for better recall (Default: true)"
      ),
      fuzzy: z.boolean().optional().default(false).describe(
        "Boolean flag to enable approximate matching for typos, spelling variations, and similar terms (Default: false)"
      ),
      taskType: z.string().optional().describe(
        "Optional filter by project/task classification type for more targeted results"
      ),
      page: z.number().optional().describe(
        "Page number for paginated results (Default: 1)"
      ),
      limit: z.number().optional().describe( // Corrected syntax: added 'limit:' key
        "Number of results per page, maximum 100 (Default: 20)"
      ),
      responseFormat: createResponseFormatEnum().optional().default(ResponseFormat.FORMATTED).describe(
        "Desired response format: 'formatted' (default string) or 'json' (raw object)"
      ),
    },
    async (input, context) => {
      // Process unified search request
      const validatedInput = input as unknown as UnifiedSearchRequestInput & { responseFormat?: ResponseFormat }; // Corrected type cast
      const result = await atlasUnifiedSearch(validatedInput, context); // Added context argument

      // Conditionally format response
      if (validatedInput.responseFormat === ResponseFormat.JSON) {
        return createToolResponse(JSON.stringify(result, null, 2));
      } else {
        // Return the result using the formatter for rich display
        return formatUnifiedSearchResponse(result, false); // Corrected: Already had the second argument, error was likely from previous state. Keeping it explicit.
      }
    },
    createToolMetadata({
      examples: [
        createToolExample(
          {
            value: "authentication",
            entityTypes: ["project", "task"],
            fuzzy: true
          },
          `{
            "results": [
              {
                "id": "task_auth123",
                "type": "task",
                "entityType": "implementation",
                "title": "Implement OAuth Authentication",
                "description": "Create secure authentication system using OAuth 2.0 protocol",
                "matchedProperty": "title",
                "matchedValue": "Implement OAuth Authentication",
                "createdAt": "2025-03-15T10:22:44.123Z",
                "updatedAt": "2025-03-15T10:22:44.123Z",
                "projectId": "proj_backend42",
                "projectName": "API Platform Modernization",
                "score": 9.5
              },
              {
                "id": "proj_auth456",
                "type": "project",
                "entityType": "security",
                "title": "Authentication Microservice",
                "description": "Build standalone authentication microservice with JWT, refresh tokens and multi-factor support",
                "matchedProperty": "name",
                "matchedValue": "Authentication Microservice",
                "createdAt": "2025-03-10T08:30:12.456Z",
                "updatedAt": "2025-03-10T08:30:12.456Z",
                "score": 10
              }
            ],
            "total": 2,
            "page": 1,
            "limit": 20,
            "totalPages": 1
          }`,
          "Search for authentication-related projects and tasks with fuzzy matching"
        ),
        createToolExample(
          {
            value: "performance",
            property: "description",
            entityTypes: ["knowledge"]
          },
          `{
            "results": [
              {
                "id": "know_perf123",
                "type": "knowledge",
                "entityType": "technical",
                "title": "React Performance Optimiz...",
                "description": "Techniques for optimizing React component performance including memoization, virtualization, and code splitting",
                "matchedProperty": "text",
                "matchedValue": "Techniques for optimizing React component performance including memoization, virtualization, and code splitting",
                "createdAt": "2025-03-18T14:05:33.789Z",
                "updatedAt": "2025-03-18T14:05:33.789Z",
                "projectId": "proj_frontend42",
                "projectName": "Frontend Modernization",
                "score": 8.2
              }
            ],
            "total": 1,
            "page": 1,
            "limit": 20,
            "totalPages": 1
          }`,
          "Search knowledge items containing 'performance' in the description"
        ),
        createToolExample(
          {
            value: "api",
            entityTypes: ["project", "task", "knowledge"],
            limit: 10,
            page: 1
          },
          `{
            "results": [
              {
                "id": "proj_api789",
                "type": "project",
                "entityType": "integration",
                "title": "API Gateway Implementation",
                "description": "Create centralized API gateway for service integration with rate limiting, monitoring and authentication",
                "matchedProperty": "name",
                "matchedValue": "API Gateway Implementation",
                "createdAt": "2025-03-01T09:45:22.321Z",
                "updatedAt": "2025-03-05T15:12:44.456Z",
                "score": 10
              },
              {
                "id": "task_api456",
                "type": "task",
                "entityType": "development",
                "title": "Document REST API Endpoints",
                "description": "Create comprehensive documentation for all REST API endpoints using OpenAPI specification",
                "matchedProperty": "title",
                "matchedValue": "Document REST API Endpoints",
                "createdAt": "2025-03-08T11:20:15.654Z",
                "updatedAt": "2025-03-08T11:20:15.654Z",
                "projectId": "proj_api789",
                "projectName": "API Gateway Implementation",
                "score": 9.8
              },
              {
                "id": "know_api321",
                "type": "knowledge",
                "entityType": "technical",
                "title": "API Design Best Practices...",
                "description": "Best practices for RESTful API design including versioning, error handling, and resource naming conventions",
                "matchedProperty": "text",
                "matchedValue": "Best practices for RESTful API design including versioning, error handling, and resource naming conventions",
                "createdAt": "2025-03-12T16:30:45.987Z",
                "updatedAt": "2025-03-12T16:30:45.987Z",
                "projectId": "proj_api789",
                "projectName": "API Gateway Implementation",
                "score": 8.5
              }
            ],
            "total": 8,
            "page": 1,
            "limit": 10,
            "totalPages": 1
          }`,
          "Search for 'api' across all entity types with pagination"
        )
      ],
      requiredPermission: "search:read",
      returnSchema: z.object({
        results: z.array(z.object({
          id: z.string().describe("Unique identifier"),
          type: z.enum(['project', 'task', 'knowledge']).describe("Entity type"),
          entityType: z.string().describe("Specific classification of the entity"),
          title: z.string().describe("Entity title or name"),
          description: z.string().describe("Entity description text"),
          matchedProperty: z.string().describe("Property where the match was found"),
          matchedValue: z.string().describe("Value containing the match"),
          createdAt: z.string().describe("Creation timestamp"),
          updatedAt: z.string().describe("Last update timestamp"),
          projectId: z.string().optional().describe("Project ID (for tasks and knowledge)"),
          projectName: z.string().optional().describe("Project name (for tasks and knowledge)"),
          score: z.number().describe("Relevance score")
        })),
        total: z.number().int().describe("Total number of matching results"),
        page: z.number().int().describe("Current page number"),
        limit: z.number().int().describe("Results per page"),
        totalPages: z.number().int().describe("Total number of pages")
      }),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 20 // 20 requests per minute
      }
    })
  );
};
