import { homedir, platform, totalmem } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';

// Platform-specific error codes
const PERMISSION_ERROR_CODES = {
  win32: ['EPERM', 'EACCES'],
  unix: ['EACCES'],
};

export class PlatformPaths {
  private static readonly PLATFORM = platform();

  static getDocumentsDir(): string {
    switch (this.PLATFORM) {
      case 'win32':
        return process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Documents') : join(homedir(), 'Documents');
      case 'darwin':
        return join(homedir(), 'Documents');
      default:
        // Linux and others - check XDG first
        const xdgDocuments = process.env.XDG_DOCUMENTS_DIR;
        return xdgDocuments || join(homedir(), 'Documents');
    }
  }

  static getConfigDir(): string {
    switch (this.PLATFORM) {
      case 'win32':
        return process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
      case 'darwin':
        return join(homedir(), 'Library', 'Application Support');
      default:
        // Linux and others - respect XDG
        return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
    }
  }

  static getCacheDir(): string {
    switch (this.PLATFORM) {
      case 'win32':
        return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
      case 'darwin':
        return join(homedir(), 'Library', 'Caches');
      default:
        // Linux and others - respect XDG
        return process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
    }
  }

  static normalizePath(path: string): string {
    return path.split(/[/\\]/).join(this.PLATFORM === 'win32' ? '\\' : '/');
  }

  static getAppDataDir(appName: string): string {
    switch (this.PLATFORM) {
      case 'win32':
        return join(process.env.APPDATA || homedir(), appName);
      case 'darwin':
        return join(homedir(), 'Library', 'Application Support', appName);
      default:
        return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), appName);
    }
  }
}

export class PlatformCapabilities {
  private static readonly PLATFORM = platform();

  static getDefaultMode(): number {
    return this.PLATFORM === 'win32' 
      ? 0o666  // Windows ignores modes
      : 0o755; // Unix-like systems
  }

  static getFileMode(mode: number): number {
    // Windows ignores file modes, return as-is
    if (this.PLATFORM === 'win32') {
      return this.getDefaultMode();
    }
    // Unix-like systems use the mode as specified
    return mode;
  }

  static getSqliteConfig(): {pageSize: number; sharedMemory: boolean} {
    return {
      // Windows: larger page size for NTFS
      pageSize: this.PLATFORM === 'win32' ? 8192 : 4096,
      // Unix: enable shared memory where supported
      sharedMemory: this.PLATFORM !== 'win32',
    };
  }

  static isPermissionError(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) {
      return false;
    }
    
    const errorCode = (error as {code: string}).code;
    return this.PLATFORM === 'win32'
      ? PERMISSION_ERROR_CODES.win32.includes(errorCode)
      : PERMISSION_ERROR_CODES.unix.includes(errorCode);
  }

  static getMaxMemory(): number {
    const GB = 1024 * 1024 * 1024;
    // Get available system memory
    try {
      const totalMem = totalmem();
      // Use 25% of total memory up to 4GB
      return Math.min(Math.floor(totalMem * 0.25), 4 * GB);
    } catch {
      // Fallback to conservative defaults
      switch (this.PLATFORM) {
        case 'win32':
          return 2 * GB;
        case 'darwin':
          return 4 * GB;
        default:
          return 2 * GB;
      }
    }
  }

  static getProcessSignals(): NodeJS.Signals[] {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    if (this.PLATFORM !== 'win32') {
      signals.push('SIGHUP', 'SIGUSR2');
    }
    return signals;
  }

  static async ensureDirectoryPermissions(path: string, mode: number): Promise<void> {
    await fs.mkdir(path, { recursive: true, mode: this.getFileMode(mode) });
    
    // Verify permissions
    if (this.PLATFORM !== 'win32') {
      try {
        await fs.access(path, fs.constants.R_OK | fs.constants.W_OK);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Directory ${path} is not readable/writable: ${message}`);
      }
    }
  }
}

export class ProcessManager {
  private static cleanupHandlers: Array<() => Promise<void>> = [];
  private static isShuttingDown = false;
  private static logger?: {
    info: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
  };

  static setLogger(logger: { info: (message: string, ...args: any[]) => void; error: (message: string, ...args: any[]) => void }): void {
    this.logger = logger;
  }

  static registerCleanupHandler(handler: () => Promise<void>): void {
    this.cleanupHandlers.push(handler);
  }

  static async cleanup(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    for (const handler of this.cleanupHandlers.reverse()) {
      try {
        await handler();
      } catch (error) {
        this.logger?.error('Cleanup handler failed:', error);
      }
    }
  }

  static setupSignalHandlers(): void {
    const signals = PlatformCapabilities.getProcessSignals();
    
    for (const signal of signals) {
      process.once(signal, async () => {
        this.logger?.info(`Received ${signal}, cleaning up...`);
        await this.cleanup();
        process.exit(0);
      });
    }

    process.on('uncaughtException', async (error) => {
      this.logger?.error('Uncaught Exception:', error);
      await this.cleanup();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      this.logger?.error('Unhandled Rejection:', reason);
      await this.cleanup();
      process.exit(1);
    });
  }
}
