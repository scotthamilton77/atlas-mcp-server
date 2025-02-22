import { z } from "zod";
import { PromptResponse } from '../../../types/mcp.js';

export const ProjectSummarySchemaShape = {
  projectId: z.string()
} as const;

export const ProjectSummarySchema = z.object(ProjectSummarySchemaShape);

export type ProjectSummaryInput = z.infer<typeof ProjectSummarySchema>;

export type ProjectSummaryResponse = PromptResponse;