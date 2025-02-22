import dotenv from "dotenv";
dotenv.config();

export const config = {
  neo4jUri: process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4jUser: process.env.NEO4J_USER || "neo4j",
  neo4jPassword: process.env.NEO4J_PASSWORD || "password",
  mcpServerName: process.env.MCP_SERVER_NAME || "ATLAS MCP Server",
  mcpServerVersion: process.env.MCP_SERVER_VERSION || "1.0.0",
  logLevel: process.env.LOG_LEVEL || "info",
  environment: process.env.NODE_ENV || "development",
  security: {
    // Default to false in development, true in production
    authRequired: process.env.NODE_ENV === 'production' 
      ? process.env.AUTH_REQUIRED !== 'false'  // Default to true in prod unless explicitly disabled
      : process.env.AUTH_REQUIRED === 'true'   // Default to false in dev unless explicitly enabled
  }
};