import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {}) } },
    { name: 'webkit', testMatch: ['**/runtime-loading.spec.mjs', '**/category-order-layout.spec.mjs', '**/life-integration.spec.mjs', '**/statistics-feature.spec.mjs', '**/navigation-statistics-update.spec.mjs', '**/record-form-update.spec.mjs'], use: { ...devices['Desktop Safari'] } },
  ],
  testDir: './tests/browser',
  timeout: 20_000,
  expect: { timeout: 2_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'node scripts/serve.mjs --test',
    env: { PORT: '4175' },
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
