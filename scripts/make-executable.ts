#!/usr/bin/env node

/**
 * Make Executable Script
 * ======================
 * 
 * Description:
 *   A cross-platform utility that makes script files executable (chmod +x) on Unix-like systems.
 *   On Windows, this script does nothing but exits successfully (as chmod is not applicable).
 *   Useful for CLI applications or tools where the built output needs to be executable.
 * 
 * Usage:
 *   - Add to package.json: "postbuild": "node dist/scripts/make-executable.js"
 *   - Run directly: npm run make-executable
 *   - Specify custom file(s): node dist/scripts/make-executable.js dist/cli.js bin/tool.js
 *   - Default target: dist/index.js (if no arguments are provided)
 * 
 * Platform compatibility:
 *   - Runs on all platforms but only performs chmod on Unix-like systems (Linux, macOS)
 *   - On Windows, the script will succeed without performing any action
 * 
 * Common use case:
 *   - For Node.js CLI applications where the entry point needs executable permissions
 *   - Often used as a postbuild script to ensure the built output is executable
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Get platform information
const isUnix = os.platform() !== 'win32';

// File permissions
const EXECUTABLE_MODE = 0o755; // rwxr-xr-x

/**
 * Interface for the result of making a file executable
 */
interface ExecutableResult {
  file: string;
  status: 'success' | 'error';
  reason?: string;
}

/**
 * Main function to make files executable
 */
const makeExecutable = async (): Promise<void> => {
  try {
    // Get target files from command line arguments or use default
    const targetFiles: string[] = process.argv.slice(2).length > 0 
      ? process.argv.slice(2) 
      : ['dist/index.js'];
    
    if (!isUnix) {
      console.log('Windows detected. Skipping chmod operation (not applicable).');
      console.log('Note: On Windows, executable permissions are not required to run scripts.');
      return;
    }
    
    console.log('Making files executable...');
    
    const results = await Promise.allSettled(
      targetFiles.map(async (targetFile): Promise<ExecutableResult> => {
        const normalizedPath = path.resolve(process.cwd(), targetFile);
        
        try {
          // Check if file exists
          await fs.access(normalizedPath);
          
          // Make file executable
          await fs.chmod(normalizedPath, EXECUTABLE_MODE);
          return { file: targetFile, status: 'success' };
        } catch (error) {
          const err = error as Error;
          if ('code' in err && err.code === 'ENOENT') {
            return { file: targetFile, status: 'error', reason: 'File not found' };
          }
          throw error;
        }
      })
    );
    
    // Report results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { file, status, reason } = result.value;
        if (status === 'success') {
          console.log(`✓ Made executable: ${file}`);
        } else {
          console.error(`× ${file}: ${reason}`);
        }
      } else {
        console.error(`× Error: ${result.reason}`);
      }
    }
  } catch (error) {
    console.error('× Error making files executable:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

// Execute the makeExecutable function
makeExecutable();