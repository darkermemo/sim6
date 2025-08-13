/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: 'tests/e2e',
  timeout: 30000,
  baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173/ui/app',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { 
        ...{
          viewport: { width: 1280, height: 720 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        }
      },
    },
  ],
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  webServer: undefined, // Server started externally
};

export default config;


