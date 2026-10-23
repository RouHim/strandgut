import { test, expect, dismissOnboarding, gotoApp } from '../support/app.js';

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

  await gotoApp(page, { skipOnboarding: false });
  // Deterministic app-ready wait: either the grid has rendered tiles or the
  // onboarding is explicitly shown. 'networkidle' never resolves reliably here
  // (tile icons load from external CDNs; see AGENTS.md test notes).
  await page.waitForFunction(() => {
    const tiles = document.querySelectorAll('[data-testid="tile"]');
    const onboarding = document.querySelector('[data-testid="onboarding"]');
    return tiles.length > 0 || onboarding?.getAttribute('aria-hidden') === 'false';
  });

  await dismissOnboarding(page);

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
