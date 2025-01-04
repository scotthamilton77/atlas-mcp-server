#!/usr/bin/env node
/**
 * Build permissions setup script.
 * 
 * Execution: Run as part of the build process
 * Command: npm run build -> tsc -> set-build-permissions.js
 * 
 * Purpose:
 * 1. Sets executable permissions on the compiled build/index.js
 * 2. Runs in strict mode (will fail the build if permissions can't be set)
 *    - Strict mode is appropriate here because the build files must exist
 *    - Proper permissions are critical for the executable to work
 * 
 * This script runs after TypeScript compilation to ensure the build files
 * are properly executable, especially on Unix-like systems where file
 * permissions are enforced.
 */

import { setBuildPermissions } from './build-utils.js';

// Set build permissions with strict error handling
setBuildPermissions(true).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
