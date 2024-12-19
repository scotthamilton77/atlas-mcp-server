/** @type {import('@jest/types').Config.InitialOptions} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/build/',
  ],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  verbose: true,
  testTimeout: 10000,
  roots: ['<rootDir>/src/', '<rootDir>/tests/'],
  moduleDirectories: ['node_modules', 'src'],
  testPathIgnorePatterns: ['/node_modules/', '/build/'],
};
