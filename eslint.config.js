// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  // Ignore build output and external deps
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '!eslint.config.js'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // No unstructured logging — use pino. See docs/LINTING.md
      'no-console': 'error',

      // Large files are hard for agents to reason about in a single context window
      'max-lines': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],

      // any defeats TypeScript's guarantees
      '@typescript-eslint/no-explicit-any': 'warn',

      // Unused vars are noise; prefix with _ to explicitly ignore
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // CLI scripts may use console directly — no pino logger in these
  {
    files: ['scripts/**/*.ts', 'packages/*/src/cli/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
)
