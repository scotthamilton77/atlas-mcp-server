#!/usr/bin/env node
/**
 * Post-installation setup script.
 * 
 * Execution: Automatically run by npm after package installation
 * Command: npm install -> prepare script -> postinstall.js
 * 
 * Purpose:
 * 1. Creates the initial build directory structure
 * 2. Sets up build file permissions in non-strict mode
 *    - Non-strict means it won't fail the installation if permission setting fails
 *    - This is important because the build files might not exist yet
 * 
 * Note: This script uses the simplified platform-utils.js (not the TypeScript version)
 * because it runs before the TypeScript compilation and before node_modules is fully set up.
 */

import { setBuildPermissions, ensureBuildDirectory } from './build-utils.js';

async function postInstall() {
  await ensureBuildDirectory();
}

postInstall().catch(error => {
  console.warn('Warning: Post-install tasks failed:', error.message);
});
