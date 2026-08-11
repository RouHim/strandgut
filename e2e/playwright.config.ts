import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:13569',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
  ...(process.env.STRANDGUT_NO_WEBSERVER
    ? {}
    : { webServer: {
        command: 'cargo run --release',
        cwd: '..',
        url: 'http://localhost:13569/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      } }),
});
