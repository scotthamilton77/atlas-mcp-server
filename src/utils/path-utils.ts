import { createError, ErrorCodes } from '../errors/index.js';

/**
 * Utilities for handling task paths with validation and normalization
 */
export class PathUtils {
  /**
   * Normalizes a path string by:
   * - Converting to lowercase
   * - Replacing spaces with hyphens
   * - Removing invalid characters
   * - Normalizing slashes
   */
  static normalize(path: string): string {
    // First convert Windows backslashes to forward slashes
    const normalized = path.replace(/\\/g, '/');
    
    return normalized.toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-\/]/g, '')
      .replace(/\/+/g, '/') // Normalize multiple slashes to single
      .replace(/^\/+|\/+$/g, ''); // Trim leading/trailing slashes
  }

  /**
   * Extracts the project path (first segment) from a full path
   */
  static getProjectPath(path: string): string {
    const normalized = this.normalize(path);
    const segments = normalized.split('/');
    if (segments.length === 0) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Invalid path: empty path'
      );
    }
    return segments[0];
  }

  /**
   * Checks if a path is a valid subpath of another path
   */
  static isSubPath(parentPath: string, childPath: string): boolean {
    const normalizedParent = this.normalize(parentPath);
    const normalizedChild = this.normalize(childPath);
    return normalizedChild.startsWith(`${normalizedParent}/`);
  }

  /**
   * Generates a valid path from a name and optional parent path
   */
  static generatePath(name: string, parentPath?: string): string {
    const safeName = this.normalize(name);
    if (!safeName) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Invalid name: cannot generate path from empty name'
      );
    }
    return parentPath ? `${this.normalize(parentPath)}/${safeName}` : safeName;
  }

  /**
   * Validates a path string against path requirements
   * Throws an error if the path is invalid
   */
  static validatePath(path: string): void {
    if (!path) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Path cannot be empty'
      );
    }

    const normalized = this.normalize(path);
    
    // Check for full path format
    if (!normalized.includes('/')) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Path must be fully qualified (e.g., "project/feature/task")'
      );
    }

    // Validate path format (allow both forward and backslashes in input, but normalize to forward slashes)
    const pathRegex = /^[a-z0-9-]+(?:[\/\\][a-z0-9-]+)*$/;
    if (!pathRegex.test(normalized)) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Path must contain only letters, numbers, hyphens, and forward slashes'
      );
    }

    // Check path depth (prevent excessive nesting)
    const depth = normalized.split('/').length;
    if (depth > 10) {
      throw createError(
        ErrorCodes.INVALID_INPUT,
        'Path depth exceeds maximum allowed (10 levels)'
      );
    }
  }

  /**
   * Gets the parent path of a given path
   * Returns null if the path has no parent (is a root path)
   */
  static getParentPath(path: string): string | null {
    const normalized = this.normalize(path);
    const lastSlashIndex = normalized.lastIndexOf('/');
    return lastSlashIndex === -1 ? null : normalized.substring(0, lastSlashIndex);
  }

  /**
   * Gets the name (last segment) of a path
   */
  static getName(path: string): string {
    const normalized = this.normalize(path);
    const segments = normalized.split('/');
    return segments[segments.length - 1];
  }
}
