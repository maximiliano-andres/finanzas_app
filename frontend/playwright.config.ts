import { defineConfig, devices } from '@playwright/test';

/** E2E contra el stack REAL (e2e/docker-compose.e2e.yml): SPA compilada servida por FastAPI + PostgreSQL + Redis + Mailpit. */
export default defineConfig({
  testDir: './e2e/specs',
  globalSetup: './e2e/global-setup.ts',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1, // los flujos comparten la misma base de datos real
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['json', { outputFile: 'e2e/.output/results.json' }]],
  use: {
    baseURL: 'http://localhost:8001/flujopago/gestion-pagos/v1/app/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@compat/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@compat/ },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] }, grep: /@responsive/ },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] }, grep: /@responsive/ },
  ],
});
