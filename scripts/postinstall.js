#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable no-process-exit */
import { chmod } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function setBuildPermissions() {
  try {
    const buildPath = join(__dirname, '..', 'build', 'index.js');
    await chmod(buildPath, 0o755);
    console.log('Build file permissions set successfully');
  } catch (error) {
    console.error('Error setting build file permissions:', error);
    process.exit(1);
  }
}

setBuildPermissions().catch(error => {
  console.error('Failed to set build permissions:', error);
  process.exit(1);
});
