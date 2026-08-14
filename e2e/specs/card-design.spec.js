import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function skipOnboarding(page) {
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }
}

async function waitForEntranceAnimation(page) {
  // The wash-ashore entrance animation translates tiles during play;
  // wait for it to finish before measuring layout positions.
  await page.waitForFunction(() => {
    const tiles = [...document.querySelectorAll('[data-testid="tile"]')];
    return tiles.length > 0 && tiles.every((t) => {
      const tf = getComputedStyle(t).transform;
      return tf === 'none' || tf === 'matrix(1, 0, 0, 1, 0, 0)';
    });
  });
}


// 1. Icon size — assert .tile-icon img has a proportional bounding box.
//    Tiles are square at every breakpoint (icon fills the tile above the
//    label), so the same bounds apply on desktop, tablet, and mobile.

test('tile icon has proportional bounding box', async ({ page, request }) => {
  await seedConfig(request, [
    { name: 'Service', url: 'http://test.local', icon: null, description: null, position: { row: 0, col: 0 } },
  ]);
  await page.goto('/');
  await skipOnboarding(page);

  const iconImg = page.locator('[data-testid="tile"] .tile-icon img').first();
  const box = await iconImg.boundingBox();

  expect(box).not.toBeNull();
  expect(box.width).toBeGreaterThanOrEqual(100);
  expect(box.width).toBeLessThanOrEqual(370);
  expect(box.height).toBeGreaterThanOrEqual(100);
  expect(box.height).toBeLessThanOrEqual(370);
});

// ---------------------------------------------------------------------------
// 2. Name-only – .tile-description must NOT exist even when description set
// ---------------------------------------------------------------------------

test('description element is not rendered when service has a description', async ({ page, request }) => {
  await seedConfig(request, [
    {
      name: 'Service',
      url: 'http://test.local',
      icon: null,
      description: 'A description that should not appear',
      position: { row: 0, col: 0 },
    },
  ]);
  await page.goto('/');
  await skipOnboarding(page);

  await expect(page.locator('.tile-description')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 3. Auto-fit centering – tiles not flush-left at 1280 px
// ---------------------------------------------------------------------------

test('tiles are centered at 1280px viewport with 2 services', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedConfig(request, [
    { name: 'Service A', url: 'http://a.local', icon: null, description: null, position: { row: 0, col: 0 } },
    { name: 'Service B', url: 'http://b.local', icon: null, description: null, position: { row: 0, col: 1 } },
  ]);
  await page.goto('/');
  await skipOnboarding(page);

  const firstTile = page.locator('[data-testid="tile"]').first();
  const box = await firstTile.boundingBox();

  expect(box).not.toBeNull();
  // Not flush-left -> first tile's x offset is > 0
  expect(box.x).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// 4. Responsive mobile – two tiles per row at Pixel 5 viewport
// ---------------------------------------------------------------------------

test('tiles render two per row at mobile viewport', async ({ page, request }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await seedConfig(request, [
    { name: 'Service A', url: 'http://a.local', icon: null, description: null, position: { row: 0, col: 0 } },
    { name: 'Service B', url: 'http://b.local', icon: null, description: null, position: { row: 0, col: 1 } },
    { name: 'Service C', url: 'http://c.local', icon: null, description: null, position: { row: 1, col: 0 } },
    { name: 'Service D', url: 'http://d.local', icon: null, description: null, position: { row: 1, col: 1 } },
  ]);
  await page.goto('/');
  await skipOnboarding(page);

  await waitForEntranceAnimation(page);

  const tiles = page.locator('[data-testid="tile"]');
  const box0 = await tiles.nth(0).boundingBox();
  const box1 = await tiles.nth(1).boundingBox();
  const box2 = await tiles.nth(2).boundingBox();

  expect(box0).not.toBeNull();
  expect(box1).not.toBeNull();
  expect(box2).not.toBeNull();

  // Tiles 0 and 1 are on the same row (similar y)
  expect(Math.abs(box0.y - box1.y)).toBeLessThanOrEqual(8);
  // Tile 2 starts a new row (below tile 0's row)
  expect(box2.y).toBeGreaterThanOrEqual(box0.y + box0.height - 2);
});

// ---------------------------------------------------------------------------
// 5. Responsive tablet – max 2 tiles per row at 768 px
// ---------------------------------------------------------------------------

test('at 768px viewport at most 2 tiles appear per row', async ({ page, request }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await seedConfig(request, [
    { name: 'Service A', url: 'http://a.local', icon: null, description: null, position: { row: 0, col: 0 } },
    { name: 'Service B', url: 'http://b.local', icon: null, description: null, position: { row: 0, col: 1 } },
    { name: 'Service C', url: 'http://c.local', icon: null, description: null, position: { row: 1, col: 0 } },
    { name: 'Service D', url: 'http://d.local', icon: null, description: null, position: { row: 1, col: 1 } },
  ]);
  await page.goto('/');
  await skipOnboarding(page);

  await waitForEntranceAnimation(page);

  const tiles = page.locator('[data-testid="tile"]');
  const box0 = await tiles.nth(0).boundingBox();
  const box1 = await tiles.nth(1).boundingBox();
  const box2 = await tiles.nth(2).boundingBox();

  expect(box0).not.toBeNull();
  expect(box1).not.toBeNull();
  expect(box2).not.toBeNull();

  // Tiles 0 and 1 are on the same row (similar y)
  expect(Math.abs(box0.y - box1.y)).toBeLessThanOrEqual(8);
  // Tile 2 starts a new row (below tile 0's row)
  expect(box2.y).toBeGreaterThanOrEqual(box0.y + box0.height - 2);
});

// ---------------------------------------------------------------------------
// 6. Click opens URL – tile click opens service URL in a new tab
// ---------------------------------------------------------------------------

test('clicking a tile opens the service URL in a new tab', async ({ page, request }) => {
  await seedConfig(request, [
    { name: 'Click Test', url: 'http://click-test.local:8080', icon: null, description: null, position: { row: 0, col: 0 } },
  ]);
  await page.goto('/');
  await skipOnboarding(page);

  // Intercept navigation in the popup so we don't hit DNS errors
  await page.context().route('http://click-test.local:8080/', (route) => route.fulfill({ status: 200, body: 'OK' }));

  const tile = page.locator('[data-testid="tile"]').first();
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    tile.click(),
  ]);

  await popup.waitForLoadState();
  expect(popup.url()).toContain('click-test.local:8080');
});

// ---------------------------------------------------------------------------
// 7. Edit mode – delete button visible and draggable attribute set
// ---------------------------------------------------------------------------

test('edit mode shows delete button and sets draggable attribute', async ({ page, request }) => {
  await seedConfig(request, [
    { name: 'Service', url: 'http://test.local', icon: null, description: null, position: { row: 0, col: 0 } },
  ]);
  await page.goto('/');
  await skipOnboarding(page);

  const tile = page.locator('[data-testid="tile"]').first();
  await expect(tile).not.toHaveAttribute('draggable');

  await page.locator('[data-testid="edit-toggle"]').click();

  await expect(tile).toHaveAttribute('draggable', 'true');
  await expect(page.locator('[data-testid="delete-tile"]').first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// 8. Glassmorphism – tile has backdrop-filter containing "blur"
// ---------------------------------------------------------------------------

test('tile has backdrop-filter with blur', async ({ page, request }) => {
  await seedConfig(request, [
    { name: 'Service', url: 'http://test.local', icon: null, description: null, position: { row: 0, col: 0 } },
  ]);
  await page.goto('/');
  await skipOnboarding(page);

  const tile = page.locator('[data-testid="tile"]').first();
  const backdropFilter = await tile.evaluate(
    (el) => window.getComputedStyle(el).backdropFilter,
  );

  expect(backdropFilter).toContain('blur');
});

// ---------------------------------------------------------------------------
// 9. Embedded font – Hanken Grotesk is loaded and applied
// ---------------------------------------------------------------------------

test('tiles use the embedded Hanken Grotesk font', async ({ page, request }) => {
  await seedConfig(request, [
    { name: 'Service', url: 'http://test.local', icon: null, description: null, position: { row: 0, col: 0 } },
  ]);
  await page.goto('/');
  await skipOnboarding(page);

  await expect.poll(() => page.evaluate(() => document.fonts.check('700 1rem "Hanken Grotesk"'))).toBe(true);
  const family = await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain('Hanken Grotesk');
});
