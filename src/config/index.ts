import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

export const config = {
  neo4jUri: process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4jUser: process.env.NEO4J_USER || "neo4j",
  neo4jPassword: process.env.NEO4J_PASSWORD || "password",
  mcpServerName: pkg.name,
  mcpServerVersion: pkg.version,
  logLevel: process.env.LOG_LEVEL || "info",
  environment: process.env.NODE_ENV || "development",
  security: {
    // Default to false in development, true in production
    authRequired: process.env.NODE_ENV === 'production' 
      ? process.env.AUTH_REQUIRED !== 'false'  // Default to true in prod unless explicitly disabled
      : process.env.AUTH_REQUIRED === 'true'   // Default to false in dev unless explicitly enabled
  }
};