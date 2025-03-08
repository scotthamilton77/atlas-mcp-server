import { logger } from "../../../utils/logger.js";
import { Skill } from "./types.js";
import { McpError, SkillErrorCode } from "../../../types/errors.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Get directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Map to store registered skills
const skillRegistry = new Map<string, Skill>();

/**
 * Register a skill with the skill manager
 */
export const registerSkill = (skill: Skill): void => {
  if (skillRegistry.has(skill.name)) {
    logger.warn(`Skill '${skill.name}' is already registered. Overwriting.`);
  }
  
  skillRegistry.set(skill.name, skill);
  logger.info(`Registered skill: ${skill.name}`);
};

/**
 * Get a skill by its name
 */
export const getSkillByName = (name: string): Skill | undefined => {
  return skillRegistry.get(name);
};

/**
 * Get all registered skills
 */
export const getAllSkills = (): Skill[] => {
  return Array.from(skillRegistry.values());
};

/**
 * Fuzzy match text against a pattern
 */
export const fuzzyMatch = (text: string, pattern: string): boolean => {
  if (!text || !pattern) return false;
  
  const lowerText = text.toLowerCase();
  const lowerPattern = pattern.toLowerCase();
  
  // Simple contains matching
  if (lowerText.includes(lowerPattern)) {
    return true;
  }
  
  // More advanced fuzzy matching for partial words
  let j = 0;
  for (let i = 0; i < lowerText.length && j < lowerPattern.length; i++) {
    if (lowerText[i] === lowerPattern[j]) {
      j++;
    }
  }
  
  return j === lowerPattern.length;
};

/**
 * Filter skills by a search term using fuzzy matching
 */
export const filterSkills = (skills: Skill[], filter?: string): Skill[] => {
  if (!filter) return skills;
  
  return skills.filter(skill => 
    fuzzyMatch(skill.name, filter) || 
    fuzzyMatch(skill.description, filter)
  );
};

/**
 * Initialize skills by loading them from the skills directory
 */
export const initializeSkills = async (): Promise<void> => {
  try {
    logger.info("Initializing skill system");
    
    // Import base skills
    await loadSkillsFromDirectory(path.join(__dirname, '../skills/base'));
    
    // Import language skills
    await loadSkillsFromDirectory(path.join(__dirname, '../skills/languages'));
    
    // Import tool skills
    await loadSkillsFromDirectory(path.join(__dirname, '../skills/tools'));
    
    logger.info(`Skill initialization complete. ${skillRegistry.size} skills loaded.`);
  } catch (error) {
    logger.error("Error initializing skills", { error });
    throw error;
  }
};

/**
 * Load skills from a directory
 */
const loadSkillsFromDirectory = async (directory: string): Promise<void> => {
  try {
    logger.debug(`Loading skills from directory: ${directory}`);
    
    // Get all TypeScript files in the directory
    const files = await fs.readdir(directory).catch(() => []);
    
    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        try {
          logger.debug(`Loading skill file: ${file}`);
          
          // Import the skill module
          const filePath = path.join(directory, file);
          const skillModule = await import(filePath);
          
          // Register exported skills
          for (const exportKey of Object.keys(skillModule)) {
            const exportedValue = skillModule[exportKey];
            
            if (
              exportedValue && 
              typeof exportedValue === 'object' && 
              'name' in exportedValue && 
              'description' in exportedValue && 
              'content' in exportedValue && 
              typeof exportedValue.content === 'function'
            ) {
              registerSkill(exportedValue as Skill);
            }
          }
        } catch (error) {
          logger.error(`Error loading skill from file ${file}`, { error });
        }
      }
    }
  } catch (error) {
    logger.error(`Error loading skills from directory: ${directory}`, { error });
  }
};