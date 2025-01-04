#!/usr/bin/env node
/**
 * Shared utilities for build and installation scripts.
 * 
 * This module centralizes common functionality used across multiple build scripts:
 * - Directory path management
 * - Build directory creation
 * - Permission handling
 * 
 * Script Execution Flow:
 * 1. postinstall.js:
 *    - Creates initial build directory
 *    - Sets permissions (non-strict mode)
 * 
 * 2. npm run build:
 *    - TypeScript compilation
 *    - set-build-permissions.js (strict mode)
 * 
 * Common paths and utilities are exported here to ensure consistency
 * across all build scripts and avoid duplication.
 */

import { getFileMode, ensureDirectoryPermissions } from './platform-utils.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Essential paths used across build scripts
export const __dirname = dirname(fileURLToPath(import.meta.url));
export const projectRoot = join(__dirname, '..');
export const buildPath = join(projectRoot, 'build');
export const buildIndexPath = join(buildPath, 'index.js');

export async function ensureBuildDirectory() {
  try {
    await ensureDirectoryPermissions(buildPath);
    console.log('Build directory ready');
    return true;
  } catch (error) {
    console.error('Failed to prepare build directory:', error.message);
    return false;
  }
}

export async function setBuildPermissions(exitOnError = false) {
  try {
    const mode = getFileMode();
    if (mode !== undefined) {
      await fs.chmod(buildIndexPath, mode);
      console.log('Build permissions set successfully');
    } else {
      console.log('Skipping build permissions on Windows');
    }
    return true;
  } catch (error) {
    const message = `Failed to set build permissions: ${error.message}`;
    if (exitOnError) {
      console.error(message);
      process.exit(1);
    } else {
      console.warn('Warning:', message);
    }
    return false;
  }
}
