#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable no-process-exit */
import { chmod } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function checkPermissions() {
  try {
    await chmod(__dirname, 0o755);
    console.log('Script permissions verified');
  } catch (error) {
    console.error('Error checking permissions:', error);
    process.exit(1);
  }
}

checkPermissions().catch(error => {
  console.error('Failed to check permissions:', error);
  process.exit(1);
});
