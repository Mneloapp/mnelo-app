const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  expo,
  prettier,
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'artifacts/**',
      '.local/**',
      'legacy/**', // Retired source snapshots; never an app or deployable code path.
      'ios/**',
      'android/**',
      '.expo/**',
      'supabase/functions/**',
    ],
  },
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/supabase/functions/**'],
              message: 'Server code must never enter the mobile bundle.',
            },
          ],
          paths: [
            {
              name: '@react-native-async-storage/async-storage',
              message:
                'Use SecureStore for session material. Review any non-sensitive persistence explicitly.',
            },
          ],
        },
      ],
    },
  },
]);
