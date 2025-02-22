import { config } from "../config/index.js";
import winston from "winston";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

type LogLevel = "debug" | "info" | "warn" | "error";

// Handle ESM module dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve logs directory relative to project root (2 levels up from utils/)
const projectRoot = path.resolve(__dirname, '..', '..');
const logsDir = path.join(projectRoot, 'logs');

class Logger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor() {
    const logLevel = (config.logLevel as LogLevel) || "info";
    
    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Common format for all transports
    const commonFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, context, stack }) => {
        const contextStr = context ? `\n  Context: ${JSON.stringify(context, null, 2)}` : "";
        const stackStr = stack ? `\n  Stack: ${stack}` : "";
        return `[${timestamp}] ${level}: ${message}${contextStr}${stackStr}`;
      })
    );

    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.json(),
      transports: [
        // Combined log file for all levels
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          format: commonFormat
        }),
        // Separate log files for each level
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          format: commonFormat
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'warn.log'),
          level: 'warn',
          format: commonFormat
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'info.log'),
          level: 'info',
          format: commonFormat
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'debug.log'),
          level: 'debug',
          format: commonFormat
        })
      ]
    });
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public debug(message: string, context?: Record<string, unknown>) {
    this.logger.debug(message, { context });
  }

  public info(message: string, context?: Record<string, unknown>) {
    this.logger.info(message, { context });
  }

  public warn(message: string, context?: Record<string, unknown>) {
    this.logger.warn(message, { context });
  }

  public error(message: string, context?: Record<string, unknown>) {
    this.logger.error(message, { context });
  }
}

export const logger = Logger.getInstance();