import dotenv from "dotenv";
import { existsSync, mkdirSync, readFileSync, statSync } from "fs";
import path, { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from 'zod';

dotenv.config(); // Load environment variables from .env file

// --- Determine Project Root ---
/**
 * Finds the project root directory by searching upwards for package.json.
 * @param startDir The directory to start searching from.
 * @returns The absolute path to the project root, or throws an error if not found.
 */
const findProjectRoot = (startDir: string): string => {
    let currentDir = startDir;
    while (true) {
        const packageJsonPath = join(currentDir, 'package.json');
        if (existsSync(packageJsonPath)) {
            return currentDir;
        }
        const parentDir = dirname(currentDir);
        if (parentDir === currentDir) {
            throw new Error(`Could not find project root (package.json) starting from ${startDir}`);
        }
        currentDir = parentDir;
    }
};

let projectRoot: string;
try {
    const currentModuleDir = dirname(fileURLToPath(import.meta.url));
    projectRoot = findProjectRoot(currentModuleDir);
} catch (error: any) {
    console.error(`FATAL: Error determining project root: ${error.message}`);
    projectRoot = process.cwd(); 
    console.warn(`Warning: Using process.cwd() (${projectRoot}) as fallback project root.`);
}
// --- End Determine Project Root ---

// --- Reading package.json ---
const packageJsonPath = path.resolve(projectRoot, 'package.json');
let pkg: { name: string; version: string } = { name: 'atlas-mcp-server', version: '0.0.0' }; // Default

try {
  // Basic check to ensure resolved path is within the determined project root
  if (!packageJsonPath.startsWith(projectRoot + path.sep) && packageJsonPath !== projectRoot) {
    // This check might be too simplistic if symlinks are involved, but good for basic safety.
    // A more robust check would normalize both paths before comparison.
  }
  pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
} catch (error: any) {
  if (process.stdout.isTTY) {
    console.error(
      `Warning: Could not read package.json at ${packageJsonPath} for default config values. Using hardcoded defaults. Error: ${error.message}`,
    );
  }
}
// --- End Reading package.json ---

/**
 * Zod schema for validating environment variables.
 * Provides type safety, validation, defaults, and clear error messages.
 * @private
 */
const EnvSchema = z.object({
  /** Optional. The desired name for the MCP server. Defaults to `package.json` name. */
  MCP_SERVER_NAME: z.string().optional(),
  /** Optional. The version of the MCP server. Defaults to `package.json` version. */
  MCP_SERVER_VERSION: z.string().optional(),
  /** Minimum logging level. See `McpLogLevel` in logger utility. Default: "debug". */
  MCP_LOG_LEVEL: z.string().default("debug"),
  /** Runtime environment (e.g., "development", "production"). Default: "development". */
  NODE_ENV: z.string().default("development"),
  /** MCP communication transport ("stdio" or "http"). Default: "stdio". */
  MCP_TRANSPORT_TYPE: z.enum(["stdio", "http"]).default("stdio"),
  /** HTTP server port (if MCP_TRANSPORT_TYPE is "http"). Default: 3010. */
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3010),
  /** HTTP server host (if MCP_TRANSPORT_TYPE is "http"). Default: "127.0.0.1". */
  MCP_HTTP_HOST: z.string().default("127.0.0.1"),
  /** Optional. Comma-separated allowed origins for CORS (HTTP transport). */
  MCP_ALLOWED_ORIGINS: z.string().optional(),
  /** Optional. Secret key (min 32 chars) for auth tokens (HTTP transport). CRITICAL for production. */
  MCP_AUTH_SECRET_KEY: z
    .string()
    .min(
      32,
      "MCP_AUTH_SECRET_KEY must be at least 32 characters long for security reasons.",
    )
    .optional(),
  MCP_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000), // 1 minute
  MCP_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  NEO4J_URI: z.string().default("bolt://localhost:7687"),
  NEO4J_USER: z.string().default("neo4j"),
  NEO4J_PASSWORD: z.string().default("password"),

  BACKUP_FILE_DIR: z.string().default(path.join(projectRoot, "atlas-backups")),
  BACKUP_MAX_COUNT: z.coerce.number().int().min(0).default(10),

  /** Directory for log files. Defaults to "logs" in project root. */
  LOGS_DIR: z.string().default(path.join(projectRoot, "logs")),

  /** Optional. Application URL for OpenRouter integration. */
  OPENROUTER_APP_URL: z
    .string()
    .url("OPENROUTER_APP_URL must be a valid URL (e.g., http://localhost:3000)")
    .optional(),
  /** Optional. Application name for OpenRouter. Defaults to MCP_SERVER_NAME or package name. */
  OPENROUTER_APP_NAME: z.string().optional(),
  /** Optional. API key for OpenRouter services. */
  OPENROUTER_API_KEY: z.string().optional(),
  /** Default LLM model. Default: "google/gemini-2.5-flash-preview:thinking". */
  LLM_DEFAULT_MODEL: z
    .string()
    .default("google/gemini-2.5-flash-preview:thinking"),
  /** Optional. Default LLM temperature (0.0-2.0). */
  LLM_DEFAULT_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
  /** Optional. Default LLM top_p (0.0-1.0). */
  LLM_DEFAULT_TOP_P: z.coerce.number().min(0).max(1).optional(),
  /** Optional. Default LLM max tokens (positive integer). */
  LLM_DEFAULT_MAX_TOKENS: z.coerce.number().int().positive().optional(),
  /** Optional. Default LLM top_k (non-negative integer). */
  LLM_DEFAULT_TOP_K: z.coerce.number().int().nonnegative().optional(),
  /** Optional. Default LLM min_p (0.0-1.0). */
  LLM_DEFAULT_MIN_P: z.coerce.number().min(0).max(1).optional(),

  /** Optional. OAuth provider authorization endpoint URL. */
  OAUTH_PROXY_AUTHORIZATION_URL: z
    .string()
    .url("OAUTH_PROXY_AUTHORIZATION_URL must be a valid URL.")
    .optional(),
  /** Optional. OAuth provider token endpoint URL. */
  OAUTH_PROXY_TOKEN_URL: z
    .string()
    .url("OAUTH_PROXY_TOKEN_URL must be a valid URL.")
    .optional(),
  /** Optional. OAuth provider revocation endpoint URL. */
  OAUTH_PROXY_REVOCATION_URL: z
    .string()
    .url("OAUTH_PROXY_REVOCATION_URL must be a valid URL.")
    .optional(),
  /** Optional. OAuth provider issuer URL. */
  OAUTH_PROXY_ISSUER_URL: z
    .string()
    .url("OAUTH_PROXY_ISSUER_URL must be a valid URL.")
    .optional(),
  /** Optional. OAuth service documentation URL. */
  OAUTH_PROXY_SERVICE_DOCUMENTATION_URL: z
    .string()
    .url("OAUTH_PROXY_SERVICE_DOCUMENTATION_URL must be a valid URL.")
    .optional(),
  /** Optional. Comma-separated default OAuth client redirect URIs. */
  OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS: z.string().optional(),
});

// Parse and validate environment variables
const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  if (process.stdout.isTTY) {
    console.error(
      "❌ Invalid environment variables found:",
      parsedEnv.error.flatten().fieldErrors,
    );
  }
  // Consider throwing an error in production for critical misconfigurations.
}

const env = parsedEnv.success ? parsedEnv.data : EnvSchema.parse({}); // Use defaults on failure

// --- Directory Ensurance Function ---
/**
 * Ensures a directory exists and is within the project root.
 * @param dirPath The desired path for the directory (can be relative or absolute).
 * @param rootDir The root directory of the project to contain the directory.
 * @param dirName The name of the directory type for logging (e.g., "backup", "logs").
 * @returns The validated, absolute path to the directory, or null if invalid.
 */
const ensureDirectory = (dirPath: string, rootDir: string, dirName: string): string | null => {
  const resolvedDirPath = path.isAbsolute(dirPath) ? dirPath : path.resolve(rootDir, dirPath);

  // Ensure the resolved path is within the project root boundary
  if (!resolvedDirPath.startsWith(rootDir + path.sep) && resolvedDirPath !== rootDir) {
    if (process.stdout.isTTY) {
      console.error(`Error: ${dirName} path "${dirPath}" resolves to "${resolvedDirPath}", which is outside the project boundary "${rootDir}".`);
    }
    return null;
  }

  if (!existsSync(resolvedDirPath)) {
    try {
      mkdirSync(resolvedDirPath, { recursive: true });
      if (process.stdout.isTTY) {
        console.log(`Created ${dirName} directory: ${resolvedDirPath}`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (process.stdout.isTTY) {
        console.error(`Error creating ${dirName} directory at ${resolvedDirPath}: ${errorMessage}`);
      }
      return null;
    }
  } else {
    try {
        const stats = statSync(resolvedDirPath);
        if (!stats.isDirectory()) {
            if (process.stdout.isTTY) {
              console.error(`Error: ${dirName} path ${resolvedDirPath} exists but is not a directory.`);
            }
            return null;
        }
    } catch (statError: any) {
        if (process.stdout.isTTY) {
          console.error(`Error accessing ${dirName} path ${resolvedDirPath}: ${statError.message}`);
        }
        return null;
    }
  }
  return resolvedDirPath;
};
// --- End Directory Ensurance Function ---


// --- Backup Directory Handling ---
/**
 * Ensures the backup directory exists and is within the project root.
 * @param backupPath The desired path for the backup directory (can be relative or absolute).
 * @param rootDir The root directory of the project to contain the backups.
 * @returns The validated, absolute path to the backup directory, or null if invalid.
 */
const ensureBackupDir = (backupPath: string, rootDir: string): string | null => {
  return ensureDirectory(backupPath, rootDir, "backup");
};

const validatedBackupPath = ensureBackupDir(env.BACKUP_FILE_DIR, projectRoot);

if (!validatedBackupPath) {
    if (process.stdout.isTTY) {
      console.error("FATAL: Backup directory configuration is invalid or could not be created. Please check permissions and path. Exiting.");
    }
    process.exit(1); 
}
// --- End Backup Directory Handling ---

// --- Logs Directory Handling ---
/**
 * Ensures the logs directory exists and is within the project root.
 * @param logsPath The desired path for the logs directory (can be relative or absolute).
 * @param rootDir The root directory of the project to contain the logs.
 * @returns The validated, absolute path to the logs directory, or null if invalid.
 */
const ensureLogsDir = (logsPath: string, rootDir: string): string | null => {
  return ensureDirectory(logsPath, rootDir, "logs");
};

const validatedLogsPath = ensureLogsDir(env.LOGS_DIR, projectRoot);

if (!validatedLogsPath) {
    if (process.stdout.isTTY) {
      console.error("FATAL: Logs directory configuration is invalid or could not be created. Please check permissions and path. Exiting.");
    }
    process.exit(1);
}
// --- End Logs Directory Handling ---

/**
 * Main application configuration object.
 * Aggregates settings from validated environment variables and `package.json`.
 */
export const config = {
  /** MCP server name. Env `MCP_SERVER_NAME` > `package.json` name > "atlas-mcp-server". */
  mcpServerName: env.MCP_SERVER_NAME || pkg.name,
  /** MCP server version. Env `MCP_SERVER_VERSION` > `package.json` version > "0.0.0". */
  mcpServerVersion: env.MCP_SERVER_VERSION || pkg.version,
  /** Logging level. From `MCP_LOG_LEVEL` env var. Default: "debug". */
  logLevel: env.MCP_LOG_LEVEL,
  /** Absolute path to the logs directory. From `LOGS_DIR` env var. */
  logsPath: validatedLogsPath,
  /** Runtime environment. From `NODE_ENV` env var. Default: "development". */
  environment: env.NODE_ENV,
  
  /** MCP transport type ('stdio' or 'http'). From `MCP_TRANSPORT_TYPE` env var. Default: "stdio". */
  mcpTransportType: env.MCP_TRANSPORT_TYPE,
  /** HTTP server port (if http transport). From `MCP_HTTP_PORT` env var. Default: 3010. */
  mcpHttpPort: env.MCP_HTTP_PORT,
  /** HTTP server host (if http transport). From `MCP_HTTP_HOST` env var. Default: "127.0.0.1". */
  mcpHttpHost: env.MCP_HTTP_HOST,
  /** Array of allowed CORS origins (http transport). From `MCP_ALLOWED_ORIGINS` (comma-separated). */
  mcpAllowedOrigins: env.MCP_ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean),
  /** Auth secret key (JWTs, http transport). From `MCP_AUTH_SECRET_KEY`. CRITICAL. */
  mcpAuthSecretKey: env.MCP_AUTH_SECRET_KEY,

  /** Neo4j connection URI. From `NEO4J_URI`. */
  neo4jUri: env.NEO4J_URI,
  /** Neo4j username. From `NEO4J_USER`. */
  neo4jUser: env.NEO4J_USER,
  /** Neo4j password. From `NEO4J_PASSWORD`. */
  neo4jPassword: env.NEO4J_PASSWORD,
  
  /** Backup configuration. */
  backup: {
    /** Maximum number of backups to keep. From `BACKUP_MAX_COUNT`. */
    maxBackups: env.BACKUP_MAX_COUNT,
    /** Absolute path to the backup directory. From `BACKUP_FILE_DIR`. */
    backupPath: validatedBackupPath 
  },

  /** Security-related configurations. */
  security: {
    /** Indicates if authentication is required. True if `MCP_AUTH_SECRET_KEY` is set. */
    authRequired: !!env.MCP_AUTH_SECRET_KEY,
    /** Rate limiting window in milliseconds. From `MCP_RATE_LIMIT_WINDOW_MS`. */
    rateLimitWindowMs: env.MCP_RATE_LIMIT_WINDOW_MS,
    /** Maximum number of requests allowed per window. From `MCP_RATE_LIMIT_MAX_REQUESTS`. */
    rateLimitMaxRequests: env.MCP_RATE_LIMIT_MAX_REQUESTS,
  },

  /** OpenRouter App URL. From `OPENROUTER_APP_URL`. Default: "http://localhost:3000" (or MCP server URL if HTTP). */
  openrouterAppUrl: env.OPENROUTER_APP_URL || (env.MCP_TRANSPORT_TYPE === 'http' ? `http://${env.MCP_HTTP_HOST}:${env.MCP_HTTP_PORT}` : "http://localhost:3000"),
  /** OpenRouter App Name. From `OPENROUTER_APP_NAME`. Defaults to `mcpServerName`. */
  openrouterAppName: env.OPENROUTER_APP_NAME || pkg.name,
  /** OpenRouter API Key. From `OPENROUTER_API_KEY`. */
  openrouterApiKey: env.OPENROUTER_API_KEY,
  /** Default LLM model. From `LLM_DEFAULT_MODEL`. */
  llmDefaultModel: env.LLM_DEFAULT_MODEL,
  /** Default LLM temperature. From `LLM_DEFAULT_TEMPERATURE`. */
  llmDefaultTemperature: env.LLM_DEFAULT_TEMPERATURE,
  /** Default LLM top_p. From `LLM_DEFAULT_TOP_P`. */
  llmDefaultTopP: env.LLM_DEFAULT_TOP_P,
  /** Default LLM max tokens. From `LLM_DEFAULT_MAX_TOKENS`. */
  llmDefaultMaxTokens: env.LLM_DEFAULT_MAX_TOKENS,
  /** Default LLM top_k. From `LLM_DEFAULT_TOP_K`. */
  llmDefaultTopK: env.LLM_DEFAULT_TOP_K,
  /** Default LLM min_p. From `LLM_DEFAULT_MIN_P`. */
  llmDefaultMinP: env.LLM_DEFAULT_MIN_P,

  /** OAuth Proxy configurations. Undefined if no related env vars are set. */
  oauthProxy:
    env.OAUTH_PROXY_AUTHORIZATION_URL ||
    env.OAUTH_PROXY_TOKEN_URL ||
    env.OAUTH_PROXY_REVOCATION_URL ||
    env.OAUTH_PROXY_ISSUER_URL ||
    env.OAUTH_PROXY_SERVICE_DOCUMENTATION_URL ||
    env.OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS
      ? {
          authorizationUrl: env.OAUTH_PROXY_AUTHORIZATION_URL,
          tokenUrl: env.OAUTH_PROXY_TOKEN_URL,
          revocationUrl: env.OAUTH_PROXY_REVOCATION_URL,
          issuerUrl: env.OAUTH_PROXY_ISSUER_URL,
          serviceDocumentationUrl: env.OAUTH_PROXY_SERVICE_DOCUMENTATION_URL,
          defaultClientRedirectUris:
            env.OAUTH_PROXY_DEFAULT_CLIENT_REDIRECT_URIS?.split(",")
              .map((uri) => uri.trim())
              .filter(Boolean),
        }
      : undefined,
};

/**
 * Configured logging level for the application.
 * Exported for convenience.
 */
export const logLevel: string = config.logLevel;

/**
 * Configured runtime environment ("development", "production", etc.).
 * Exported for convenience.
 */
export const environment: string = config.environment;
