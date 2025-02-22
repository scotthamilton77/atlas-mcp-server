import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
  AddDependencySchema,
  AddDependencySchemaShape,
  RemoveDependencySchemaShape,
  ListDependenciesSchemaShape,
  ValidDependencyTypes
} from './types.js';
import { addDependency } from './addDependency.js';
import { removeDependency } from './removeDependency.js';
import { listDependencies } from './listDependencies.js';
import { registerTool, createToolExample, createToolMetadata } from '../../../types/tool.js';
import { z } from 'zod';

export const registerDependencyTools = (server: McpServer) => {
  // Register add dependency tool
  registerTool(
    server,
    "project.dependency.add",
    "Define project relationships with dependency types (requires/extends/implements/references). Supports single or bulk creation with circular dependency prevention.",
    AddDependencySchemaShape,
    addDependency,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            mode: "single",
            sourceProjectId: "proj_123",
            targetProjectId: "proj_456",
            type: "requires",
            description: "Core library dependency"
          },
          `{
  "id": "dep_abc",
  "sourceProjectId": "proj_123",
  "targetProjectId": "proj_456",
  "type": "requires",
  "description": "Core library dependency"
}`,
          "Add a single dependency"
        ),
        createToolExample(
          {
            mode: "bulk",
            dependencies: [
              {
                sourceProjectId: "proj_123",
                targetProjectId: "proj_456",
                type: "requires",
                description: "Core library dependency"
              },
              {
                sourceProjectId: "proj_789",
                targetProjectId: "proj_012",
                type: "implements",
                description: "Interface implementation"
              }
            ]
          },
          `{
  "success": true,
  "message": "Successfully created 2 dependencies",
  "created": [{
    "id": "dep_abc",
    "type": "requires",
    "description": "Core library dependency"
  }],
  "errors": []
}`,
          "Add multiple dependencies"
        )
      ],
      requiredPermission: "project:dependency:add",
      returnSchema: z.union([
        // Single dependency response
        z.object({
          id: z.string().describe("Dependency ID (dep_ prefix)"),
          sourceProjectId: z.string().describe("Source project ID"),
          targetProjectId: z.string().describe("Target project ID"),
          type: z.enum(ValidDependencyTypes).describe("Dependency type"),
          description: z.string().nullable().describe("Optional description"),
          createdAt: z.string().describe("Creation time")
        }),
        // Bulk creation response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message"),
          created: z.array(z.object({
            id: z.string().describe("Dependency ID"),
            sourceProjectId: z.string().describe("Source ID"),
            targetProjectId: z.string().describe("Target ID"),
            type: z.enum(ValidDependencyTypes).describe("Type"),
            description: z.string().nullable().describe("Description"),
            createdAt: z.string().describe("Created")
          })).describe("Created dependencies"),
          errors: z.array(z.object({
            index: z.number().describe("Error index"),
            error: z.string().describe("Error message")
          })).describe("Creation errors")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 20 // 20 dependency additions per minute (single or bulk)
      }
    })
  );

  // Register remove dependency tool
  registerTool(
    server,
    "project.dependency.remove",
    "Remove project dependencies. Use 'single' mode with dependencyId or 'bulk' mode with dependencyIds array. " +
    "This action cannot be undone.",
    RemoveDependencySchemaShape,
    removeDependency,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            mode: "single",
            dependencyId: "dep_abc"
          },
          `{
  "success": true,
  "message": "Dependency dep_abc removed successfully",
  "status": "removed",
  "details": {
    "id": "dep_abc",
    "type": "requires",
    "sourceProject": {
      "id": "proj_123",
      "name": "Core Library",
      "status": "active"
    },
    "targetProject": {
      "id": "proj_456",
      "name": "Client App",
      "status": "active"
    },
    "description": "Core library dependency",
    "createdAt": "2025-02-20T13:45:30Z",
    "removedAt": "2025-02-20T14:30:00Z"
  }
}`,
          "Remove a single dependency"
        ),
        createToolExample(
          {
            mode: "bulk",
            dependencyIds: ["dep_abc", "dep_def"]
          },
          `{
  "success": true,
  "message": "Successfully removed 2 dependencies",
  "deletedCount": 2,
  "notFoundIds": []
}`,
          "Remove multiple dependencies"
        )
      ],
      requiredPermission: "project:dependency:remove",
      returnSchema: z.union([
        // Single removal response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message"),
          status: z.enum(["removed", "not_found", "error"]).describe("Removal status"),
          details: z.object({
            id: z.string().describe("Dependency ID"),
            type: z.enum(ValidDependencyTypes).describe("Type"),
            sourceProject: z.object({
              id: z.string(),
              name: z.string(),
              status: z.string()
            }).describe("Source project"),
            targetProject: z.object({
              id: z.string(),
              name: z.string(),
              status: z.string()
            }).describe("Target project"),
            description: z.string().nullable(),
            createdAt: z.string(),
            removedAt: z.string()
          }).optional().describe("Removal details")
        }),
        // Bulk removal response
        z.object({
          success: z.boolean().describe("Operation success"),
          message: z.string().describe("Result message"),
          deletedCount: z.number().describe("Dependencies deleted"),
          notFoundIds: z.array(z.string()).describe("Dependencies not found")
        })
      ]),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 20 // 20 dependency removals per minute (single or bulk)
      }
    })
  );

  // Register list dependencies tool
  registerTool(
    server,
    "project.dependency.list",
    "List a project's dependencies (projects it depends on) and dependents (projects that depend on it), " +
    "grouped by relationship type.",
    ListDependenciesSchemaShape,
    listDependencies,
    createToolMetadata({
      examples: [
        createToolExample(
          {
            projectId: "proj_123"
          },
          `{
  "dependencies": [
    {
      "id": "dep_abc",
      "sourceProjectId": "proj_123",
      "targetProjectId": "proj_456",
      "type": "requires",
      "description": "Core library dependency",
      "createdAt": "2025-02-20T13:45:30Z"
    }
  ],
  "dependents": [
    {
      "id": "dep_def",
      "sourceProjectId": "proj_789",
      "targetProjectId": "proj_123",
      "type": "implements",
      "description": "Interface implementation",
      "createdAt": "2025-02-20T13:46:00Z"
    }
  ]
}`,
          "List project dependencies"
        )
      ],
      requiredPermission: "project:dependency:list",
      returnSchema: z.object({
        dependencies: z.array(z.object({
          id: z.string().describe("Dependency ID"),
          sourceProjectId: z.string().describe("Source ID"),
          targetProjectId: z.string().describe("Target ID"),
          type: z.enum(ValidDependencyTypes).describe("Type"),
          description: z.string().nullable().describe("Description"),
          createdAt: z.string().describe("Created")
        })).describe("Projects this depends on"),
        dependents: z.array(z.object({
          id: z.string().describe("Dependency ID"),
          sourceProjectId: z.string().describe("Source ID"),
          targetProjectId: z.string().describe("Target ID"),
          type: z.enum(ValidDependencyTypes).describe("Type"),
          description: z.string().nullable().describe("Description"),
          createdAt: z.string().describe("Created")
        })).describe("Projects depending on this")
      }),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30 // 30 dependency list requests per minute
      }
    })
  );
};