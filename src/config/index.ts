import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import path from "path";
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
  backup: {
    enabled: process.env.BACKUP_ENABLED !== 'false', // Enabled by default
    schedule: process.env.BACKUP_SCHEDULE || '0 */6 * * *', // Every 6 hours by default
    maxBackups: parseInt(process.env.BACKUP_MAX_COUNT || '10', 10), // Keep 10 backups by default
    backupOnStart: process.env.BACKUP_ON_START === 'true'  // Disabled by default
  },
  security: {
    // Default to false in development, true in production
    authRequired: process.env.NODE_ENV === 'production' 
      ? process.env.AUTH_REQUIRED !== 'false'  // Default to true in prod unless explicitly disabled
      : process.env.AUTH_REQUIRED === 'true'   // Default to false in dev unless explicitly enabled
  },
  skills: {
    // Path to coding standards file - use absolute path if provided, otherwise resolve relative to CWD
    codingStandardsPath: process.env.ATLAS_CODING_STANDARDS_PATH 
      ? (path.isAbsolute(process.env.ATLAS_CODING_STANDARDS_PATH)
          ? process.env.ATLAS_CODING_STANDARDS_PATH
          : path.resolve(process.cwd(), process.env.ATLAS_CODING_STANDARDS_PATH))
      : null,
    
    // Git configuration
    git: {
      username: process.env.GIT_USERNAME || undefined,
      email: process.env.GIT_EMAIL || undefined,
      defaultBranchPrefix: process.env.GIT_BRANCH_PREFIX || 'feature'
    },
    
    // Code style preferences
    codeStyle: {
      indentStyle: process.env.CODING_INDENT_STYLE || 'spaces',
      indentSize: parseInt(process.env.CODING_INDENT_SIZE || '2', 10),
      lineLength: parseInt(process.env.CODING_MAX_LINE_LENGTH || '100', 10),
      defaultLicense: process.env.CODING_DEFAULT_LICENSE || 'MIT'
    },
    
    // Project-specific configuration
    project: {
      defaultFramework: process.env.PROJECT_DEFAULT_FRAMEWORK || 'typescript',
      useDocker: process.env.PROJECT_USE_DOCKER === 'true',
      cicdProvider: process.env.PROJECT_CICD_PROVIDER || 'github-actions'
    }
  }
};