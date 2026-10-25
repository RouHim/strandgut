import { test, expect, gotoApp, seedConfig, service } from '../support/app.js';

const THREE_SERVICES = [
  service('Alpha', 'http://alpha.local', 0),
  service('Beta', 'http://beta.local', 1),
  service('Gamma', 'http://gamma.local', 2),
];

/** Seed the server config and navigate to the dashboard. */
async function seedAndNavigate(page, request) {
  await seedConfig(request, THREE_SERVICES, { title: 'DragTest' });
  await gotoApp(page);
}

/**
 * Simulate HTML5 drag-and-drop between two tile indices using native DOM events.
 * This is reliable in headless Chromium where Playwright's dragTo() hangs.
 */
async function simulateDragDrop(page, fromIndex, toIndex) {
  await page.evaluate(({ fromIndex, toIndex }) => {
    const tiles = document.querySelectorAll('[data-testid="tile"]');
    const source = tiles[fromIndex];
    const target = tiles[toIndex];

    if (!source || !target) return;

    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', String(fromIndex));

    source.dispatchEvent(new DragEvent('dragstart', {
      dataTransfer,
      bubbles: true,
      cancelable: true,
    }));

    target.dispatchEvent(new DragEvent('dragover', {
      dataTransfer,
      bubbles: true,
      cancelable: true,
    }));

    target.dispatchEvent(new DragEvent('drop', {
      dataTransfer,
      bubbles: true,
      cancelable: true,
    }));

    source.dispatchEvent(new DragEvent('dragend', {
      dataTransfer,
      bubbles: true,
      cancelable: true,
    }));
  }, { fromIndex, toIndex });
}

test('drag first tile to second position', async ({ page, request }) => {
  await seedAndNavigate(page, request);
  await page.locator('[data-testid="edit-toggle"]').click();

  const tiles = page.locator('[data-testid="tile"]');
  await expect(tiles).toHaveCount(3);
  await expect(tiles.nth(0)).toContainText('Alpha');
  await expect(tiles.nth(1)).toContainText('Beta');

  await simulateDragDrop(page, 0, 1);

  await expect(tiles.nth(0)).toContainText('Beta');
  await expect(tiles.nth(1)).toContainText('Alpha');
  await expect(tiles.nth(2)).toContainText('Gamma');
});

test('drag last tile to first position', async ({ page, request }) => {
  if (page.viewportSize().width < 600) {
    test.skip('Long vertical drag is unreliable on mobile viewport');
  }
  await seedAndNavigate(page, request);
  await page.locator('[data-testid="edit-toggle"]').click();

  const tiles = page.locator('[data-testid="tile"]');
  await expect(tiles).toHaveCount(3);

  await simulateDragDrop(page, 2, 0);

  await expect(tiles.nth(0)).toContainText('Gamma');
  await expect(tiles.nth(1)).toContainText('Alpha');
  await expect(tiles.nth(2)).toContainText('Beta');
});

test('drag does not work outside edit mode', async ({ page, request }) => {
  await seedAndNavigate(page, request);

  const tiles = page.locator('[data-testid="tile"]');
  await expect(tiles.first()).toBeVisible();
  await expect(tiles.first()).not.toHaveAttribute('draggable');

  await page.locator('[data-testid="edit-toggle"]').click();
  await expect(tiles.first()).toHaveAttribute('draggable', 'true');

  await page.locator('[data-testid="edit-toggle"]').click();
  await expect(tiles.first()).not.toHaveAttribute('draggable');
});

test('edit controls still work alongside drag', async ({ page, request }) => {
  await seedAndNavigate(page, request);
  await page.locator('[data-testid="edit-toggle"]').click();

  await page.locator('[data-testid="edit-tile"]').first().click();
  await expect(page.locator('[data-testid="edit-name"]')).toBeVisible();
  await expect(page.locator('[data-testid="edit-name"]')).toHaveValue('Alpha');

  await page.locator('[data-testid="edit-save"]').click({ force: true });
  await expect(page.locator('[data-testid="tile"]').nth(0)).toContainText('Alpha');
});

test('drag to same position is a no-op', async ({ page, request }) => {
  await seedAndNavigate(page, request);
  await page.locator('[data-testid="edit-toggle"]').click();

  const tiles = page.locator('[data-testid="tile"]');
  await expect(tiles).toHaveCount(3);

  const initial = await tiles.allTextContents();

  await simulateDragDrop(page, 0, 0);

  const after = await tiles.allTextContents();
  expect(after).toEqual(initial);
  await expect(tiles.nth(0)).toContainText('Alpha');
  await expect(tiles.nth(1)).toContainText('Beta');
  await expect(tiles.nth(2)).toContainText('Gamma');
});
