import { test, expect } from '@playwright/test';

// The default view checks reachability once per page load (`GET /api/status`):
// the server opens one TCP connection per configured service URL, the tiles
// render kelp-green/terracotta dots, and nothing re-checks in between.

async function seedConfig(request, services) {
  await request.put('/api/config', {
    data: {
      title: 'Test',
      language: 'en',
      scan_defaults: 'simple',
      services,
    },
  });
}

function service(name, url, col) {
  return { name, url, icon: null, description: null, position: { row: 0, col } };
}

test('tiles show reachability after the page-load check', async ({ page, request }) => {
  // The app's own health endpoint is reachable; port 1 is refused.
  await seedConfig(request, [
    service('Up', 'http://127.0.0.1:13569/api/health', 0),
    service('Down', 'http://127.0.0.1:1/', 1),
  ]);

  await page.goto('/');

  const tiles = page.locator('[data-testid="tile"]');
  await expect(tiles).toHaveCount(2);
  await expect(tiles.nth(0).locator('[data-testid="tile-status"]')).toHaveAttribute('data-state', 'up');
  await expect(tiles.nth(1).locator('[data-testid="tile-status"]')).toHaveAttribute('data-state', 'down');

  // The dot is not colour-only: it carries a translated accessible name.
  await expect(tiles.nth(0).locator('[data-testid="tile-status"]')).toHaveAttribute('aria-label', 'Reachable');
  await expect(tiles.nth(1).locator('[data-testid="tile-status"]')).toHaveAttribute('aria-label', 'Not reachable');

  // The dot sits inside its tile's box (top-right corner).
  const tileBox = await tiles.nth(0).boundingBox();
  const dotBox = await tiles.nth(0).locator('[data-testid="tile-status"]').boundingBox();
  expect(dotBox.width).toBeGreaterThan(0);
  expect(dotBox.x).toBeGreaterThanOrEqual(tileBox.x);
  expect(dotBox.x + dotBox.width).toBeLessThanOrEqual(tileBox.x + tileBox.width + 1);
  expect(dotBox.y + dotBox.height).toBeLessThanOrEqual(tileBox.y + tileBox.height + 1);
});

test('reachability is checked once per page load, not while editing', async ({ page, request }) => {
  await seedConfig(request, [service('Up', 'http://127.0.0.1:13569/api/health', 0)]);

  let statusCalls = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/status')) statusCalls += 1;
  });

  await page.goto('/');
  const dot = page.locator('[data-testid="tile-status"]').first();
  await expect(dot).toHaveAttribute('data-state', 'up');
  expect(statusCalls).toBe(1);

  // Entering and leaving edit mode re-renders the grid; the status from the
  // page-load check is still shown and no new request goes out.
  const toggle = page.locator('[data-testid="edit-toggle"]');
  await toggle.click();
  await toggle.click();
  await expect(page.locator('[data-testid="tile-status"]').first()).toHaveAttribute('data-state', 'up');
  await page.waitForTimeout(800);
  expect(statusCalls).toBe(1);
});
