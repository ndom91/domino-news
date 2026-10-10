import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'packages/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Integration tests share one test database; run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://dn:dn@localhost:5442/dn_test',
      INFERENCE_MODE: 'fixture',
      INGEST_MODE: 'fixture',
      FIXTURE_DIR: new URL('./fixtures', import.meta.url).pathname,
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
      BETTER_AUTH_URL: 'http://localhost:3000',
      ENABLE_SUMMARY_EDITING: 'true',
      FRESH_WINDOW_HOURS: '100000',
    },
  },
})
