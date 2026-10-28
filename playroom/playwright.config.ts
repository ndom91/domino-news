import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'toast.spec.ts',
  use: { baseURL: 'http://localhost:9000', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'pnpm playroom',
    url: 'http://localhost:9000',
    reuseExistingServer: true,
    cwd: '..',
  },
})
