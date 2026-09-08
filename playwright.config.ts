import { defineConfig } from '@playwright/test';

const PORT = 3000;

export default defineConfig({
  testDir: './tests',
  timeout: 15_000,
  expect: { timeout: 5_000 },
  retries: 2,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/report.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node app/server.mjs',
    url: `http://localhost:${PORT}/api/todos`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
    env: { PORT: String(PORT) },
  },
});
