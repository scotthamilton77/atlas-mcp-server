import { KnowledgeService } from "../../../services/neo4j/knowledgeService.js";
import { ProjectService } from "../../../services/neo4j/projectService.js";
import { BaseErrorCode, McpError, ProjectErrorCode } from "../../../types/errors.js";
import { ResponseFormat, createToolResponse } from "../../../types/mcp.js";
import { logger, requestContextService } from "../../../utils/index.js"; // Import requestContextService
import { ToolContext } from "../../../types/tool.js";
import { AtlasKnowledgeAddInput, AtlasKnowledgeAddSchema } from "./types.js";
import { formatKnowledgeAddResponse } from "./responseFormat.js";

export const atlasAddKnowledge = async (
  input: unknown,
  context: ToolContext
) => {
  let validatedInput: AtlasKnowledgeAddInput | undefined;
  const reqContext = context.requestContext ?? requestContextService.createRequestContext({ toolName: 'atlasAddKnowledge' });
  
  try {
    // Parse and validate input against schema
    validatedInput = AtlasKnowledgeAddSchema.parse(input);
    
    // Handle single vs bulk knowledge addition based on mode
    if (validatedInput.mode === 'bulk') {
      // Execute bulk addition operation
      logger.info("Adding multiple knowledge items", {
        ...reqContext,
        count: validatedInput.knowledge.length
      });

      const results = {
        success: true,
        message: `Successfully added ${validatedInput.knowledge.length} knowledge items`,
        created: [] as any[],
        errors: [] as any[]
      };

      // Process each knowledge item sequentially
      for (let i = 0; i < validatedInput.knowledge.length; i++) {
        const knowledgeData = validatedInput.knowledge[i];
        try {
          const createdKnowledge = await KnowledgeService.addKnowledge({
            projectId: knowledgeData.projectId,
            text: knowledgeData.text,
            tags: knowledgeData.tags || [],
            domain: knowledgeData.domain,
            citations: knowledgeData.citations || [],
            id: knowledgeData.id // Use client-provided ID if available
          });
          
          results.created.push(createdKnowledge);
        } catch (error) {
          results.success = false;
          results.errors.push({
            index: i,
            knowledge: knowledgeData,
            error: {
              code: error instanceof McpError ? error.code : BaseErrorCode.INTERNAL_ERROR,
              message: error instanceof Error ? error.message : 'Unknown error',
              details: error instanceof McpError ? error.details : undefined
            }
          });
        }
      }
      
      if (results.errors.length > 0) {
        results.message = `Added ${results.created.length} of ${validatedInput.knowledge.length} knowledge items with ${results.errors.length} errors`;
      }
      
      logger.info("Bulk knowledge addition completed", {
        ...reqContext,
        successCount: results.created.length,
        errorCount: results.errors.length,
        knowledgeIds: results.created.map(k => k.id)
      });

      // Conditionally format response
      if (validatedInput.responseFormat === ResponseFormat.JSON) {
        return createToolResponse(JSON.stringify(results, null, 2));
      } else {
        return formatKnowledgeAddResponse(results);
      }
    } else {
      // Process single knowledge item addition
      const { mode, id, projectId, text, tags, domain, citations } = validatedInput;
      
      logger.info("Adding new knowledge item", {
        ...reqContext,
        projectId, 
        domain
      });

      const knowledge = await KnowledgeService.addKnowledge({
        id, // Use client-provided ID if available
        projectId,
        text,
        tags: tags || [],
        domain,
        citations: citations || []
      });
      
      logger.info("Knowledge item added successfully", {
        ...reqContext,
        knowledgeId: knowledge.id,
        projectId
      });

      // Conditionally format response
      if (validatedInput.responseFormat === ResponseFormat.JSON) {
        return createToolResponse(JSON.stringify(knowledge, null, 2));
      } else {
        return formatKnowledgeAddResponse(knowledge);
      }
    }
  } catch (error) {
    // Handle specific error cases
    if (error instanceof McpError) {
      throw error;
    }

    logger.error("Failed to add knowledge item(s)", error as Error, {
      ...reqContext,
      inputReceived: validatedInput ?? input
    });

    // Handle project not found error specifically
    if (error instanceof Error && error.message.includes('Project with ID')) {
      const projectId = validatedInput?.mode === 'single' 
        ? validatedInput?.projectId 
        : validatedInput?.knowledge?.[0]?.projectId;
        
      throw new McpError(
        ProjectErrorCode.PROJECT_NOT_FOUND,
        `Project not found: ${projectId}`,
        { projectId }
      );
    }

    // Convert other errors to McpError
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Error adding knowledge item(s): ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};
