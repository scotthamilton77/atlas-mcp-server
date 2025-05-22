/**
 * Handles the setup and management of the Streamable HTTP MCP transport.
 * Implements the MCP Specification 2025-03-26 for Streamable HTTP.
 * Includes Express server creation, middleware (CORS, Auth), request routing
 * (POST/GET/DELETE on a single endpoint), session handling, SSE streaming,
 * and port binding with retry logic.
 *
 * Specification Reference:
 * https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-03-26/basic/transports.mdx#streamable-http
 * @module src/mcp/transports/httpTransport
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"; // SDK type guard for InitializeRequest
import express, { NextFunction, Request, Response } from "express";
import http from "http";
import { randomUUID } from "node:crypto";
// Import config and utils
import { config } from "../../config/index.js"; // Import the validated config object
import {
  logger,
  RequestContext,
  requestContextService,
} from "../../utils/index.js";
import { mcpAuthMiddleware } from "./authentication/authMiddleware.js"; // Import the auth middleware

// --- Configuration Constants (Derived from imported config) ---

/**
 * The port number for the HTTP transport, configured via MCP_HTTP_PORT.
 * Defaults to 3010 (defined in config/index.ts).
 * @constant {number} HTTP_PORT
 */
const HTTP_PORT = config.mcpHttpPort;

/**
 * The host address for the HTTP transport, configured via MCP_HTTP_HOST.
 * Defaults to '127.0.0.1' (defined in config/index.ts).
 * MCP Spec Security: Recommends binding to localhost for local servers.
 * @constant {string} HTTP_HOST
 */
const HTTP_HOST = config.mcpHttpHost;

/**
 * The single HTTP endpoint path for all MCP communication, as required by the spec.
 * Supports POST, GET, DELETE, OPTIONS methods.
 * @constant {string} MCP_ENDPOINT_PATH
 */
const MCP_ENDPOINT_PATH = "/mcp";

/**
 * Maximum number of attempts to find an available port if the initial HTTP_PORT is in use.
 * Tries ports sequentially: HTTP_PORT, HTTP_PORT + 1, ...
 * @constant {number} MAX_PORT_RETRIES
 */
const MAX_PORT_RETRIES = 15;

/**
 * Stores active StreamableHTTPServerTransport instances, keyed by their session ID.
 * Essential for routing subsequent requests to the correct stateful session.
 * @type {Record<string, StreamableHTTPServerTransport>}
 */
const httpTransports: Record<string, StreamableHTTPServerTransport> = {};

/**
 * Checks if an incoming HTTP request's origin header is permissible.
 * MCP Spec Security: Servers MUST validate the `Origin` header.
 * This function checks against `MCP_ALLOWED_ORIGINS` and allows requests
 * from localhost if the server is bound locally. Sets CORS headers if allowed.
 *
 * @param {Request} req - Express request object.
 * @param {Response} res - Express response object.
 * @returns {boolean} True if the origin is allowed, false otherwise.
 */
function isOriginAllowed(req: Request, res: Response): boolean {
  const origin = req.headers.origin; // string | undefined
  const host = req.hostname; // string (Express normalizes this)
  const isLocalhostBinding = ["127.0.0.1", "::1", "localhost"].includes(host);
  const configuredAllowedOrigins = config.mcpAllowedOrigins || []; // string[]

  const context = requestContextService.createRequestContext({
    operation: "isOriginAllowed",
    origin,
    host,
    isLocalhostBinding,
    allowedOrigins: configuredAllowedOrigins,
  });
  logger.debug("Checking origin allowance", context);

  let finalIsAllowed = false; // Default to not allowed
  let originMatchesConfig = false;

  if (origin) { // An origin must be present to be considered.
    // Check if origin is in the configured list
    if (configuredAllowedOrigins.includes(origin)) {
      finalIsAllowed = true;
      originMatchesConfig = true;
    }

    // If not allowed by config, check localhost binding condition
    // Ensure origin is not the string "null" as per original logic.
    if (!finalIsAllowed && isLocalhostBinding && origin !== "null") {
      finalIsAllowed = true;
    }
  }

  // Set CORS headers if the origin is allowed and was provided
  if (finalIsAllowed && origin) { // Check finalIsAllowed instead of originMatchesConfig
    res.setHeader("Access-Control-Allow-Origin", origin);
    // MCP Spec: Streamable HTTP uses POST, GET, DELETE. OPTIONS is for preflight.
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    // MCP Spec: Requires Mcp-Session-Id. Last-Event-ID for SSE resumption. Content-Type is standard. Authorization for security.
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Mcp-Session-Id, Last-Event-ID, Authorization",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true"); // Set based on whether auth/cookies are used
  } else if (!finalIsAllowed && origin) {
    // Log a warning if an origin was provided but was not allowed by any rule
    logger.warning(`Origin denied: ${origin}`, context);
  }

  logger.debug(`Origin check result: ${finalIsAllowed}`, { ...context, allowed: finalIsAllowed });
  return finalIsAllowed;
}

/**
 * Proactively checks if a specific port is already in use. (Asynchronous)
 * @param {number} port - Port to check.
 * @param {string} host - Host address to check.
 * @param {RequestContext} parentContext - Logging context from the caller.
 * @returns {Promise<boolean>} True if port is in use (EADDRINUSE), false otherwise.
 */
async function isPortInUse(
  port: number,
  host: string,
  parentContext: RequestContext,
): Promise<boolean> {
  const checkContext = requestContextService.createRequestContext({
    ...parentContext,
    operation: "isPortInUse",
    port,
    host,
  });
  logger.debug(`Proactively checking port usability...`, checkContext);
  return new Promise((resolve) => {
    const tempServer = http.createServer();
    tempServer
      .once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          logger.debug(
            `Proactive check: Port confirmed in use (EADDRINUSE).`,
            checkContext,
          );
          resolve(true); // Port is definitely in use
        } else {
          logger.debug(
            `Proactive check: Non-EADDRINUSE error encountered: ${err.message}`,
            { ...checkContext, errorCode: err.code },
          );
          resolve(false); // Other error, let main listen attempt handle it
        }
      })
      .once("listening", () => {
        logger.debug(`Proactive check: Port is available.`, checkContext);
        tempServer.close(() => resolve(false)); // Port is free
      })
      .listen(port, host);
  });
}

/**
 * Attempts to start the HTTP server, retrying on incrementing ports if EADDRINUSE occurs. (Asynchronous)
 * Uses proactive checks before attempting to bind the main server instance.
 *
 * @param {http.Server} serverInstance - The Node.js HTTP server instance.
 * @param {number} initialPort - The starting port number.
 * @param {string} host - The host address to bind to.
 * @param {number} maxRetries - Maximum number of additional ports to try.
 * @param {RequestContext} parentContext - Logging context from the caller.
 * @returns {Promise<number>} Resolves with the port number successfully bound to.
 * @throws {Error} Rejects if binding fails after all retries or for non-EADDRINUSE errors.
 */
function startHttpServerWithRetry(
  serverInstance: http.Server,
  initialPort: number,
  host: string,
  maxRetries: number,
  parentContext: RequestContext,
): Promise<number> {
  const startContext = requestContextService.createRequestContext({
    ...parentContext,
    operation: "startHttpServerWithRetry",
    initialPort,
    host,
    maxRetries,
  });
  logger.debug(`Attempting to start HTTP server...`, startContext);
  return new Promise(async (resolve, reject) => {
    let lastError: Error | null = null;
    for (let i = 0; i <= maxRetries; i++) {
      const currentPort = initialPort + i;
      const attemptContext = requestContextService.createRequestContext({
        ...startContext,
        port: currentPort,
        attempt: i + 1,
        maxAttempts: maxRetries + 1,
      });
      logger.debug(
        `Attempting port ${currentPort} (${attemptContext.attempt}/${attemptContext.maxAttempts})`,
        attemptContext,
      );

      // 1. Proactive Check
      if (await isPortInUse(currentPort, host, attemptContext)) {
        logger.warning(
          `Proactive check detected port ${currentPort} is in use, retrying...`,
          attemptContext,
        );
        lastError = new Error(
          `EADDRINUSE: Port ${currentPort} detected as in use by proactive check.`,
        );
        await new Promise((res) => setTimeout(res, 100)); // Short delay
        continue; // Try next port
      }

      // 2. Attempt Main Server Bind
      try {
        await new Promise<void>((listenResolve, listenReject) => {
          serverInstance
            .listen(currentPort, host, () => {
              const serverAddress = `http://${host}:${currentPort}${MCP_ENDPOINT_PATH}`;
              logger.info(
                `HTTP transport successfully listening on host ${host} at ${serverAddress}`,
                { ...attemptContext, address: serverAddress },
              );
              listenResolve(); // Success
            })
            .on("error", (err: NodeJS.ErrnoException) => {
              listenReject(err); // Forward error
            });
        });
        resolve(currentPort); // Listen succeeded
        return; // Exit function
      } catch (err: any) {
        lastError = err;
        logger.debug(
          `Listen error on port ${currentPort}: Code=${err.code}, Message=${err.message}`,
          { ...attemptContext, errorCode: err.code, errorMessage: err.message },
        );
        if (err.code === "EADDRINUSE") {
          logger.warning(
            `Port ${currentPort} already in use (EADDRINUSE), retrying...`,
            attemptContext,
          );
          await new Promise((res) => setTimeout(res, 100)); // Short delay before retry
        } else {
          logger.error(
            `Failed to bind to port ${currentPort} due to non-EADDRINUSE error: ${err.message}`,
            { ...attemptContext, error: err.message },
          );
          reject(err); // Non-recoverable error for this port
          return; // Exit function
        }
      }
    }
    // Loop finished without success
    logger.error(
      `Failed to bind to any port after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`,
      { ...startContext, error: lastError?.message },
    );
    reject(
      lastError ||
        new Error("Failed to bind to any port after multiple retries."),
    );
  });
}

/**
 * Sets up and starts the Streamable HTTP transport layer for MCP. (Asynchronous)
 * Creates Express app, configures middleware (CORS, Auth, Security Headers),
 * defines the single MCP endpoint handler for POST/GET/DELETE, manages sessions,
 * and starts the HTTP server with retry logic.
 *
 * @param {() => Promise<McpServer>} createServerInstanceFn - Async factory function to create a new McpServer instance per session.
 * @param {RequestContext} parentContext - Logging context from the main server startup process.
 * @returns {Promise<void>} Resolves when the server is listening, or rejects on failure.
 * @throws {Error} If the server fails to start after retries.
 */
export async function startHttpTransport(
  createServerInstanceFn: () => Promise<McpServer>,
  parentContext: RequestContext,
): Promise<void> {
  const app = express();
  const transportContext = requestContextService.createRequestContext({
    ...parentContext,
    transportType: "HTTP",
    component: "HttpTransportSetup",
  });
  logger.debug(
    "Setting up Express app for HTTP transport...",
    transportContext,
  );

  // Middleware to parse JSON request bodies. Required for MCP messages.
  app.use(express.json());

  // --- Security Middleware Pipeline ---

  // 1. CORS Preflight (OPTIONS) Handler
  app.options(MCP_ENDPOINT_PATH, (req, res) => {
    const optionsContext = requestContextService.createRequestContext({
      ...transportContext,
      operation: "handleOptions",
      origin: req.headers.origin,
      method: req.method,
      path: req.path,
    });
    logger.debug(
      `Received OPTIONS request for ${MCP_ENDPOINT_PATH}`,
      optionsContext,
    );
    if (isOriginAllowed(req, res)) {
      logger.debug(
        "OPTIONS request origin allowed, sending 204.",
        optionsContext,
      );
      res.sendStatus(204);
    } else {
      logger.debug(
        "OPTIONS request origin denied, sending 403.",
        optionsContext,
      );
      res.status(403).send("Forbidden: Invalid Origin");
    }
  });

  // 2. General Security Headers & Origin Check Middleware (for non-OPTIONS)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const securityContext = requestContextService.createRequestContext({
      ...transportContext,
      operation: "securityMiddleware",
      path: req.path,
      method: req.method,
      origin: req.headers.origin,
    });
    logger.debug(`Applying security middleware...`, securityContext);

    if (!isOriginAllowed(req, res)) {
      logger.debug("Origin check failed, sending 403.", securityContext);
      res.status(403).send("Forbidden: Invalid Origin");
      return;
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self'; img-src 'self'; media-src 'self'; frame-src 'none'; font-src 'self'; connect-src 'self'",
    );
    logger.debug("Security middleware passed.", securityContext);
    next();
  });

  // 3. MCP Authentication Middleware
  app.use(mcpAuthMiddleware);

  // --- MCP Route Handlers ---
  app.post(MCP_ENDPOINT_PATH, async (req, res) => {
    const basePostContext = requestContextService.createRequestContext({
      ...transportContext,
      operation: "handlePost",
      method: "POST",
      path: req.path,
      origin: req.headers.origin,
    });
    logger.debug(`Received POST request on ${MCP_ENDPOINT_PATH}`, {
      ...basePostContext,
      headers: req.headers,
      bodyPreview: JSON.stringify(req.body).substring(0, 100),
    });

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    logger.debug(`Extracted session ID: ${sessionId}`, {
      ...basePostContext,
      sessionId,
    });

    let transport = sessionId ? httpTransports[sessionId] : undefined;
    logger.debug(`Found existing transport for session ID: ${!!transport}`, {
      ...basePostContext,
      sessionId,
    });

    const isInitReq = isInitializeRequest(req.body);
    logger.debug(`Is InitializeRequest: ${isInitReq}`, {
      ...basePostContext,
      sessionId,
    });
    const requestId = (req.body as any)?.id || null;

    try {
      if (isInitReq) {
        if (transport) {
          logger.warning(
            "Received InitializeRequest on an existing session ID. Closing old session and creating new.",
            { ...basePostContext, sessionId },
          );
          await transport.close();
          delete httpTransports[sessionId!];
        }
        logger.info("Handling Initialize Request: Creating new session...", {
          ...basePostContext,
          sessionId,
        });

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => {
            const newId = randomUUID();
            logger.debug(`Generated new session ID: ${newId}`, basePostContext);
            return newId;
          },
          onsessioninitialized: (newId) => {
            logger.debug(
              `Session initialized callback triggered for ID: ${newId}`,
              { ...basePostContext, newSessionId: newId },
            );
            httpTransports[newId] = transport!;
            logger.info(`HTTP Session created: ${newId}`, {
              ...basePostContext,
              newSessionId: newId,
            });
          },
        });

        transport.onclose = () => {
          const closedSessionId = transport!.sessionId;
          if (closedSessionId) {
            logger.debug(
              `onclose handler triggered for session ID: ${closedSessionId}`,
              { ...basePostContext, closedSessionId },
            );
            delete httpTransports[closedSessionId];
            logger.info(`HTTP Session closed: ${closedSessionId}`, {
              ...basePostContext,
              closedSessionId,
            });
          } else {
            logger.debug(
              "onclose handler triggered for transport without session ID (likely init failure).",
              basePostContext,
            );
          }
        };

        logger.debug(
          "Creating McpServer instance for new session...",
          basePostContext,
        );
        const server = await createServerInstanceFn();
        logger.debug(
          "Connecting McpServer to new transport...",
          basePostContext,
        );
        await server.connect(transport);
        logger.debug("McpServer connected to transport.", basePostContext);
      } else if (!transport) {
        logger.warning(
          "Invalid or missing session ID for non-initialize POST request.",
          { ...basePostContext, sessionId },
        );
        res.status(404).json({
          jsonrpc: "2.0",
          error: { code: -32004, message: "Invalid or expired session ID" },
          id: requestId,
        });
        return;
      }

      const currentSessionId = transport.sessionId;
      logger.debug(
        `Processing POST request content for session ${currentSessionId}...`,
        { ...basePostContext, sessionId: currentSessionId, isInitReq },
      );
      await transport.handleRequest(req, res, req.body);
      logger.debug(
        `Finished processing POST request content for session ${currentSessionId}.`,
        { ...basePostContext, sessionId: currentSessionId },
      );
    } catch (err) {
      const errorSessionId = transport?.sessionId || sessionId;
      logger.error("Error handling POST request", {
        ...basePostContext,
        sessionId: errorSessionId,
        isInitReq,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error during POST handling",
          },
          id: requestId,
        });
      }
      if (isInitReq && transport && !transport.sessionId) {
        logger.debug("Cleaning up transport after initialization failure.", {
          ...basePostContext,
          sessionId: errorSessionId,
        });
        await transport.close().catch((closeErr) =>
          logger.error("Error closing transport after init failure", {
            ...basePostContext,
            sessionId: errorSessionId,
            closeError: closeErr,
          }),
        );
      }
    }
  });

  const handleSessionReq = async (req: Request, res: Response) => {
    const method = req.method;
    const baseSessionReqContext = requestContextService.createRequestContext({
      ...transportContext,
      operation: `handle${method}`,
      method,
      path: req.path,
      origin: req.headers.origin,
    });
    logger.debug(`Received ${method} request on ${MCP_ENDPOINT_PATH}`, {
      ...baseSessionReqContext,
      headers: req.headers,
    });

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    logger.debug(`Extracted session ID: ${sessionId}`, {
      ...baseSessionReqContext,
      sessionId,
    });

    const transport = sessionId ? httpTransports[sessionId] : undefined;
    logger.debug(`Found existing transport for session ID: ${!!transport}`, {
      ...baseSessionReqContext,
      sessionId,
    });

    if (!transport) {
      logger.warning(`Session not found for ${method} request`, {
        ...baseSessionReqContext,
        sessionId,
      });
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32004, message: "Session not found or expired" },
        id: null
      });
      return;
    }

    try {
      logger.debug(
        `Delegating ${method} request to transport for session ${sessionId}...`,
        { ...baseSessionReqContext, sessionId },
      );
      await transport.handleRequest(req, res);
      logger.info(
        `Successfully handled ${method} request for session ${sessionId}`,
        { ...baseSessionReqContext, sessionId },
      );
    } catch (err) {
      logger.error(
        `Error handling ${method} request for session ${sessionId}`,
        {
          ...baseSessionReqContext,
          sessionId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
      );
      if (!res.headersSent) {
        res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal Server Error" },
            id: null
        });
      }
    }
  };
  app.get(MCP_ENDPOINT_PATH, handleSessionReq);
  app.delete(MCP_ENDPOINT_PATH, handleSessionReq);

  logger.debug("Creating HTTP server instance...", transportContext);
  const serverInstance = http.createServer(app);
  try {
    logger.debug(
      "Attempting to start HTTP server with retry logic...",
      transportContext,
    );
    const actualPort = await startHttpServerWithRetry(
      serverInstance,
      config.mcpHttpPort,
      config.mcpHttpHost,
      MAX_PORT_RETRIES,
      transportContext,
    );
    
    let serverAddressLog = `http://${config.mcpHttpHost}:${actualPort}${MCP_ENDPOINT_PATH}`;
    let productionNote = "";
    if (config.environment === "production") {
      // The server itself runs HTTP, but it's expected to be behind an HTTPS proxy in production.
      // The log reflects the effective public-facing URL.
      serverAddressLog = `https://${config.mcpHttpHost}:${actualPort}${MCP_ENDPOINT_PATH}`;
      productionNote = ` (via HTTPS, ensure reverse proxy is configured)`;
    }

    if (process.stdout.isTTY) {
      console.log(
        `\n🚀 MCP Server running in HTTP mode at: ${serverAddressLog}${productionNote}\n   (MCP Spec: 2025-03-26 Streamable HTTP Transport)\n`,
      );
    }
  } catch (err) {
    logger.fatal("HTTP server failed to start after multiple port retries.", {
      ...transportContext,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
