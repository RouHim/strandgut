import { test, expect } from '@playwright/test';

test('tile is a real link that opens the service in a new tab', async ({ page, request }) => {
  const origin = new URL(page.url()).origin;
  await request.put('/api/config', {
    data: {
      title: 'Test',
      language: 'en',
      scan_defaults: 'simple',
      services: [{ name: 'Example', url: `${origin}/api/health`, icon: 'globe', position: { row: 0, col: 0 } }]
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }

  const tile = page.locator('[data-testid="tile"]').first();
  await expect(tile).toBeVisible();
  expect(await tile.evaluate(el => el.tagName)).toBe('A');
  await expect(tile).toHaveAttribute('href', `${origin}/api/health`);
  await expect(tile).toHaveAttribute('target', '_blank');
  await expect(tile).toHaveAttribute('rel', 'noopener noreferrer');

  const popupPromise = page.waitForEvent('popup');
  await tile.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(`${origin}/api/health`);
});
