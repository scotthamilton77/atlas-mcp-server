import { z } from "zod";
import { createKnowledgeDomainEnum, createResponseFormatEnum, ResponseFormat } from "../../../types/mcp.js";

/**
 * Zod schema defining the structure for a single sub-topic provided as input
 * to the deep research tool.
 */
export const DeepResearchSubTopicSchema = z.object({
  /** A specific sub-topic or question to investigate. */
  question: z.string().min(1).describe("A specific sub-topic or question to investigate."),
  /** Initial search queries or keywords relevant to this sub-topic. */
  initialSearchQueries: z.array(z.string()).optional().describe("Initial search queries or keywords relevant to this sub-topic."),
  /** Optional client-provided ID for the knowledge node representing this sub-topic. */
  nodeId: z.string().optional().describe("Optional client-provided ID for this sub-topic knowledge node.")
});

/**
 * TypeScript type inferred from `DeepResearchSubTopicSchema`. Represents a single sub-topic input.
 */
export type DeepResearchSubTopic = z.infer<typeof DeepResearchSubTopicSchema>;

/**
 * Defines the shape of the input parameters for the `atlas_deep_research` tool.
 * This structure is used to build the final Zod schema.
 */
export const AtlasDeepResearchSchemaShape = {
  /** ID of the project this research effort belongs to. */
  projectId: z.string().describe(
    "ID of the project this research effort belongs to (required)."
  ),
  researchTopic: z.string().min(1).describe(
    "The primary topic or question for the deep research (required)."
  ),
  /** The specific objective or desired outcome of this research. */
  researchGoal: z.string().min(1).describe(
    "The specific objective or desired outcome of this research (required)."
  ),
  /** Optional definition of what is in and out of scope for this research. */
  scopeDefinition: z.string().optional().describe(
    "Optional definition of what is in and out of scope for this research."
  ),
  /** An array representing the LLM's breakdown of the main topic into manageable sub-questions or areas. */
  subTopics: z.array(DeepResearchSubTopicSchema)
    .min(1).describe(
      "An array representing the LLM's breakdown of the main topic into manageable sub-questions or areas."
    ),
  /** Optional primary domain for the overall research topic (e.g., 'technical', 'business'). Helps categorize the plan. */
  researchDomain: createKnowledgeDomainEnum().or(z.string()).optional().describe(
    "Optional primary domain for the overall research topic (e.g., 'technical', 'business'). Helps categorize the plan."
  ),
  /** Optional initial tags to apply to the main research plan node. */
  initialTags: z.array(z.string()).optional().describe(
    "Optional initial tags to apply to the main research plan node."
  ),
  /** Optional client-provided ID for the main research plan knowledge node. */
  planNodeId: z.string().optional().describe("Optional client-provided ID for the main research plan knowledge node."),
  /** Desired response format: 'formatted' (default string) or 'json' (raw object). */
  responseFormat: createResponseFormatEnum().optional().default(ResponseFormat.FORMATTED).describe(
    "Desired response format: 'formatted' (default string) or 'json' (raw object)."
  ),
} as const;

/**
 * The complete Zod schema for validating the input arguments of the `atlas_deep_research` tool.
 */
export const AtlasDeepResearchInputSchema = z.object(AtlasDeepResearchSchemaShape);

/**
 * TypeScript type inferred from `AtlasDeepResearchInputSchema`. Represents the validated input object.
 */
export type AtlasDeepResearchInput = z.infer<typeof AtlasDeepResearchInputSchema>;

/**
 * Zod schema defining the structure for representing a created sub-topic knowledge node
 * in the tool's output.
 */
export const DeepResearchSubTopicNodeResultSchema = z.object({
  /** The original sub-topic question. */
  question: z.string().describe("The sub-topic question."),
  /** ID of the created knowledge node for this sub-topic. */
  nodeId: z.string().describe("ID of the created knowledge node for this sub-topic."),
  /** Initial search queries provided for this sub-topic, if any. */
  initialSearchQueries: z.array(z.string()).optional().describe("Initial search queries provided for this sub-topic.")
});

/**
 * TypeScript type inferred from `DeepResearchSubTopicNodeResultSchema`. Represents a single sub-topic node result.
 */
export type DeepResearchSubTopicNodeResult = z.infer<typeof DeepResearchSubTopicNodeResultSchema>;

/**
 * Interface defining the expected output structure returned by the core `deepResearch` function.
 */
export interface DeepResearchResult {
  /** Indicates whether the overall operation was successful. */
  success: boolean;
  /** A summary message describing the outcome of the operation. */
  message: string;
  /** The ID of the root knowledge node created for the research plan. */
  planNodeId: string;
  /** The initial tags applied to the root plan node, if any. */
  initialTags?: string[];
  /** An array containing details about each created sub-topic knowledge node. */
  subTopicNodes: DeepResearchSubTopicNodeResult[];
}

/**
 * Zod schema defining the structure of the output returned by the `atlas_deep_research` tool handler.
 * This is used for potential validation or type checking of the final tool response content.
 */
export const AtlasDeepResearchOutputSchema = z.object({
  /** Indicates whether the operation was successful. */
  success: z.boolean().describe("Operation success status"),
  /** A summary message describing the result. */
  message: z.string().describe("Result message"),
  /** ID of the created root research plan knowledge node. */
  planNodeId: z.string().describe("ID of the created root research plan knowledge node."),
  /** Tags applied to the root plan node, if any. */
  initialTags: z.array(z.string()).optional().describe("Tags applied to the root plan node."),
  /** Details of the created sub-topic knowledge nodes. */
  subTopicNodes: z.array(DeepResearchSubTopicNodeResultSchema)
    .describe("Details of the created sub-topic knowledge nodes.")
});

/**
 * TypeScript type inferred from `AtlasDeepResearchOutputSchema`. Represents the structured output of the tool.
 */
export type AtlasDeepResearchOutput = z.infer<typeof AtlasDeepResearchOutputSchema>;
