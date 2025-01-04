#!/usr/bin/env node
/**
 * Simplified platform utilities for build and installation scripts.
 * 
 * IMPORTANT: This is a lightweight version of src/utils/platform-utils.ts specifically for build scripts.
 * We need this separate implementation because:
 * 1. Build scripts run before TypeScript compilation, so we can't import from src/
 * 2. Installation scripts need these utilities before node_modules is populated
 * 3. We want to avoid circular dependencies during the build process
 * 
 * This file provides only the essential platform-specific functionality needed for:
 * - Directory creation and permissions
 * - File mode handling
 * - Cross-platform compatibility
 * 
 * For the full platform utilities used during server runtime, see src/utils/platform-utils.ts
 * 
 * Script Execution Order:
 * 1. npm install -> postinstall.js -> platform-utils.js
 * 2. npm run build -> set-build-permissions.js -> platform-utils.js
 * 3. npm start -> prestart.js -> platform-utils.js
 */

import { platform } from 'os';
import { promises as fs } from 'fs';

// Get appropriate file mode based on platform
export const getFileMode = () => {
  return platform() === 'win32' ? undefined : 0o755;
};

export async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectoryPermissions(path, mode) {
  try {
    await fs.mkdir(path, { recursive: true, mode: getFileMode() });
    
    // Verify permissions on Unix-like systems
    if (platform() !== 'win32') {
      try {
        await fs.access(path, fs.constants.R_OK | fs.constants.W_OK);
      } catch (error) {
        throw new Error(`Directory ${path} is not readable/writable: ${error.message}`);
      }
    }
    return true;
  } catch (error) {
    throw new Error(`Failed to ensure directory permissions: ${error.message}`);
  }
}
