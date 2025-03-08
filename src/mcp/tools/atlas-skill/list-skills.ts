import { logger } from "../../../utils/logger.js";
import { SkillListInput, SkillListResponse } from "./types.js";
import { McpError, BaseErrorCode } from "../../../types/errors.js";
import { createToolResponse } from "../../../types/mcp.js";
import { ToolContext } from "../../../utils/security.js";
import { getAllSkills, filterSkills, initializeSkills } from "./skill-manager.js";

let initialized = false;

/**
 * MCP tool handler for listing available skills
 */
export const listSkills = async (
  input: unknown,
  context: ToolContext
) => {
  try {
    // Ensure skills are initialized
    if (!initialized) {
      await initializeSkills();
      initialized = true;
    }
    
    // Parse input
    const validatedInput = input as SkillListInput;
    const filter = validatedInput?.filter;
    
    logger.info("Listing skills", { 
      filter,
      requestId: context.requestContext?.requestId 
    });
    
    // Get all skills
    const allSkills = getAllSkills();
    
    // Apply filtering if provided
    const filteredSkills = filter 
      ? filterSkills(allSkills, filter)
      : allSkills;
    
    logger.info(`Found ${filteredSkills.length} skills matching filter criteria`, {
      totalSkills: allSkills.length,
      matchedSkills: filteredSkills.length,
      filter: filter || 'none',
      requestId: context.requestContext?.requestId
    });
    
    // Format response
    const response: SkillListResponse = {
      skills: filteredSkills.map(skill => ({
        name: skill.name,
        description: skill.description,
        parameters: skill.parameters
      }))
    };
    
    return createToolResponse(JSON.stringify(response, null, 2));
  } catch (error) {
    // Handle errors
    logger.error("Error listing skills", { 
      error, 
      requestId: context.requestContext?.requestId 
    });
    
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error listing skills: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};