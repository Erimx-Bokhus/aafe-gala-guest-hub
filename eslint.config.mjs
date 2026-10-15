// The coding standard's automatic checks (docs/CODING-STANDARD.md). Each rule is tagged with the standard's rule
// number (R1–R10, after NASA/JPL's "Power of Ten"). Run: npm run lint (zero warnings allowed).
// Stage 1 (Gate 4, #150) covers the critical modules listed in package.json's "lint" script; stage 2 widens it.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const PROJECTS = ['import-engine/tsconfig.json', 'prototype/staff-app/tsconfig.json', 'prototype/checkin-app/tsconfig.json']

/** Rules that need no type information: every TypeScript file, the Deno edge functions included. */
const base = {
  // R1 simple control flow
  'no-labels': 'error',
  'max-depth': ['error', 4],
  complexity: ['error', 15],
  // R2 every loop has a bound
  'no-constant-condition': ['error', { checkLoops: 'all' }],
  // R4 short functions
  'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
  'max-params': ['error', 5],
  // R6 smallest scope
  'prefer-const': 'error',
  'no-var': 'error',
  'no-param-reassign': 'error',
  '@typescript-eslint/no-shadow': 'error',
  // R7 every error is handled
  'no-empty': ['error', { allowEmptyCatch: false }],
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' }],
  // R8 no code made at run time
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  // R9 no escape hatches from the type system
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
}

/** Rules that need the type checker: everything except the Deno edge functions. */
const typed = {
  // R7 every promise and every error is handled
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/only-throw-error': 'error',
  '@typescript-eslint/prefer-promise-reject-errors': 'error',
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  // R9 values are what their types say
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/no-unnecessary-condition': 'error',
  '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
}

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: base,
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['prototype/supabase/functions/**'],
    languageOptions: { parserOptions: { project: PROJECTS, tsconfigRootDir: import.meta.dirname } },
    rules: typed,
  },
  {
    // Deno: its own globals and npm:/jsr: imports, so no type information here (deno check covers the types).
    files: ['prototype/supabase/functions/**/*.ts'],
    languageOptions: { globals: { Deno: 'readonly' } },
  },
)
