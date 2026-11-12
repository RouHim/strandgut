import { test, expect, gotoApp } from '../support/app.js';

test('SPA uses the configured title', async ({ page }) => {
  await gotoApp(page, { skipOnboarding: false });
  // The fixture config sets title "Test"; the title is config-driven.
  await expect(page).toHaveTitle(/^Test$/);
});

test('edit toggle button is visible', async ({ page }) => {
  await gotoApp(page, { skipOnboarding: false });
  await expect(page.locator('[data-testid="edit-toggle"]')).toBeVisible();
});

test('add button is visible', async ({ page }) => {
  await gotoApp(page, { skipOnboarding: false });
  await expect(page.locator('[data-testid="add-button"]')).toBeVisible();
});
