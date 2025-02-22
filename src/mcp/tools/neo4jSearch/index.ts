import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { neo4jSearchTool } from "./neo4jSearchTool.js";
import { registerTool, createToolExample, createToolMetadata } from "../../../types/tool.js";
import { z } from "zod";
import { Neo4jSearchSchema } from "./types.js";

export const registerNeo4jSearchTool = (server: McpServer) => {
  registerTool(
    server,
    "neo4j.search",
    "Search the neo4j project & whiteboard database for nodes with specific property values. Supports case-insensitive, wildcard, fuzzy matching, and pagination.",
    Neo4jSearchSchema.shape,
    neo4jSearchTool,
    createToolMetadata({
      examples: [
        createToolExample(
          { 
            property: "name", 
            value: "sample" 
          },
          `{
  "results": [{
    "id": "node1",
    "name": "Sample Node"
  }],
  "pagination": { 
    "total": 1, "page": 1, "limit": 100, "totalPages": 1
  }
}`,
          "Basic search: nodes with 'name' containing 'sample'."
        ),
        createToolExample(
          { 
            property: "name", 
            value: "TEST",
            caseInsensitive: true,
            wildcard: true,
            page: 1,
            limit: 50
          },
          `{
  "results": [{
    "id": "node1",
    "name": "test integration suite"
  }],
  "pagination": { "total": 1, "page": 1, "limit": 50, "totalPages": 1 }
  }
}`,
          "Advanced search: case-insensitive with wildcards and pagination"
        )
      ],
      requiredPermission: "neo4j.search",
      returnSchema: z.object({
        results: z.array(z.any()),
        pagination: z.object({
          total: z.number(),
          page: z.number(),
          limit: z.number(),
          totalPages: z.number()
        })
      })
    })
  );
};