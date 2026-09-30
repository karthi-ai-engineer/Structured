import { defineConfig, devices } from '@playwright/test'

// End-to-end tests against the dev server and the REAL database (.env.local), like
// `npm run test:integration`: opt-in, never in CI. Every task they create has a title starting
// with `__test__` and is deleted by the test. They run in the installed Microsoft Edge, so no
// browser download is needed.
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/cleanup.ts',
  globalTeardown: './tests/e2e/cleanup.ts',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'msedge',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        viewport: { width: 1280, height: 900 },
      },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], channel: 'msedge' },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
