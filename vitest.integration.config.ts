import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Opt-in integration tests against the real Supabase project (never in CI). They read .env.local
// through loadEnv; values are never printed. Run with `npm run test:integration`.
export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''), // reads .env.local; values are never printed
    testTimeout: 45_000,
    hookTimeout: 45_000,
    fileParallelism: false,
  },
}))
