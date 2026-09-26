import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/offline',
  testMatch: '**/*.pw.ts',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5274',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: './scripts/dev.sh run preview -- --port 5274',
    url: 'http://127.0.0.1:5274',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
