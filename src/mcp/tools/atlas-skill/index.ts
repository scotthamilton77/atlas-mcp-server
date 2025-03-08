import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTool, createToolMetadata } from "../../../types/tool.js";
import { z } from "zod";
import { listSkills } from "./list-skills.js";
import { invokeSkills } from "./invoke-skills.js";

/**
 * Register ATLAS Skill tools with the MCP server
 */
export const registerAtlasSkillTools = (server: McpServer) => {
  // Register the atlas_skill_list tool
  registerTool(
    server,
    "atlas_skill_list",
    "Lists available skills with optional fuzzy name matching",
    {
      filter: z.string().optional().describe(
        "Optional search term to filter skills by name or description"
      )
    },
    listSkills,
    createToolMetadata({
      examples: [
        {
          input: {},
          output: JSON.stringify({
            skills: [
              {
                name: "software-engineer",
                description: "Base software engineering best practices",
                parameters: []
              },
              {
                name: "typescript",
                description: "TypeScript coding standards and practices",
                parameters: []
              }
            ]
          }, null, 2),
          description: "List all available skills"
        },
        {
          input: { filter: "typescript" },
          output: JSON.stringify({
            skills: [
              {
                name: "typescript",
                description: "TypeScript coding standards and practices",
                parameters: []
              }
            ]
          }, null, 2),
          description: "Find skills related to TypeScript"
        }
      ],
      returnSchema: z.object({
        skills: z.array(z.object({
          name: z.string(),
          description: z.string(),
          parameters: z.array(z.object({
            name: z.string(),
            description: z.string(),
            required: z.boolean().optional()
          })).optional()
        }))
      }),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30 // 30 requests per minute
      }
    })
  );

  // Register the atlas_skill_invoke tool
  registerTool(
    server,
    "atlas_skill_invoke",
    "Executes specific skills (individually or combined)",
    {
      skills: z.array(z.string()).min(1).describe(
        "Array of skill names to invoke. Can use dot notation for combining skills (e.g., 'software-engineer.typescript.git')"
      ),
      parameters: z.record(z.any()).optional().describe(
        "Optional parameters to pass to the skills"
      )
    },
    invokeSkills,
    createToolMetadata({
      examples: [
        {
          input: {
            skills: ["git"],
            parameters: {
              username: "johndoe"
            }
          },
          output: "# Git Best Practices\n\n## Configuration\n- Set your username: `git config --global user.name \"johndoe\"`\n...",
          description: "Invoke a single skill with parameters"
        },
        {
          input: {
            skills: ["software-engineer.typescript.git"]
          },
          output: "# Software Engineering Fundamentals\n\n...\n\n# TypeScript Best Practices\n\n...\n\n# Git Best Practices\n\n...",
          description: "Combine multiple skills using dot notation"
        }
      ],
      returnSchema: z.string(),
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 15 // 15 requests per minute
      }
    })
  );
};