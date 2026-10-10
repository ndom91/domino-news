import { defineConfig, devices } from '@playwright/test'

// Browser smoke tests against a running app (dev server or Compose stack).
// Needs a user: `pnpm cli user:create --username $DEV_USERNAME --password $DEV_PASSWORD`.
process.loadEnvFile?.('.env')

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, hasTouch: true },
    },
  ],
})
