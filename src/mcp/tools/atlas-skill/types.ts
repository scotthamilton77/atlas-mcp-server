import { z } from "zod";
import { SkillErrorCode } from "../../../types/errors.js";

/**
 * Skill parameter definition
 */
export interface SkillParameter {
  name: string;
  description: string;
  required?: boolean;
  type?: string;
}

/**
 * Skill context provided to skill content functions
 */
export interface SkillContext {
  environmentVariables: Record<string, string>;
  parameters: Record<string, any>;
  resolvedSkills: Skill[];
}

/**
 * Core skill definition interface
 */
export interface Skill {
  name: string;              // Identifier (e.g., "git")
  description: string;       // Human-readable description
  dependencies: string[];    // Other skills this depends on
  parameters: SkillParameter[]; // Optional parameters
  content: (context: SkillContext) => string | Promise<string>;
}

/**
 * Skill list response schema
 */
export const SkillListResponseSchema = z.object({
  skills: z.array(z.object({
    name: z.string().describe("Skill identifier"),
    description: z.string().describe("Human-readable description"),
    parameters: z.array(z.object({
      name: z.string().describe("Parameter name"),
      description: z.string().describe("Parameter description"),
      required: z.boolean().optional().describe("Whether parameter is required"),
      type: z.string().optional().describe("Parameter type hint")
    })).optional().describe("Optional parameters this skill accepts")
  }))
});

export type SkillListResponse = z.infer<typeof SkillListResponseSchema>;

/**
 * Schema for skill list tool input
 */
export const SkillListSchema = z.object({
  filter: z.string().optional().describe("Optional search term to filter skills")
});

export type SkillListInput = z.infer<typeof SkillListSchema>;

/**
 * Schema for skill invoke tool input
 */
export const SkillInvokeSchema = z.object({
  skills: z.array(z.string()).min(1).describe(
    "Array of skill names to invoke"
  ),
  parameters: z.record(z.any()).optional().describe(
    "Optional parameters to pass to the skills"
  )
});

export type SkillInvokeInput = z.infer<typeof SkillInvokeSchema>;