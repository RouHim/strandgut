import { test, expect } from '@playwright/test';

// Modal integrity (harden): an open overlay owns focus, the page behind is
// inert and locked, and closing returns focus to the control that opened it.

async function seedOneService(request) {
  await request.put('/api/config', {
    data: {
      title: 'Test',
      language: 'en',
      scan_defaults: 'simple',
      services: [
        { name: 'One', url: 'http://127.0.0.1:13569/api/health', icon: null, description: null, position: { row: 0, col: 0 } },
      ],
    },
  });
}

const activeInside = (selector) =>
  `document.querySelector('${selector}')?.contains(document.activeElement)`;

test('add dialog owns focus, traps Tab, and hands focus back on close', async ({ page, request }) => {
  await seedOneService(request);
  await page.goto('/');

  const opener = page.locator('[data-testid="add-button"]');
  await opener.click();

  const dialog = page.locator('.add-dialog-overlay');
  await expect(dialog).toBeVisible();

  // Focus moved into the dialog (the declared initial control).
  await expect
    .poll(() => page.evaluate(activeInside('.add-dialog-overlay')))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid')))
    .toBe('add-manual-button');

  // The page behind is inert and cannot scroll.
  expect(await page.evaluate(() => document.querySelector('main').inert)).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');

  // Tab cycles inside the overlay in both directions.
  for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    await expect.poll(() => page.evaluate(activeInside('.add-dialog-overlay'))).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Focus returns to the control that opened the dialog, the page unlocks.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid')))
    .toBe('add-button');
  expect(await page.evaluate(() => document.querySelector('main').inert)).toBe(false);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
});

test('edit panel owns focus and returns it to the tile edit control', async ({ page, request }) => {
  await seedOneService(request);
  await page.goto('/');

  await page.locator('[data-testid="edit-toggle"]').click();
  await page.locator('[data-testid="edit-tile"]').first().click();

  const panel = page.locator('.edit-panel-overlay');
  await expect(panel).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid')))
    .toBe('edit-name');
  expect(await page.evaluate(() => document.querySelector('main').inert)).toBe(true);

  await page.locator('[data-testid="edit-cancel"]').click();
  await expect(panel).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid')))
    .toBe('edit-tile');
  expect(await page.evaluate(() => document.querySelector('main').inert)).toBe(false);
});
