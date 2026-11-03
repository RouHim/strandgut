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

test('onboarding shows on fresh start', async ({ page, request }) => {
  // Reset config to empty services
  await request.put('/api/config', {
    data: { title: 'Strandgut', language: 'en', scan_defaults: 'simple', services: [] }
  });
  await gotoApp(page, { skipOnboarding: false });
  await expect(page.locator('[data-testid="onboarding"]')).toBeVisible();
  await expect(page.locator('[data-testid="onboarding-cta"]')).toBeVisible();
});
