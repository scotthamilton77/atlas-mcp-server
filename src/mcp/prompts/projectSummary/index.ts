import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProjectSummarySchemaShape } from './types.js';
import { generateProjectSummary } from './projectSummary.js';

export const registerProjectSummaryPrompt = (server: McpServer) => {
  server.prompt(
    "project.summary",
    "Generate a project summary",
    ProjectSummarySchemaShape,
    generateProjectSummary
  );
};