import { logger } from "../../../utils/logger.js";
import { SkillInvokeInput } from "./types.js";
import { McpError, BaseErrorCode, SkillErrorCode } from "../../../types/errors.js";
import { createToolResponse } from "../../../types/mcp.js";
import { ToolContext } from "../../../utils/security.js";
import { initializeSkills } from "./skill-manager.js";
import { resolveSkills, combineSkills } from "./skill-resolver.js";

let initialized = false;

/**
 * MCP tool handler for invoking skills
 */
export const invokeSkills = async (
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
    const validatedInput = input as SkillInvokeInput;
    
    if (!validatedInput.skills || validatedInput.skills.length === 0) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        "At least one skill must be specified",
        { providedSkills: validatedInput.skills }
      );
    }
    
    logger.info("Invoking skills", { 
      skills: validatedInput.skills.join(', '),
      hasParameters: !!validatedInput.parameters,
      requestId: context.requestContext?.requestId 
    });
    
    // Resolve skills with dependencies
    const skillContext = await resolveSkills(
      validatedInput.skills, 
      validatedInput.parameters || {}
    );
    
    logger.info(`Resolved ${skillContext.resolvedSkills.length} skills (including dependencies)`, {
      requestedSkills: validatedInput.skills.length,
      resolvedSkills: skillContext.resolvedSkills.length,
      skillNames: skillContext.resolvedSkills.map(s => s.name).join(', '),
      requestId: context.requestContext?.requestId 
    });
    
    // Combine skill content
    const combinedContent = await combineSkills(skillContext);
    
    logger.info("Successfully combined skill content", {
      contentLength: combinedContent.length,
      requestId: context.requestContext?.requestId 
    });
    
    return createToolResponse(combinedContent);
  } catch (error) {
    // Handle errors
    logger.error("Error invoking skills", { 
      error, 
      requestId: context.requestContext?.requestId 
    });
    
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error invoking skills: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};