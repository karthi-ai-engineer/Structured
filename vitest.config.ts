import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Every unit test runs in a half-hour-offset zone with DST, so accidental use of the machine's
// zone fails (asserted by src/core/__tests__/environment.test.ts). Set here, because Git Bash
// strips TZ from child processes on Windows.
process.env.TZ = 'America/St_Johns'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // Hermetic: .env.local must not leak real Supabase values into unit tests (same as CI).
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_BUILD_SHA: '' },
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/__tests__/**'],
      thresholds: { lines: 95, statements: 95, functions: 100, branches: 90 },
    },
  },
})
