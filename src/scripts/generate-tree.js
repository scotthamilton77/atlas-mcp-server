#!/usr/bin/env node
import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

async function generateTree(dir, prefix = '', isLast = true) {
  const entries = await readdir(dir, { withFileTypes: true });
  const tree = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLastEntry = i === entries.length - 1;
    const connector = isLastEntry ? '└── ' : '├── ';
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      const subTree = await generateTree(
        fullPath,
        prefix + (isLastEntry ? '    ' : '│   '),
        isLastEntry
      );
      tree.push(prefix + connector + entry.name + '/');
      tree.push(...subTree);
    } else {
      tree.push(prefix + connector + entry.name);
    }
  }

  return tree;
}

// Get directory from command line args or use current directory
const targetDir = process.argv[2] || '.';

generateTree(targetDir)
  .then(tree => {
    // eslint-disable-next-line no-console
    console.log(tree.join('\n'));
  })
  .catch(error => {
    // eslint-disable-next-line no-console
    console.error('Error generating tree:', error);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });
