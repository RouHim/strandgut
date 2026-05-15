import { test, expect } from '@playwright/test';

test('SPA loads with correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Strandgut/);
});

test('service grid is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid="service-grid"]')).toBeVisible();
});

test('edit toggle button is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid="edit-toggle"]')).toBeVisible();
});

test('add button is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid="add-button"]')).toBeVisible();
});

test('onboarding shows on fresh start', async ({ page, request }) => {
  // Reset config to empty services
  await request.put('/api/config', {
    data: { title: 'Strandgut', language: 'en', scan_defaults: 'simple', services: [] }
  });
  await page.goto('/');
  await expect(page.locator('[data-testid="onboarding"]')).toBeVisible();
  await expect(page.locator('[data-testid="onboarding-cta"]')).toBeVisible();
});
