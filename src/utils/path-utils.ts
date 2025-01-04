/**
 * Path utilities for task and template management
 */
export class PathUtils {
  /**
   * Normalize a path by removing leading/trailing slashes and extra spaces
   */
  static normalizePath(path: string): string {
    return path
      .trim()
      .replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
      .replace(/\/+/g, '/'); // Replace multiple slashes with single slash
  }

  /**
   * Join path segments, ensuring proper normalization
   */
  static joinPath(...segments: string[]): string {
    return this.normalizePath(segments.join('/'));
  }

  /**
   * Get parent path from a path string
   */
  static getParentPath(path: string): string | undefined {
    const normalized = this.normalizePath(path);
    const lastSlashIndex = normalized.lastIndexOf('/');
    return lastSlashIndex > 0 ? normalized.substring(0, lastSlashIndex) : undefined;
  }

  /**
   * Get the last segment of a path
   */
  static getLastSegment(path: string): string {
    const normalized = this.normalizePath(path);
    const lastSlashIndex = normalized.lastIndexOf('/');
    return lastSlashIndex >= 0 ? normalized.substring(lastSlashIndex + 1) : normalized;
  }

  /**
   * Check if a path is a child of another path
   */
  static isChildPath(parentPath: string, childPath: string): boolean {
    const normalizedParent = this.normalizePath(parentPath);
    const normalizedChild = this.normalizePath(childPath);
    return (
      normalizedChild.startsWith(normalizedParent + '/') &&
      normalizedChild.length > normalizedParent.length + 1
    );
  }

  /**
   * Get path depth (number of segments)
   */
  static getPathDepth(path: string): number {
    return this.normalizePath(path).split('/').length;
  }

  /**
   * Get path segments
   */
  static getPathSegments(path: string): string[] {
    return this.normalizePath(path).split('/');
  }

  /**
   * Check if path is valid (follows naming conventions)
   */
  static isValidPath(path: string): boolean {
    // Must start with a letter
    if (!/^[a-zA-Z]/.test(path)) {
      return false;
    }

    // Check allowed characters
    if (!/^[a-zA-Z0-9-_/]+$/.test(path)) {
      return false;
    }

    // Check segment length
    const segments = path.split('/');
    if (segments.some(s => s.length > 50)) {
      return false;
    }

    // Check depth
    if (segments.length > 10) {
      return false;
    }

    return true;
  }

  /**
   * Get common parent path between two paths
   */
  static getCommonParentPath(path1: string, path2: string): string | undefined {
    const segments1 = this.getPathSegments(path1);
    const segments2 = this.getPathSegments(path2);
    const commonSegments: string[] = [];

    for (let i = 0; i < Math.min(segments1.length, segments2.length); i++) {
      if (segments1[i] === segments2[i]) {
        commonSegments.push(segments1[i]);
      } else {
        break;
      }
    }

    return commonSegments.length > 0 ? commonSegments.join('/') : undefined;
  }

  /**
   * Get relative path from one path to another
   */
  static getRelativePath(from: string, to: string): string {
    const fromSegments = this.getPathSegments(from);
    const toSegments = this.getPathSegments(to);
    const commonParent = this.getCommonParentPath(from, to);

    if (!commonParent) {
      return to; // No common parent, return absolute path
    }

    const commonSegments = this.getPathSegments(commonParent);
    const upCount = fromSegments.length - commonSegments.length;
    const downSegments = toSegments.slice(commonSegments.length);

    const relativePath = [...Array(upCount).fill('..'), ...downSegments];

    return relativePath.join('/');
  }
}
