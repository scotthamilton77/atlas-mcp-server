import { homedir, platform, type } from 'os';
import { join } from 'path';

/**
 * Platform-specific path resolver for special directories
 */
export class PlatformPaths {
  /**
   * Get user's home directory in a platform-agnostic way
   */
  static getHomeDir(): string {
    return homedir();
  }

  /**
   * Get documents directory path in a platform-agnostic way
   */
  static getDocumentsDir(): string {
    const home = this.getHomeDir();

    switch (platform()) {
      case 'win32':
        // Windows: \Users\username\Documents
        return join(home, 'Documents');
      case 'darwin':
        // macOS: /Users/username/Documents
        return join(home, 'Documents');
      case 'linux':
        // Linux: Try XDG standard first, fall back to ~/Documents
        const xdgDocuments = process.env.XDG_DOCUMENTS_DIR;
        if (xdgDocuments) {
          return xdgDocuments;
        }
        return join(home, 'Documents');
      default:
        // Default fallback
        return join(home, 'Documents');
    }
  }

  /**
   * Get application data directory in a platform-agnostic way
   */
  static getAppDataDir(appName: string): string {
    const home = this.getHomeDir();

    switch (platform()) {
      case 'win32':
        // Windows: \Users\username\AppData\Local\appName
        return join(home, 'AppData', 'Local', appName);
      case 'darwin':
        // macOS: /Users/username/Library/Application Support/appName
        return join(home, 'Library', 'Application Support', appName);
      case 'linux':
        // Linux: ~/.local/share/appName (XDG standard)
        const xdgData = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
        return join(xdgData, appName);
      default:
        // Default fallback
        return join(home, '.' + appName);
    }
  }

  /**
   * Get temporary directory in a platform-agnostic way
   */
  static getTempDir(appName: string): string {
    const tmpDir = process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
    return join(tmpDir, appName);
  }
}

/**
 * Platform capability detection and feature checks
 */
export class PlatformCapabilities {
  /**
   * Check if running on Windows
   */
  static isWindows(): boolean {
    return platform() === 'win32';
  }

  /**
   * Check if running on macOS
   */
  static isMacOS(): boolean {
    return platform() === 'darwin';
  }

  /**
   * Check if running on Linux
   */
  static isLinux(): boolean {
    return platform() === 'linux';
  }

  /**
   * Check if platform supports file permissions
   */
  static supportsFilePermissions(): boolean {
    return !this.isWindows();
  }

  /**
   * Check if platform supports symbolic links
   */
  static supportsSymlinks(): boolean {
    // Windows supports symlinks but requires special privileges
    if (this.isWindows()) {
      try {
        // Try to create a test symlink
        const { execSync } = require('child_process');
        execSync('mklink /?');
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Get platform-specific file mode
   * @param mode Unix-style file mode (e.g. 0o755)
   * @returns File mode appropriate for current platform
   */
  static getFileMode(mode: number): number | undefined {
    return this.supportsFilePermissions() ? mode : undefined;
  }

  /**
   * Get system architecture information
   */
  static getArchInfo(): {
    platform: string;
    arch: string;
    type: string;
  } {
    return {
      platform: platform(),
      arch: process.arch,
      type: type(),
    };
  }
}
