#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
import { readdir, writeFile } from 'fs/promises';
import { join } from 'path';

const IGNORE_PATTERNS = ['node_modules', '.git', 'build', '.DS_Store', 'coverage', 'dist', '*.log'];

async function generateTree(dir, indent = '', isRoot = false) {
  const entries = await readdir(dir, { withFileTypes: true });
  const filteredEntries = entries
    .filter(
      entry =>
        !IGNORE_PATTERNS.some(pattern =>
          pattern.includes('*') ? entry.name.endsWith(pattern.slice(1)) : entry.name === pattern
        )
    )
    .sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const tree = [];

  if (isRoot) {
    // Add project name header
    tree.push('atlas-mcp-server');
  }

  for (let i = 0; i < filteredEntries.length; i++) {
    const entry = filteredEntries[i];
    const isLastEntry = i === filteredEntries.length - 1;
    const prefix = isLastEntry ? '└── ' : '├── ';
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Add directory entry
      tree.push(`${indent}${prefix}${entry.name}/`);

      // Recursively process subdirectory with updated indent
      const nextIndent = indent + (isLastEntry ? '    ' : '│   ');
      const subtree = await generateTree(fullPath, nextIndent);
      tree.push(...subtree);
    } else {
      // Add file entry
      tree.push(`${indent}${prefix}${entry.name}`);
    }
  }

  return tree;
}

// Get directory from command line args or use current directory
const targetDir = process.argv[2] || '.';

generateTree(targetDir, '', true)
  .then(async tree => {
    const treeContent = '```text\n' + tree.join('\n') + '\n```';
    // Write to file
    await writeFile(join(process.cwd(), 'repo-tree.md'), treeContent);
    // Also log to console for feedback
    console.log(treeContent);
  })
  .catch(error => {
    console.error('Error generating tree:', error);
    process.exit(1);
  });
