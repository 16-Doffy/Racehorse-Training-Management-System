import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  outputDir: '../scratch/playwright-results',
  use: { baseURL: 'http://127.0.0.1:5180', timezoneId: 'Asia/Ho_Chi_Minh', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
