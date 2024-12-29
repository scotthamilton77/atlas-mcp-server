import { createError, ErrorCodes } from '../errors/index.js';

/**
 * Path validation and manipulation utilities
 */
export class PathUtils {
  private static readonly PATH_SEPARATOR = '/';
  private static readonly VALID_PATH_REGEX = /^[a-zA-Z0-9-_/]+$/;
  private static readonly MAX_PATH_LENGTH = 255;
  private static readonly MAX_SEGMENTS = 10;

  /**
   * Validates a path string
   */
  static validatePath(path: string): void {
    if (!path) {
      throw createError(
        ErrorCodes.VALIDATION_ERROR,
        'Path cannot be empty',
        'PathUtils.validatePath',
        'Please provide a valid path'
      );
    }

    if (path.length > this.MAX_PATH_LENGTH) {
      throw createError(
        ErrorCodes.VALIDATION_ERROR,
        `Path exceeds maximum length of ${this.MAX_PATH_LENGTH} characters`,
        'PathUtils.validatePath',
        'Path is too long'
      );
    }

    if (!this.VALID_PATH_REGEX.test(path)) {
      throw createError(
        ErrorCodes.VALIDATION_ERROR,
        'Path contains invalid characters',
        'PathUtils.validatePath',
        'Path can only contain letters, numbers, hyphens, and underscores'
      );
    }

    const segments = this.splitPath(path);
    if (segments.length > this.MAX_SEGMENTS) {
      throw createError(
        ErrorCodes.VALIDATION_ERROR,
        `Path has too many segments (max: ${this.MAX_SEGMENTS})`,
        'PathUtils.validatePath',
        'Path has too many segments'
      );
    }

    for (const segment of segments) {
      if (!segment) {
        throw createError(
          ErrorCodes.VALIDATION_ERROR,
          'Path contains empty segments',
          'PathUtils.validatePath',
          'Path segments cannot be empty'
        );
      }
    }
  }

  /**
   * Splits a path into segments
   */
  static splitPath(path: string): string[] {
    return path.split(this.PATH_SEPARATOR).filter(Boolean);
  }

  /**
   * Joins path segments
   */
  static joinPath(...segments: string[]): string {
    return segments.filter(Boolean).join(this.PATH_SEPARATOR);
  }

  /**
   * Gets the parent path
   */
  static getParentPath(path: string): string {
    const segments = this.splitPath(path);
    if (segments.length <= 1) {
      throw createError(
        ErrorCodes.VALIDATION_ERROR,
        'Cannot get parent of root path',
        'PathUtils.getParentPath',
        'This path has no parent'
      );
    }
    return segments.slice(0, -1).join(this.PATH_SEPARATOR);
  }

  /**
   * Gets the last segment of a path
   */
  static getBaseName(path: string): string {
    const segments = this.splitPath(path);
    if (!segments.length) {
      throw createError(
        ErrorCodes.VALIDATION_ERROR,
        'Cannot get base name of empty path',
        'PathUtils.getBaseName',
        'Path is empty'
      );
    }
    return segments[segments.length - 1];
  }

  /**
   * Checks if a path is a child of another path
   */
  static isChildPath(parentPath: string, childPath: string): boolean {
    if (!parentPath || !childPath) {
      return false;
    }
    const parentSegments = this.splitPath(parentPath);
    const childSegments = this.splitPath(childPath);
    if (childSegments.length <= parentSegments.length) {
      return false;
    }
    return parentSegments.every((segment, index) => segment === childSegments[index]);
  }

  /**
   * Gets the relative path from one path to another
   */
  static getRelativePath(from: string, to: string): string {
    const fromSegments = this.splitPath(from);
    const toSegments = this.splitPath(to);
    let commonPrefixLength = 0;

    // Find common prefix
    while (
      commonPrefixLength < fromSegments.length &&
      commonPrefixLength < toSegments.length &&
      fromSegments[commonPrefixLength] === toSegments[commonPrefixLength]
    ) {
      commonPrefixLength++;
    }

    // Build relative path
    const upCount = fromSegments.length - commonPrefixLength;
    const upSegments = Array(upCount).fill('..');
    const downSegments = toSegments.slice(commonPrefixLength);

    return [...upSegments, ...downSegments].join(this.PATH_SEPARATOR);
  }
}
