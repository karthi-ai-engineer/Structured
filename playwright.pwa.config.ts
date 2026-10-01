import { defineConfig, devices } from '@playwright/test'

// The installable-app check (PLAN.md S7, S9): a production build served by `vite preview`,
// because the service worker registers in production builds only. Opt-in like the other e2e
// tests (`npm run test:e2e:pwa`), against the real database, in the installed Microsoft Edge.
// It only reads: no task is created.
export default defineConfig({
  testDir: 'tests/pwa',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'pwa', use: { ...devices['Desktop Edge'], channel: 'msedge' } }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 240_000,
  },
})
