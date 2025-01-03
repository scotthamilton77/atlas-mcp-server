/**
 * Configuration validation schemas using Zod
 */
import { z } from 'zod';
import { LogLevels } from '../../../types/logging.js';
import { Environments } from '../../../types/config.js';

/**
 * Environment variables validation schema
 */
export const envVarsSchema = z.object({
  NODE_ENV: z
    .enum([Environments.DEVELOPMENT, Environments.PRODUCTION, Environments.TEST])
    .optional(),
  LOG_LEVEL: z
    .enum([
      LogLevels.ERROR,
      LogLevels.WARN,
      LogLevels.INFO,
      LogLevels.HTTP,
      LogLevels.VERBOSE,
      LogLevels.DEBUG,
      LogLevels.SILLY,
    ])
    .optional(),
  TASK_STORAGE_DIR: z.string().optional(),
});

/**
 * Logging configuration validation schema
 */
export const loggingConfigSchema = z.object({
  level: z.enum([
    LogLevels.ERROR,
    LogLevels.WARN,
    LogLevels.INFO,
    LogLevels.HTTP,
    LogLevels.VERBOSE,
    LogLevels.DEBUG,
    LogLevels.SILLY,
  ]),
  console: z.boolean().optional(),
  file: z.boolean().optional(),
  dir: z.string().optional(),
  maxFiles: z.number().int().positive().optional(),
  maxSize: z.number().int().positive().optional(),
  noColors: z.boolean().optional(),
});

/**
 * Storage connection configuration validation schema
 */
export const storageConnectionConfigSchema = z.object({
  maxRetries: z.number().int().positive().optional(),
  retryDelay: z.number().int().nonnegative().optional(),
  busyTimeout: z.number().int().nonnegative().optional(),
});

/**
 * Storage performance configuration validation schema
 */
export const storagePerformanceConfigSchema = z.object({
  checkpointInterval: z.number().int().nonnegative().optional(),
  cacheSize: z.number().int().nonnegative().optional(),
  mmapSize: z.number().int().nonnegative().optional(),
  pageSize: z.number().int().nonnegative().optional(),
});

/**
 * Storage configuration validation schema
 */
export const storageConfigSchema = z.object({
  baseDir: z.string(),
  name: z.string(),
  connection: storageConnectionConfigSchema.optional(),
  performance: storagePerformanceConfigSchema.optional(),
});

/**
 * Complete configuration validation schema
 */
export const configSchema = z.object({
  env: z.enum([Environments.DEVELOPMENT, Environments.PRODUCTION, Environments.TEST]),
  logging: loggingConfigSchema,
  storage: storageConfigSchema,
});

// Export types for the schemas
export type EnvVars = z.infer<typeof envVarsSchema>;
export type LoggingConfig = z.infer<typeof loggingConfigSchema>;
export type StorageConfig = z.infer<typeof storageConfigSchema>;
export type Config = z.infer<typeof configSchema>;
