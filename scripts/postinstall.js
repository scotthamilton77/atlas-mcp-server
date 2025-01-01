#!/usr/bin/env node
/* eslint-disable no-console */
import { chmod, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Only set executable permissions on Unix-like systems
const getFileMode = () => {
  return platform() === 'win32' ? undefined : 0o755;
};

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function setBuildPermissions() {
  const buildPath = join(__dirname, '..', 'build', 'index.js');
  const fileMode = getFileMode();

  // Skip permission setting on Windows
  if (fileMode === undefined) {
    console.log('Skipping build permissions on Windows');
    return;
  }

  try {
    // Check if build file exists
    if (!await fileExists(buildPath)) {
      console.log('Build file not found - this is normal during first install');
      console.log('Permissions will be set during build');
      return;
    }

    await chmod(buildPath, fileMode);
    console.log('Build file permissions set successfully');
  } catch (error) {
    // Log error but don't exit - this allows npm install to complete
    console.warn('Warning: Could not set build permissions:', error.message);
    console.log('You may need to run "npm run build" to compile the project');
  }
}

setBuildPermissions().catch(error => {
  console.warn('Warning: Permission setting failed:', error.message);
});
