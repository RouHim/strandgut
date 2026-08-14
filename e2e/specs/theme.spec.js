import { test, expect } from '@playwright/test';

test('theme toggle is removed from the header', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#theme-toggle')).toHaveCount(0);
  await expect(page.locator('.theme-icon-sun, .theme-icon-moon')).toHaveCount(0);
});
