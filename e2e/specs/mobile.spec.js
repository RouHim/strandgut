import { test, expect } from '@playwright/test';

test('mobile viewport shows grid', async ({ page }) => {
  await page.goto('/');
  const grid = page.locator('[data-testid="service-grid"]');
  await expect(grid).toBeVisible();
});

test('mobile edit mode enables drag and shows controls', async ({ page, request }) => {
  await request.put('/api/config', {
    data: {
      title: 'Test',
      language: 'en',
      scan_defaults: 'simple',
      services: [
        { name: 'Mobile Test', url: 'http://mobile.local', icon: null, description: null, position: { row: 0, col: 0 } },
      ],
    },
  });
  await page.goto('/');

  const tile = page.locator('[data-testid="tile"]').first();
  await expect(tile).not.toHaveAttribute('draggable');

  await page.locator('[data-testid="edit-toggle"]').click();
  await expect(tile).toHaveAttribute('draggable', 'true');
  await expect(page.locator('[data-testid="edit-tile"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="delete-tile"]').first()).toBeVisible();
});
