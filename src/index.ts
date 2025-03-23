#!/usr/bin/env node
import { createMcpServer } from "./mcp/server.js";
import { logger } from "./utils/logger.js";
import { neo4jDriver } from "./services/neo4j/driver.js";
import { closeNeo4jConnection } from "./services/neo4j/index.js";
import { config } from "./config/index.js";

let server: Awaited<ReturnType<typeof createMcpServer>> | undefined;
// Since backupService.ts doesn't exist, we'll create a simple mock for now
const backupService = {
  start: async () => logger.info('Backup service start (mock)'),
  stop: () => logger.info('Backup service stop (mock)')
};

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // Stop the backup service
    logger.info("Stopping database backup service...");
    backupService.stop();
    logger.info("Database backup service stopped.");

    if (server) {
      logger.info("Closing MCP server...");
      await server.close();
      logger.info("MCP server closed successfully.");
    }

    logger.info("Closing Neo4j driver...");
    await closeNeo4jConnection();
    logger.info("Neo4j driver closed successfully.");

    logger.info("Graceful shutdown completed.");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", { error });
    process.exit(1);
  }
};

const start = async () => {
  try {
    logger.info("Starting ATLAS MCP Server...");
    
    // Create and store server instance
    server = await createMcpServer();
    
    // Start the backup service
    logger.info("Starting database backup service...");
    await backupService.start();
    
    logger.info("ATLAS MCP Server is running and awaiting messages.");

    // Handle process signals for graceful shutdown
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception:", { error });
      shutdown("UNCAUGHT_EXCEPTION");
    });

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled rejection:", { reason });
      shutdown("UNHANDLED_REJECTION");
    });

  } catch (error) {
    logger.error("Failed to start ATLAS MCP Server:", { error });
    process.exit(1);
  }
};

start();
