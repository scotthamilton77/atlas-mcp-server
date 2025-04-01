import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types/errors.js";
import { McpToolResponse, ResponseFormat } from "../../../types/mcp.js";
import { createToolExample, createToolMetadata, registerTool } from "../../../types/tool.js";
import { logger } from "../../../utils/logger.js";
import { ToolContext } from "../../../utils/security.js"; // Assuming ToolContext might be used for permissions
import { deepResearch } from "./deepResearch.js";
import { formatDeepResearchResponse } from "./responseFormat.js";
import {
  AtlasDeepResearchInput,
  AtlasDeepResearchInputSchema,
  AtlasDeepResearchOutputSchema,
  AtlasDeepResearchSchemaShape,
} from "./types.js";

/**
 * Main handler function for the `atlas_deep_research` MCP tool.
 * This function orchestrates the tool's execution:
 * 1. Validates the incoming parameters against the `AtlasDeepResearchInputSchema`.
 * 2. Calls the core `deepResearch` function to perform the business logic.
 * 3. Formats the result into the appropriate `McpToolResponse` based on the requested `responseFormat`.
 * 4. Handles errors gracefully, logging them and returning appropriate `McpError` responses.
 *
 * @param params - The raw, unvalidated input parameters received from the MCP client.
 * @param context - Optional context object containing request-specific information (e.g., request ID).
 * @returns A promise resolving to an `McpToolResponse` object.
 * @throws {McpError} If input validation fails or an unhandled error occurs during execution.
 */
async function handler(
  params: unknown,
  context?: ToolContext
): Promise<McpToolResponse> {
  const requestId = context?.requestContext?.requestId;
  logger.debug("Received atlas_deep_research request", { params, requestId });

  // 1. Validate Input
  const validationResult = AtlasDeepResearchInputSchema.safeParse(params);
  if (!validationResult.success) {
    logger.error("Invalid input for atlas_deep_research", {
      errors: validationResult.error.errors,
      requestId,
    });
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      "Invalid input parameters for atlas_deep_research",
      validationResult.error.format() // Provides detailed validation errors
    );
  }
  const input: AtlasDeepResearchInput = validationResult.data;

  // Optional: Implement permission checks here if necessary
  // e.g., checkPermission(context, 'knowledge:create');

  try {
    // 2. Call Core Logic
    logger.info(`Calling deepResearch core logic for request ID: ${requestId}`);
    const result = await deepResearch(input);

    // 3. Format Response
    logger.debug(`Formatting atlas_deep_research response for request ID: ${requestId}`);
    if (input.responseFormat === ResponseFormat.JSON) {
      // Return raw JSON output if requested
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.success, // Reflect the success status in the MCP response
      };
    } else {
      // Use the dedicated formatter for 'formatted' output
      return formatDeepResearchResponse(result, input);
    }
  } catch (error) {
    logger.error("Error executing atlas_deep_research", {
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
    });
    // Re-throw errors that are already McpError instances
    if (error instanceof McpError) {
      throw error;
    }
    // Wrap unexpected errors in a standard internal error response, including requestId if available
    const errorMessage = `Atlas deep research tool execution failed (Request ID: ${requestId ?? 'N/A'}): ${
      error instanceof Error ? error.message : String(error)
    }`;
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      errorMessage
    );
  }
}

// Define Tool Examples
const examples = [
  createToolExample( // Example 1: Detailed PQC research with tasks
    {
      projectId: "proj_123abc",
      researchTopic: "Quantum-Resistant Encryption Algorithms",
      researchGoal:
        'Identify and summarize leading PQC algorithms, their pros/cons, and adoption timelines.',
      scopeDefinition:
        'Focus on NIST PQC finalists and winners. Exclude theoretical-only algorithms.',
      subTopics: [
        {
          question:
            'What are the main categories of post-quantum cryptography (PQC)?',
          initialSearchQueries: [
            'PQC categories',
            'lattice-based',
            'hash-based',
            'code-based',
            'multivariate',
          ],
          nodeId: 'client_sub_001', // Example client-provided ID
          priority: 'high', // Assign priority to the task
          initialStatus: 'todo',
        },
        {
          question: 'What are the NIST PQC standardization finalists/winners?',
          initialSearchQueries: [
            'NIST PQC',
            'CRYSTALS-Kyber',
            'CRYSTALS-Dilithium',
            'Falcon',
            'SPHINCS+',
          ],
          assignedTo: 'user_alice', // Assign task
        },
        {
          question:
            'What are the performance implications (speed, key size, signature size)?',
          initialSearchQueries: [
            'PQC performance',
            'Kyber performance',
            'Dilithium size',
          ],
          priority: 'medium',
        },
        {
          question:
            'What are the current challenges and timelines for PQC adoption?',
          initialSearchQueries: [
            'PQC adoption challenges',
            'migration strategy',
            'quantum timeline',
          ],
        },
      ],
      researchDomain: 'technical',
      initialTags: ['#cryptography', '#pqc'],
      planNodeId: 'client_plan_001', // Example client-provided ID
      createTasks: true, // Explicitly request task creation
      responseFormat: 'formatted',
    },
    // Expected formatted output (conceptual, actual output depends on formatter)
    `## Deep Research Plan Initiated\n**Topic:** Quantum-Resistant Encryption Algorithms\n**Goal:** Identify and summarize leading PQC algorithms...\n**Plan Node ID:** plan_...\n**Sub-Topics Created:** 4 (with Tasks)\n- **Question:** What are the main categories...?\n  - **Node ID:** \`sub_...\`\n  - **Task ID:** \`task_...\`\n  - **Task Priority:** high\n  - **Task Status:** todo\n  - **Initial Search Queries:** ...\n... (more sub-topics)`,
    'Initiate a detailed deep research plan on PQC algorithms, creating corresponding tasks with specific priorities/assignees, and requesting formatted output.'
  ), // Removed extra parenthesis here
  createToolExample( // Example 2: Market analysis without tasks
    {
      projectId: 'proj_456def',
      researchTopic: "Market Analysis for AI-Powered Code Review Tools",
      researchGoal: 'Identify key players, market size, and trends.',
      subTopics: [
        { question: 'Who are the main competitors?' },
        { question: 'What is the estimated market size and growth rate?' },
        { question: 'What are the common pricing models?' },
      ],
      createTasks: false, // Explicitly disable task creation
      responseFormat: 'json', // Requesting raw JSON output
    },
    // Expected JSON output (structure matches AtlasDeepResearchOutput)
    `{
      "success": true,
      "message": "Successfully created deep research plan \\"Market Analysis for AI-Powered Code Review Tools\\" with root node plan_... and 3 sub-topic nodes.",
      "planNodeId": "plan_...",
      "initialTags": [],
      "subTopicNodes": [
        { "question": "Who are the main competitors?", "nodeId": "sub_...", "initialSearchQueries": [] },
        { "question": "What is the estimated market size and growth rate?", "nodeId": "sub_...", "initialSearchQueries": [] },
        { "question": "What are the common pricing models?", "nodeId": "sub_...", "initialSearchQueries": [] }
      ],
      "tasksCreated": false
    }`,
    'Initiate a market analysis research plan, explicitly disabling task creation, and requesting the raw JSON response.'
  )
];

/**
 * Registers the `atlas_deep_research` tool, including its metadata, schema,
 * handler function, and examples, with the provided MCP server instance.
 *
 * @param server - The `McpServer` instance to register the tool with.
 */
export function registerAtlasDeepResearchTool(server: McpServer): void {
  registerTool(
    server,
    'atlas_deep_research', // Tool name
    'Initiates a structured deep research process by creating a hierarchical plan within the Atlas knowledge base, optionally creating linked tasks for sub-topics. Facilitates a smarter research flow by emphasizing initial gathering of specific, real-world details (e.g., proper nouns, specific names) relevant to the topic, and performing smart recursive searches to pinpoint necessary facts. Use this tool to kickstart deep research, define a knowledge graph of queries and topics, and ensure Atlas knowledge is continuously updated with precise, factual information.', // Updated Tool description
    AtlasDeepResearchSchemaShape, // Input schema shape (used to generate full schema)
    handler, // The handler function defined above
    createToolMetadata({
      examples: examples, // Tool usage examples
      // Required permissions might need adjustment if task creation is always enabled or based on input
      requiredPermission: 'knowledge:create task:create', // Combined into single string
      returnSchema: AtlasDeepResearchOutputSchema, // Schema for the structured output
      // Optional: Define rate limits if needed
      // rateLimit: { windowMs: 60 * 1000, maxRequests: 10 }
    })
  );
  logger.info("Registered atlas_deep_research tool.");
}
