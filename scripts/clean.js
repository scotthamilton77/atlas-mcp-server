#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const clean = async () => {
  try {
    const distPath = path.join(process.cwd(), 'dist');
    
    // Check if directory exists before attempting removal
    try {
      await fs.access(distPath);
      await fs.rm(distPath, { recursive: true, force: true });
      console.log('Successfully cleaned dist directory');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('dist directory does not exist, skipping cleanup');
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
};

clean();