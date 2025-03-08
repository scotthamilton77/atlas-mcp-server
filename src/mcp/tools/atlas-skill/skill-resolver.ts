import { logger } from "../../../utils/logger.js";
import { Skill, SkillContext } from "./types.js";
import { McpError, SkillErrorCode } from "../../../types/errors.js";
import { getSkillByName, getAllSkills } from "./skill-manager.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Resolve a list of skill names with their dependencies
 * Handles both individual skills and dot notation (e.g., "software-engineer.typescript.git")
 */
export const resolveSkills = async (
  skillNames: string[], 
  parameters: Record<string, any> = {}
): Promise<SkillContext> => {
  try {
    logger.info(`Resolving skills: ${skillNames.join(', ')}`);
    
    const resolvedSkills: Skill[] = [];
    const visited = new Set<string>();
    
    // First, handle dotted notation (e.g., "software-engineer.typescript.git")
    const expandedSkillNames = skillNames.flatMap(name => 
      name.includes('.') ? name.split('.') : [name]
    );
    
    logger.debug(`Expanded skill names: ${expandedSkillNames.join(', ')}`);
    
    // Then resolve each skill with its dependencies
    for (const name of expandedSkillNames) {
      await resolveSkillWithDependencies(name, resolvedSkills, visited);
    }
    
    // Create the context for skill rendering
    const context: SkillContext = {
      environmentVariables: loadEnvironmentVariables(),
      parameters,
      resolvedSkills
    };
    
    logger.info(`Successfully resolved ${resolvedSkills.length} skills (including dependencies)`);
    
    return context;
  } catch (error) {
    logger.error("Error resolving skills", { error, skillNames });
    
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(
      SkillErrorCode.DEPENDENCY_NOT_FOUND,
      `Error resolving skills: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Recursively resolve a skill and its dependencies
 */
export const resolveSkillWithDependencies = async (
  skillName: string, 
  resolved: Skill[], 
  visited: Set<string>,
  path: string[] = []
): Promise<void> => {
  // Detect circular dependencies
  if (path.includes(skillName)) {
    const cycle = [...path, skillName].join(' -> ');
    throw new McpError(
      SkillErrorCode.CIRCULAR_DEPENDENCY,
      `Circular dependency detected: ${cycle}`
    );
  }
  
  // Skip if already visited
  if (visited.has(skillName)) return;
  
  // Get the skill
  const skill = getSkillByName(skillName);
  if (!skill) {
    throw new McpError(
      SkillErrorCode.SKILL_NOT_FOUND,
      `Skill not found: ${skillName}`
    );
  }
  
  // Mark as visited
  visited.add(skillName);
  
  // First resolve dependencies
  for (const dep of skill.dependencies) {
    await resolveSkillWithDependencies(dep, resolved, visited, [...path, skillName]);
  }
  
  // Then add this skill
  resolved.push(skill);
  
  logger.debug(`Resolved skill: ${skillName} (${skill.dependencies.length} dependencies)`);
};

/**
 * Combine content from multiple skills into a single output
 */
export const combineSkills = async (context: SkillContext): Promise<string> => {
  try {
    const contents: string[] = [];
    
    // Get content from each skill
    for (const skill of context.resolvedSkills) {
      try {
        // Generate content using the skill's content function
        const content = await skill.content(context);
        contents.push(content);
      } catch (error) {
        logger.error(`Error generating content for skill ${skill.name}`, { error });
        throw new McpError(
          SkillErrorCode.SKILL_EXECUTION_ERROR,
          `Error generating content for skill ${skill.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
    
    // Join all contents with double line breaks
    return contents.join('\n\n');
  } catch (error) {
    logger.error("Error combining skills", { error });
    
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(
      SkillErrorCode.SKILL_EXECUTION_ERROR,
      `Error combining skills: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Load environment variables relevant to skills
 */
export const loadEnvironmentVariables = (): Record<string, string> => {
  const envVars: Record<string, string> = {};
  
  // Add relevant environment variables
  for (const [key, value] of Object.entries(process.env)) {
    if (value && (
      key.startsWith('SKILL_') || 
      key.startsWith('GIT_') || 
      key.startsWith('CODING_') ||
      key.startsWith('ATLAS_')
    )) {
      envVars[key] = value;
    }
  }
  
  return envVars;
};