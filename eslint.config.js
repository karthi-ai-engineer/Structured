import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'
import { defineConfig, globalIgnores } from 'eslint/config'

// Architecture rules from PLAN.md section 6 and docs/phases/phase-0/PLAN.md D0-3, made executable.
// CLAUDE.md ("Import rules") documents them for humans.

const noServer = {
  // 'server' matches any path segment of that name, so React's own entry point is re-allowed
  // (the badge and boundary tests render with react-dom/server).
  group: ['**/server/**', 'server', 'server/*', '!react-dom/server'],
  message: 'src/ must never import server/ (PLAN.md section 6).',
}
const supabaseOnlyInData = { group: ['@supabase/*'], message: 'Only src/data may use Supabase.' }
const coreOnly = [
  noServer,
  { group: ['@supabase/*'], message: 'src/core must not depend on Supabase.' },
  {
    group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    message: 'src/core is pure TypeScript: no React.',
  },
  {
    group: ['@/*'],
    message:
      'src/core uses relative imports with .ts extensions only (plain Node and Vercel functions cannot resolve @/).',
  },
  {
    group: [
      '**/data/**',
      '**/features/**',
      '**/components/**',
      '**/platform/**',
      '**/stores/**',
      '**/lib/**',
      '**/styles/**',
    ],
    message: 'src/core may only import from src/core.',
  },
]
const clock = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'Read the clock only through src/core/dates.ts (todayIn/nowMinutesIn) or pass an explicit instant.',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Read the clock only through src/core/dates.ts.',
  },
]
const noDynamicImport = {
  selector: 'ImportExpression',
  message: 'No dynamic import() in src/core.',
}

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    '.vercel',
    '.claude',
    'docs',
    'src/data/database.types.ts',
    'supabase/.temp',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // no-restricted-imports / no-restricted-syntax options do not merge across config objects:
  // each block below repeats everything that must apply to its files.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noServer, supabaseOnlyInData] }],
      'no-restricted-syntax': ['error', ...clock],
    },
  },
  {
    files: ['src/data/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noServer] }] },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: coreOnly }],
      'no-restricted-syntax': ['error', ...clock, noDynamicImport],
    },
  },
  {
    files: ['src/core/dates.ts'],
    rules: { 'no-restricted-syntax': ['error', noDynamicImport] },
  },
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  prettier,
])
