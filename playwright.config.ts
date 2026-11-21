import { defineConfig } from '@playwright/test';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
export default defineConfig({ testDir: './tests', timeout: 60000, expect: { timeout: 10000 }, workers: 1, fullyParallel: false, reporter: 'list',
  use: { baseURL, headless: true, viewport: { width: 390, height: 844 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'webkit-mobile', testMatch: /(mobile-viewport|leave-guard|wizard-steps)\.spec\.ts/, use: { browserName: 'webkit' } },
  ],
  webServer: { command: 'npm run dev', url: baseURL, reuseExistingServer: true, env: { VITE_USE_MOCK: 'true', VITE_MOCK_AUTH: 'true' } },
});
