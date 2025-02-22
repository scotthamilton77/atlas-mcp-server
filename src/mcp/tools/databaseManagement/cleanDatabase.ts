import { getSession, initializeSchema, dropConstraints } from "../../../neo4j/driver.js";
import { logger } from "../../../utils/logger.js";
import { cleanDatabaseInputSchema } from "./types.js";
import { ToolContext } from "../../../utils/security.js";
import { createToolResponse } from "../../../types/mcp.js";
import { McpError, BaseErrorCode } from "../../../types/errors.js";

export const cleanDatabase = async (
  input: unknown,
  context: ToolContext
) => {
  const session = getSession();
  try {
    // Validate input (empty object in this case)
    cleanDatabaseInputSchema.parse(input);
    
    logger.info("Starting database cleanup", {
      requestId: context.requestContext?.requestId
    });

    // First get counts for reporting
    const countResult = await session.run(`
      MATCH (n)
      OPTIONAL MATCH (n)-[r]->()
      RETURN count(DISTINCT n) as nodes, count(DISTINCT r) as relationships
    `);
    
    const nodesCount = countResult.records[0].get("nodes").toNumber();
    const relationshipsCount = countResult.records[0].get("relationships").toNumber();

    // Drop all constraints first
    logger.info("Dropping existing constraints");
    await dropConstraints();

    // Delete remaining nodes and relationships
    logger.info("Deleting all nodes and relationships");
    await session.run(`
      MATCH (n)
      DETACH DELETE n
    `);

    // Verify deletion was successful
    const verifyResult = await session.run(`
      MATCH (n)
      RETURN count(n) as remaining
    `);
    
    const remainingNodes = verifyResult.records[0].get("remaining").toNumber();
    if (remainingNodes > 0) {
      throw new Error(`Failed to delete all nodes. ${remainingNodes} nodes remaining.`);
    }

    // Double check no relationships remain
    const relationshipCheck = await session.run(`
      MATCH ()-[r]->()
      RETURN count(r) as remaining
    `);
    const remainingRelationships = relationshipCheck.records[0].get("remaining").toNumber();

    // Re-initialize schema
    logger.info("Reinitializing schema");
    await initializeSchema();

    logger.info("Database cleaned successfully", {
      nodesDeleted: nodesCount,
      relationshipsDeleted: relationshipsCount,
      requestId: context.requestContext?.requestId
    });

    const result = {
      success: true,
      message: "Database cleaned and reinitialized successfully",
      details: {
        nodesDeleted: nodesCount,
        relationshipsDeleted: relationshipsCount, 
        remainingNodes, remainingRelationships
      }
    };

    return createToolResponse(JSON.stringify(result, null, 2));
  } catch (error) {
    logger.error("Failed to clean database", { 
      error,
      requestId: context.requestContext?.requestId
    });

    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to clean database: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    await session.close();
  }
};