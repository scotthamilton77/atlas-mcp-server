/**
 * Main validation system exports
 * Re-exports core validation functionality for backward compatibility
 */

export * from './core/index.js';

// Add deprecation notice for old imports
if (process.env.NODE_ENV === 'development') {
  console.warn(
    'Warning: Importing directly from validation/index.js is deprecated. ' +
      'Import from validation/core/index.js instead.'
  );
}
