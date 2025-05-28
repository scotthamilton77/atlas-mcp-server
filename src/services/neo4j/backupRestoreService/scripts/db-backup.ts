#!/usr/bin/env node
import { exportDatabase } from "../../index.js"; // Adjusted path
import { closeNeo4jConnection } from "../../index.js"; // Adjusted path
import { logger, requestContextService } from "../../../../utils/index.js"; // Adjusted path
import { config } from "../../../../config/index.js"; // Adjusted path
import { McpLogLevel } from "../../../../utils/internal/logger.js"; // Added McpLogLevel import

/**
 * Manual backup script entry point.
 * This script is intended to be run from the project root.
 */
const runManualBackup = async () => {
  // Initialize logger for standalone script execution
  await logger.initialize(config.logLevel as McpLogLevel);
  logger.info("Starting manual database backup...");

  try {
    const backupPath = await exportDatabase();
    logger.info(
      `Manual backup completed successfully. Backup created at: ${backupPath}`,
    );
  } catch (error) {
    const reqContext = requestContextService.createRequestContext({
      operation: "runManualBackup.catch",
    });
    // Ensure logger is initialized before trying to use it in catch, though it should be by now.
    if (!logger["initialized"]) {
      // Accessing private member for a check, not ideal but pragmatic for script
      console.error(
        "Logger not initialized during catch block. Original error:",
        error,
      );
    } else {
      logger.error(
        "Manual database backup failed:",
        error as Error,
        reqContext,
      );
    }
    process.exitCode = 1; // Indicate failure
  } finally {
    // Ensure the Neo4j connection is closed after the script runs
    // Also ensure logger is available for these final messages
    if (!logger["initialized"]) {
      console.info("Closing Neo4j connection (logger was not initialized)...");
    } else {
      logger.info("Closing Neo4j connection...");
    }
    await closeNeo4jConnection();
    if (!logger["initialized"]) {
      console.info("Neo4j connection closed (logger was not initialized).");
    } else {
      logger.info("Neo4j connection closed.");
    }
  }
};

// Execute the backup process
runManualBackup();
