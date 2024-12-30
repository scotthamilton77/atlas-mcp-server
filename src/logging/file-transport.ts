import { promises as fs } from 'fs';
import { dirname } from 'path';
import { createWriteStream, WriteStream } from 'fs';
import { LogEntry, LoggerTransportConfig, LogLevel, LogLevels } from '../types/logging.js';
import { LoggingErrorFactory } from '../errors/logging-error.js';

/**
 * Queue entry for log writes
 */
interface QueueEntry {
  entry: LogEntry;
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * Transport state
 */
interface TransportState {
  isInitialized: boolean;
  isClosed: boolean;
  isProcessingQueue: boolean;
  currentFileSize: number;
  lastRotateCheck: number;
}

/**
 * File transport for logging with advanced features
 */
export class FileTransport {
  private writeStream?: WriteStream;
  private writeQueue: QueueEntry[] = [];
  private initializePromise?: Promise<void>;
  private readonly ROTATE_CHECK_INTERVAL = 5000; // 5 seconds

  private state: TransportState = {
    isInitialized: false,
    isClosed: false,
    isProcessingQueue: false,
    currentFileSize: 0,
    lastRotateCheck: 0,
  };

  constructor(
    private readonly config: LoggerTransportConfig['options'] & {
      filename: string;
      maxsize: number;
    }
  ) {}

  /**
   * Determines if a log level should be recorded based on minimum level
   */
  private shouldLog(level: LogLevel): boolean {
    const levelValues: Record<LogLevel, number> = {
      [LogLevels.ERROR]: 50,
      [LogLevels.WARN]: 40,
      [LogLevels.INFO]: 30,
      [LogLevels.HTTP]: 20,
      [LogLevels.DEBUG]: 10,
      [LogLevels.VERBOSE]: 5,
      [LogLevels.SILLY]: 1,
    };

    const configLevel = this.config.minLevel?.toLowerCase() || LogLevels.DEBUG;
    const minLevelValue = levelValues[configLevel as LogLevel] || levelValues[LogLevels.DEBUG];
    const currentLevelValue = levelValues[level];

    return currentLevelValue >= minLevelValue;
  }

  /**
   * Ensures the log directory exists
   */
  private async ensureDirectory(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      throw LoggingErrorFactory.createDirectoryError(
        'FileTransport.ensureDirectory',
        dir,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Gets current file size if exists
   */
  private async getCurrentFileSize(): Promise<number> {
    try {
      const stats = await fs.stat(this.config.filename);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Initializes the transport
   */
  async initialize(): Promise<void> {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = (async () => {
      try {
        const dir = dirname(this.config.filename);
        await this.ensureDirectory(dir);
        this.state.currentFileSize = await this.getCurrentFileSize();
        await this.createWriteStream();
        this.state.isInitialized = true;
      } catch (error) {
        throw LoggingErrorFactory.createInitError(
          'FileTransport.initialize',
          error instanceof Error ? error : new Error(String(error))
        );
      }
    })();

    return this.initializePromise;
  }

  /**
   * Creates or recreates the write stream
   */
  private async createWriteStream(): Promise<void> {
    try {
      if (this.writeStream) {
        await this.closeStream();
      }

      await this.ensureDirectory(dirname(this.config.filename));
      this.writeStream = createWriteStream(this.config.filename, { flags: 'a' });

      this.writeStream.on('error', error => {
        this.handleStreamError(error).catch(err => {
          throw LoggingErrorFactory.createTransportError(
            'FileTransport.createWriteStream',
            new Error(error.message + ' - ' + (err instanceof Error ? err.message : String(err)))
          );
        });
      });

      this.writeStream.on('finish', () => {
        this.state.currentFileSize = 0;
      });
    } catch (error) {
      throw LoggingErrorFactory.createTransportError(
        'FileTransport.createWriteStream',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Writes a log entry
   */
  async write(entry: LogEntry): Promise<void> {
    if (this.state.isClosed) {
      throw LoggingErrorFactory.createTransportError(
        'FileTransport.write',
        new Error('Transport is closed')
      );
    }

    if (entry.level !== LogLevels.ERROR && !this.shouldLog(entry.level)) {
      return;
    }

    if (!this.writeStream) {
      await this.initialize();
    }

    return new Promise<void>((resolve, reject) => {
      this.writeQueue.push({ entry, resolve, reject });
      this.processQueueAsync().catch(reject);
    });
  }

  /**
   * Processes the write queue asynchronously
   */
  private async processQueueAsync(): Promise<void> {
    if (this.state.isProcessingQueue || this.writeQueue.length === 0) {
      return;
    }

    this.state.isProcessingQueue = true;

    try {
      while (this.writeQueue.length > 0) {
        await this.checkRotation();

        const { entry, resolve, reject } = this.writeQueue[0];
        try {
          await this.writeEntry(entry);
          this.writeQueue.shift();
          resolve();
        } catch (error) {
          this.writeQueue.shift();
          reject(
            LoggingErrorFactory.createWriteError(
              'FileTransport.processQueue',
              error instanceof Error ? error : new Error(String(error))
            )
          );
        }
      }
    } finally {
      this.state.isProcessingQueue = false;
    }
  }

  /**
   * Writes a single entry
   */
  private async writeEntry(entry: LogEntry): Promise<void> {
    if (!this.writeStream) {
      throw LoggingErrorFactory.createTransportError(
        'FileTransport.writeEntry',
        new Error('Write stream not initialized')
      );
    }

    const line = JSON.stringify(entry) + '\n';
    const buffer = Buffer.from(line);

    return new Promise<void>((resolve, reject) => {
      if (!this.writeStream) {
        reject(
          LoggingErrorFactory.createTransportError(
            'FileTransport.writeEntry',
            new Error('Write stream not initialized')
          )
        );
        return;
      }

      this.writeStream.write(buffer, writeError => {
        if (writeError) {
          reject(LoggingErrorFactory.createWriteError('FileTransport.writeEntry', writeError));
          return;
        }

        this.state.currentFileSize += buffer.length;
        resolve();
      });
    });
  }

  /**
   * Checks if log rotation is needed
   */
  private async checkRotation(): Promise<void> {
    const now = Date.now();
    if (now - this.state.lastRotateCheck < this.ROTATE_CHECK_INTERVAL) {
      return;
    }

    this.state.lastRotateCheck = now;

    if (this.state.currentFileSize >= this.config.maxsize) {
      await this.rotateLog();
    }
  }

  /**
   * Rotates log files
   */
  private async rotateLog(): Promise<void> {
    if (!this.writeStream) {
      return;
    }

    try {
      await this.closeStream();

      for (let i = this.config.maxFiles || 5; i > 0; i--) {
        const fromFile = i === 1 ? this.config.filename : `${this.config.filename}.${i - 1}`;
        const toFile = `${this.config.filename}.${i}`;

        try {
          await fs.rename(fromFile, toFile);
        } catch {
          // Ignore errors if files don't exist
        }
      }

      await this.createWriteStream();
      this.state.currentFileSize = 0;
    } catch (error) {
      throw LoggingErrorFactory.createRotationError(
        'FileTransport.rotateLog',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Handles stream errors
   */
  private async handleStreamError(error: Error): Promise<void> {
    try {
      await this.createWriteStream();
    } catch (err) {
      throw LoggingErrorFactory.createTransportError(
        'FileTransport.handleStreamError',
        new Error(
          error.message + ' - ' + (err instanceof Error ? err : new Error(String(err))).message
        )
      );
    }
  }

  /**
   * Closes the write stream
   */
  private async closeStream(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.writeStream) {
        resolve();
        return;
      }

      this.writeStream.end(() => {
        this.writeStream = undefined;
        resolve();
      });

      this.writeStream.on('error', error => {
        reject(LoggingErrorFactory.createTransportError('FileTransport.closeStream', error));
      });
    });
  }

  /**
   * Closes the transport
   */
  async close(): Promise<void> {
    if (this.state.isClosed) {
      return;
    }

    try {
      if (this.writeQueue.length > 0) {
        await this.processQueueAsync();
      }

      await this.closeStream();
      this.state.isClosed = true;
    } catch (error) {
      throw LoggingErrorFactory.createTransportError(
        'FileTransport.close',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Gets current transport status
   */
  async getStatus(): Promise<{
    active: boolean;
    currentFileSize: number;
    queueLength: number;
    error?: string;
  }> {
    try {
      const stats = await fs.stat(this.config.filename);
      return {
        active: !!this.writeStream,
        currentFileSize: stats.size,
        queueLength: this.writeQueue.length,
      };
    } catch {
      return {
        active: false,
        currentFileSize: 0,
        queueLength: this.writeQueue.length,
      };
    }
  }
}
