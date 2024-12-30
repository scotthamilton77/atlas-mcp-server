import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      // Customize rules to be less strict
      'no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'prefer-const': 'error',
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  },
  {
    // Specific files with more relaxed rules
    files: [
      'src/storage/core/connection/pool.ts',
      'src/storage/sqlite/error-handler.ts',
      'src/storage/sqlite/init.ts',
      'src/storage/core/connection/manager.ts',
    ],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    // Ignore configuration files from strict linting
    files: ['eslint.config.js', 'tsconfig.json'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
