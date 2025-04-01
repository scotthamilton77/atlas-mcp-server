import { nanoid } from "nanoid";
import { KnowledgeService } from "../../../services/neo4j/knowledgeService.js";
import { ProjectService } from "../../../services/neo4j/projectService.js";
import { BaseErrorCode, McpError } from "../../../types/errors.js";
import { logger } from "../../../utils/logger.js";
import { sanitizeInput } from "../../../utils/security.js";
import {
  AtlasDeepResearchInput,
  DeepResearchResult,
  DeepResearchSubTopicNodeResult
} from "./types.js";

/**
 * Generates a unique ID suitable for knowledge nodes using nanoid.
 * Includes a prefix for better identification (e.g., 'plan', 'sub').
 *
 * @param prefix - The prefix to use for the ID (defaults to 'knw').
 * @returns A unique ID string (e.g., 'plan_aBcDeFgHiJkL').
 */
function generateKnowledgeId(prefix: string = "knw"): string {
  return `${prefix}_${nanoid(12)}`; // Using 12 characters for increased uniqueness
}

/**
 * Core implementation logic for the `atlas_deep_research` tool.
 * This function orchestrates the creation of a hierarchical knowledge structure
 * in Neo4j to represent a research plan based on the provided input.
 * It creates a root node for the overall plan and child nodes for each sub-topic.
 *
 * @param input - The validated input object conforming to `AtlasDeepResearchInput`.
 * @returns A promise resolving to a `DeepResearchResult` object containing details
 *          about the created nodes and the operation's success status.
 * @throws {McpError} If the project ID is invalid, or if any database operation fails.
 */
export async function deepResearch(
  input: AtlasDeepResearchInput
): Promise<DeepResearchResult> {
  logger.info(
    `Initiating deep research plan creation for project ID: ${input.projectId}, Topic: "${input.researchTopic}"`
  );

  try {
    // 1. Validate Project Existence
    // Ensure the specified project exists before proceeding.
    const project = await ProjectService.getProjectById(input.projectId);
    if (!project) {
      throw new McpError(
        BaseErrorCode.NOT_FOUND,
        `Project with ID "${input.projectId}" not found. Cannot create research plan.`
      );
    }
    logger.debug(`Project validation successful for ID: ${input.projectId}.`);

    // 2. Prepare Root Research Plan Node Data
    const planNodeId = input.planNodeId || generateKnowledgeId("plan");
    const rootTextParts: string[] = [
      `Research Plan: ${sanitizeInput.string(input.researchTopic)}`,
      `Goal: ${sanitizeInput.string(input.researchGoal)}`,
    ];
    if (input.scopeDefinition) {
      rootTextParts.push(`Scope: ${sanitizeInput.string(input.scopeDefinition)}`);
    }
    const rootText = rootTextParts.join("\n\n"); // Combine parts into the main text content

    // Define tags for the root node, including status and topic identification
    const rootTags = [
      "research-plan",
      "research-root",
      "status:active", // Initialize the plan as active
      `topic:${sanitizeInput.string(input.researchTopic)
        .toLowerCase()
        .replace(/\s+/g, "-") // Convert topic to a URL-friendly tag format
        .slice(0, 50)}`, // Limit tag length
      ...(input.initialTags || []), // Include any user-provided initial tags
    ];

    // 3. Create Root Research Plan Node in Neo4j
    logger.debug(`Attempting to create root plan node with ID: ${planNodeId}`);
    await KnowledgeService.addKnowledge({
      id: planNodeId,
      projectId: input.projectId,
      text: rootText,
      domain: input.researchDomain || "research", // Use provided domain or default to 'research'
      tags: rootTags,
      citations: [], // Root plan node typically starts with no citations
    });
    logger.info(`Root research plan node ${planNodeId} created successfully.`);

    // 4. Create Knowledge Nodes for Each Sub-Topic
    const createdSubTopicNodes: DeepResearchSubTopicNodeResult[] = [];
    logger.debug(`Processing ${input.subTopics.length} sub-topics to create knowledge nodes.`);

    for (const subTopic of input.subTopics) {
      const subTopicNodeId = subTopic.nodeId || generateKnowledgeId("sub");
      // Sanitize search queries before joining
      const searchQueriesString = (subTopic.initialSearchQueries || [])
        .map(kw => sanitizeInput.string(kw))
        .join(", ");
      // Construct the text content for the sub-topic node
      const subTopicText = `Research Question: ${sanitizeInput.string(subTopic.question)}\n\nInitial Search Queries: ${searchQueriesString || "None provided"}`;

      // Define tags for the sub-topic node, linking it back to the parent plan
      const subTopicTags = [
        "research-subtopic",
        "status:pending", // Initialize sub-topics as pending
        `parent-plan:${planNodeId}`, // Tag to link back to the root plan node
        ...(subTopic.initialSearchQueries?.map(
          (kw: string) =>
            `search-query:${sanitizeInput.string(kw) // Create tags for each search query
              .toLowerCase()
              .replace(/\s+/g, "-")
              .slice(0, 50)}`
        ) || []),
      ];

      logger.debug(`Attempting to create sub-topic node with ID: ${subTopicNodeId} for question: "${subTopic.question}"`);
      // Create the sub-topic knowledge node using the service
      await KnowledgeService.addKnowledge({
        id: subTopicNodeId,
        projectId: input.projectId, // Associate with the same project
        text: subTopicText,
        domain: input.researchDomain || "research", // Inherit domain from the root plan
        tags: subTopicTags,
        citations: [], // Sub-topics also start with no citations
      });

      // Record the details of the created sub-topic node
      createdSubTopicNodes.push({
        question: subTopic.question,
        nodeId: subTopicNodeId,
        initialSearchQueries: subTopic.initialSearchQueries || [],
      });
      logger.info(`Sub-topic node ${subTopicNodeId} created successfully.`);
    }

    // 5. Assemble and Return the Result
    const successMessage = `Successfully created deep research plan "${input.researchTopic}" with root node ${planNodeId} and ${createdSubTopicNodes.length} sub-topic nodes.`;
    logger.info(successMessage);

    return {
      success: true,
      message: successMessage,
      planNodeId: planNodeId,
      initialTags: input.initialTags || [], // Return the initial tags applied to the root
      subTopicNodes: createdSubTopicNodes, // Return details of created sub-topic nodes
    };

  } catch (error) {
    // Log the error with context
    logger.error("Error occurred during deep research plan creation", {
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      projectId: input.projectId,
      researchTopic: input.researchTopic,
    });

    // Re-throw McpError instances directly
    if (error instanceof McpError) {
      throw error;
    } else {
      // Wrap unexpected errors in a generic McpError
      throw new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        `Failed to create deep research plan: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
