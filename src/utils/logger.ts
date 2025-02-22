import { config } from "../config/index.js";
import winston from "winston";

type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor() {
    const logLevel = (config.logLevel as LogLevel) || "info";

    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context, stack }) => {
              const contextStr = context ? `\n  Context: ${JSON.stringify(context, null, 2)}` : "";
              const stackStr = stack ? `\n  Stack: ${stack}` : "";
              return `[${timestamp}] ${level}: ${message}${contextStr}${stackStr}`;
            })
          )
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