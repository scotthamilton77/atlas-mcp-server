#!/usr/bin/env node

import fs from 'fs/promises';
import { platform } from 'os';

const makeExecutable = async () => {
  try {
    // Only chmod on Unix-like systems
    if (platform() !== 'win32') {
      await fs.chmod('dist/index.js', 0o755);
      console.log('Made dist/index.js executable');
    }
  } catch (error) {
    console.error('Error making file executable:', error);
    process.exit(1);
  }
};

makeExecutable();