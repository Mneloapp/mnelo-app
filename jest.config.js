module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: [
    'src/lib/env-schema.ts',
    'src/lib/errors.ts',
    'src/lib/query-client.ts',
    'src/components/**/*.tsx',
    'src/i18n/**/*.ts',
  ],
  coverageDirectory: 'coverage',
  clearMocks: true,
};
