import { defineConfig, devices } from '@playwright/test'

const playwrightPort = process.env.PLAYWRIGHT_PORT || '5173'
const playwrightBaseUrl = `http://127.0.0.1:${playwrightPort}`

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: playwrightBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${playwrightPort}`,
    url: playwrightBaseUrl,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_DEFAULT_DATA_SOURCE: 'mock',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined,
      },
    },
  ],
})
