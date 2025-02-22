#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const IGNORE_PATTERNS = ['node_modules', 'dist', '.git'];

async function generateTree(dir, prefix = '', isLast = true) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let output = '';

  // Filter and sort entries
  const filteredEntries = entries
    .filter(entry => !IGNORE_PATTERNS.includes(entry.name))
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
    
    output += prefix + (isLastEntry ? '└── ' : '├── ') + entry.name + '\n';

    if (entry.isDirectory()) {
      output += await generateTree(
        path.join(dir, entry.name),
        newPrefix,
        isLastEntry
      );
    }
  }

  return output;
}

const writeTree = async () => {
  try {
    const rootDir = process.cwd();
    const treeContent = await generateTree(rootDir);
    
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