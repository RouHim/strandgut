import { test, expect } from '@playwright/test';

test('theme toggle is removed from the header', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#theme-toggle')).toHaveCount(0);
  await expect(page.locator('.theme-icon-sun, .theme-icon-moon')).toHaveCount(0);
});

const DARK_CANVAS = '#0a1628';
const DARK_HTML_BG = 'rgb(26, 26, 46)'; // #1a1a2e

async function canvasToken(page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-surface-canvas')
      .trim()
  );
}

test('app renders dark regardless of OS color scheme', async ({ page }) => {
  for (const colorScheme of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');

    // No script sets a data-theme attribute anymore
    expect(
      await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))
    ).toBe(false);

    // Dark tokens are the only values under both schemes
    expect(await canvasToken(page)).toBe(DARK_CANVAS);

    // Dark page background under both schemes
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).backgroundColor
    );
    expect(bg).toBe(DARK_HTML_BG);
  }
});

test('stored light theme preference is ignored', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload();

  expect(
    await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))
  ).toBe(false);
  expect(await canvasToken(page)).toBe(DARK_CANVAS);
});
