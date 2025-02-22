#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

// Default patterns to always ignore
const DEFAULT_IGNORE_PATTERNS = ['.git', 'node_modules', '.DS_Store', 'dist', 'build'];

async function loadGitignorePatterns() {
  try {
    const gitignoreContent = await fs.readFile('.gitignore', 'utf-8');
    return gitignoreContent
      .split('\n')
      .map(line => line.trim())
      // Remove comments and empty lines
      .filter(line => line && !line.startsWith('#'))
      // Handle negation patterns
      .map(pattern => ({
        pattern: pattern.startsWith('!') ? pattern.slice(1) : pattern,
        negated: pattern.startsWith('!'),
        // Convert glob patterns to regex-compatible strings
        regex: pattern
          .replace(/\*/g, '.*') // Convert * to .*
          .replace(/\?/g, '.') // Convert ? to .
          .replace(/\./g, '\\.') // Escape dots
          .replace(/\/$/, '(/.*)?') // Handle directory indicators
      }));
  } catch (error) {
    console.warn('No .gitignore file found, using default patterns only');
    return [];
  }
}

function isIgnored(entryPath, ignorePatterns) {
  // Always check default patterns first
  if (DEFAULT_IGNORE_PATTERNS.some(pattern => entryPath.includes(pattern))) {
    return true;
  }

  let ignored = false;
  for (const { pattern, negated, regex } of ignorePatterns) {
    // Convert the pattern to a proper regex
    const regexPattern = new RegExp(`^${regex}$|/${regex}$|/${regex}/`);
    
    if (regexPattern.test(entryPath)) {
      // If it's a negation pattern (!pattern), this file should NOT be ignored
      // Otherwise, it should be ignored
      ignored = !negated;
    }
  }
  
  return ignored;
}

async function generateTree(dir, ignorePatterns, prefix = '', isLast = true, relativePath = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let output = '';

  // Filter and sort entries
  const filteredEntries = entries
    .filter(entry => {
      const entryPath = path.join(relativePath, entry.name);
      return !isIgnored(entryPath, ignorePatterns);
    })
    .sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < filteredEntries.length; i++) {
    const entry = filteredEntries[i];
    const isLastEntry = i === filteredEntries.length - 1;
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    const newRelativePath = path.join(relativePath, entry.name);
    
    output += prefix + (isLastEntry ? '└── ' : '├── ') + entry.name + '\n';

    if (entry.isDirectory()) {
      output += await generateTree(
        path.join(dir, entry.name),
        ignorePatterns,
        newPrefix,
        isLastEntry,
        newRelativePath
      );
    }
  }

  return output;
}

const writeTree = async () => {
  try {
    const rootDir = process.cwd();
    const ignorePatterns = await loadGitignorePatterns();
    const treeContent = await generateTree(rootDir, ignorePatterns);
    
    // Ensure docs directory exists
    const docsDir = path.join(rootDir, 'docs');
    try {
      await fs.access(docsDir);
    } catch {
      await fs.mkdir(docsDir);
    }

    // Write tree to file
    await fs.writeFile(
      path.join(docsDir, 'tree.md'),
      '# Project Directory Structure\n\n```\n' + treeContent + '```\n'
    );
    
    console.log('Successfully generated tree structure in docs/tree.md');
  } catch (error) {
    console.error('Error generating tree:', error);
    process.exit(1);
  }
};

writeTree();