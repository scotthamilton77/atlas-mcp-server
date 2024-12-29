/**
 * Logging system exports
 * Provides a comprehensive logging infrastructure with:
 * - Multiple transport support (console, file)
 * - Advanced error handling and formatting
 * - Health monitoring and auto-recovery
 * - Failover capabilities
 * - Structured logging
 */

export { Logger } from './logger.js';
export { FileTransport } from './file-transport.js';
export { TransportManager } from './transport-manager.js';
export { ErrorFormatter } from './error-formatter.js';
export { LoggerHealthMonitor } from './health-monitor.js';

// Re-export types
export type {
  LogLevel,
  LoggerConfig,
  LogEntry,
  LogMetadata,
  LoggerTransportConfig,
  LoggerHealthStatus,
  LoggerRecoveryOptions,
} from '../types/logging.js';

// Export log levels
export { LogLevels } from '../types/logging.js';
