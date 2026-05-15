import { test, expect } from '@playwright/test';

test('onboarding shows on fresh start', async ({ page, request }) => {
  await request.put('/api/config', {
    data: { title: 'Strandgut', language: 'en', scan_defaults: 'simple', services: [] }
  });
  await page.goto('/');
  await expect(page.locator('[data-testid="onboarding"]')).toBeVisible();
  await expect(page.locator('[data-testid="onboarding-cta"]')).toBeVisible();
});

test('onboarding CTA opens add dialog', async ({ page, request }) => {
  await request.put('/api/config', {
    data: { title: 'Strandgut', language: 'en', scan_defaults: 'simple', services: [] }
  });
  await page.goto('/');
  await page.locator('[data-testid="onboarding-cta"]').click();
  await expect(page.locator('[data-testid="add-dialog"]')).toBeVisible();
});

test('skip onboarding shows empty state', async ({ page, request }) => {
  await request.put('/api/config', {
    data: { title: 'Strandgut', language: 'en', scan_defaults: 'simple', services: [] }
  });
  await page.goto('/');
  await page.locator('[data-testid="onboarding-skip"]').click();
  await expect(page.locator('[data-testid="onboarding"]')).toBeHidden();
  await expect(page.locator('[data-testid="service-grid"]')).toBeVisible();
});
