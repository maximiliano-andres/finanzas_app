import { defineConfig, devices } from '@playwright/test';
/** Medición comparativa legacy vs React (se ejecuta aparte: npx playwright test -c playwright.perf.config.ts). */
export default defineConfig({
  testDir: './e2e/perf',
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], locale: 'es-CL', timezoneId: 'America/Santiago' },
});
