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
        // The shared fixture PUTs an empty config before and after every test.
        // Never point that at the developer's own config.toml.
        env: {
          STRANDGUT_CONFIG: process.env.STRANDGUT_CONFIG ?? '.e2e-config.toml',
        },
        // Attaching to an already running server must be an explicit choice.
        reuseExistingServer: !!process.env.STRANDGUT_REUSE_SERVER,
        timeout: 60000,
      } }),
});
