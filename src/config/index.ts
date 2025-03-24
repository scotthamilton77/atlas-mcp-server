import dotenv from "dotenv";
import { readFileSync, mkdirSync, existsSync } from "fs";
import path, { dirname, join } from "path";
import { fileURLToPath } from "url";
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

// Ensure backup directory exists on startup
const ensureBackupDir = (backupPath: string): void => {
  if (!existsSync(backupPath)) {
    try {
      mkdirSync(backupPath, { recursive: true });
      console.log(`Created backup directory: ${backupPath}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Error creating backup directory: ${errorMessage}`);
    }
  }
};

// Determine the backup path
const backupPath = process.env.BACKUP_FILE_DIR 
  ? (path.isAbsolute(process.env.BACKUP_FILE_DIR) 
      ? process.env.BACKUP_FILE_DIR 
      : path.resolve(process.cwd(), process.env.BACKUP_FILE_DIR))
  : path.resolve(process.cwd(), 'backups');

// Ensure the backup directory exists
ensureBackupDir(backupPath);

export const config = {
  neo4jUri: process.env.NEO4J_URI || "bolt://localhost:7687",
  neo4jUser: process.env.NEO4J_USER || "neo4j",
  neo4jPassword: process.env.NEO4J_PASSWORD || "password",
  mcpServerName: pkg.name,
  mcpServerVersion: pkg.version,
  logLevel: process.env.LOG_LEVEL || "info",
  environment: process.env.NODE_ENV || "development",
  backup: {
    maxBackups: parseInt(process.env.BACKUP_MAX_COUNT || '10', 10),
    backupPath
  },
  security: {
    // Internal auth is disabled by default, will implement later if needed
    authRequired: false
  }
}
