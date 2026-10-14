import { test, expect } from '@playwright/test';

test('theme toggle is removed from the header', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#theme-toggle')).toHaveCount(0);
  await expect(page.locator('.theme-icon-sun, .theme-icon-moon')).toHaveCount(0);
});

const DARK_CANVAS = '#0a1628';

/** Resolve a CSS custom property to the rgb() string the browser reports. */
async function tokenAsRgb(page, token) {
  return page.evaluate((name) => {
    const probe = document.createElement('div');
    probe.style.background = `var(${name})`;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return rgb;
  }, token);
}

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

    // The painted canvas is the token itself — one night blue (The One Canvas Rule),
    // under both schemes.
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).backgroundColor
    );
    expect(bg).toBe(await tokenAsRgb(page, '--color-surface-canvas'));
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
