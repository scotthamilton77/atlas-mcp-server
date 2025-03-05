#!/usr/bin/env node

/**
 * Dependency Updater Script
 * =========================
 * 
 * Description:
 *   A cross-platform utility script that automates updating package.json dependencies
 *   to their latest versions using npm-check-updates. This script helps keep your
 *   project up-to-date with the latest package versions available.
 * 
 * Usage:
 *   - Add to package.json: "update-deps": "node dist/scripts/update-deps.js"
 *   - Run directly: npm run update-deps
 *   - With specific packages: node dist/scripts/update-deps.js react react-dom
 *   - With options: node dist/scripts/update-deps.js --target minor
 * 
 * Options:
 *   - Specific packages: node dist/scripts/update-deps.js <package1> <package2>
 *   - Filter: --filter=<pattern> (e.g., --filter=react)
 *   - Target: --target=<major|minor|patch|latest> (default: latest)
 *   - Reject: --reject=<pattern> (e.g., --reject=react)
 *   - Dry run: --dry-run (don't actually update)
 * 
 * Platform compatibility:
 *   - Works on all platforms (Windows, macOS, Linux)
 *   - Uses npx to run npm-check-updates even if not installed globally
 * 
 * Dependencies:
 *   - Requires npm-check-updates (will be installed temporarily via npx if not available)
 */

import { spawn } from 'child_process';
import path from 'path';

/**
 * Interface for option with value
 */
interface CommandOption {
  option: string;
  value?: string;
}

/**
 * Main function to update dependencies
 */
const updateDependencies = async (): Promise<void> => {
  try {
    console.log('🔍 Checking for dependency updates...');
    
    // Get command line arguments (skip node and script path)
    const args = process.argv.slice(2);
    
    // Prepare npm-check-updates command args
    const ncuArgs: string[] = ['-u']; // -u for updating package.json
    
    // Parse special options
    let packages: string[] = [];
    
    for (const arg of args) {
      if (arg.startsWith('--')) {
        // Handle --option=value format
        if (arg.includes('=')) {
          const [option, value] = arg.split('=');
          switch (option) {
            case '--filter':
              ncuArgs.push('--filter', value);
              break;
            case '--target':
              ncuArgs.push('--target', value);
              break;
            case '--reject':
              ncuArgs.push('--reject', value);
              break;
            default:
              ncuArgs.push(arg);
          }
        } else if (arg === '--dry-run') {
          ncuArgs.push('--packageData'); // Don't write to package.json
        } else {
          ncuArgs.push(arg);
        }
      } else {
        // It's a package name
        packages.push(arg);
      }
    }
    
    // Add specific packages if provided
    if (packages.length > 0) {
      ncuArgs.push('--filter', packages.join(' '));
    }
    
    console.log(`Running: npx npm-check-updates ${ncuArgs.join(' ')}`);
    
    // Spawn npx process
    const npx = spawn('npx', ['npm-check-updates', ...ncuArgs], {
      stdio: 'inherit', // Pipe stdin/stdout/stderr
      cwd: process.cwd()
    });
    
    // Handle process completion
    npx.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Dependency check completed successfully.');
        console.log('To install updated packages, run: npm install');
      } else {
        console.error(`\n❌ npm-check-updates exited with code ${code}`);
        process.exit(code || 1);
      }
    });
    
    // Handle process errors
    npx.on('error', (error) => {
      console.error(`❌ Failed to start npm-check-updates: ${error.message}`);
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Error updating dependencies:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

// Execute the updateDependencies function
updateDependencies();