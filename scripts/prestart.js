#!/usr/bin/env node
/**
 * Pre-start validation script.
 * 
 * Execution: Automatically run before server startup
 * Command: npm start -> prestart.js -> node build/index.js
 * 
 * Purpose:
 * 1. Validates script directory permissions before server startup
 * 2. Ensures the environment is properly set up for execution
 * 3. Fails fast if there are permission issues
 * 
 * This script runs in strict mode - if permissions can't be verified,
 * the server won't start. This prevents runtime permission issues
 * that could cause problems during server operation.
 * 
 * Script Execution Order:
 * 1. npm start
 * 2. prestart.js (this file) validates environment
 * 3. If validation passes, server starts
 * 4. If validation fails, startup is aborted
 */

import { ensureDirectoryPermissions } from './platform-utils.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function ensureScriptPermissions() {
  try {
    await ensureDirectoryPermissions(__dirname);
    console.log('Script permissions verified');
  } catch (error) {
    console.error('Failed to verify script permissions:', error);
    process.exit(1);
  }
}

ensureScriptPermissions().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
