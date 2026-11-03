import { defineConfig } from '@playwright/test';

import baseConfig from './playwright.config';

// Manual QA scripts live in ./manual, outside the default testDir. Run them
// explicitly with: npx playwright test --config playwright.manual.config.ts
export default defineConfig({
  ...baseConfig,
  testDir: './manual',
});
