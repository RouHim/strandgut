import { test, expect, gotoApp, seedConfig, stubBackground, stubBackgroundUnavailable } from '../support/app.js';

test.describe('background rotation', { tag: '@background' }, () => {
  test('toggle is visible and initially OFF', async ({ page, request }) => {
    await stubBackground(page);
    await seedConfig(request, []);
    await gotoApp(page, { skipOnboarding: false });

    const toggle = page.locator('[data-testid="background-rotate-toggle"]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle.locator('.pill-switch__track')).toBeVisible();
    await expect(toggle.locator('.pill-switch__thumb')).toBeVisible();
    await page.screenshot({ path: 'test-results/background-toggle-off.png', fullPage: true });
  });

  test('static background on initial load', async ({ page, request }) => {
    await stubBackground(page);
    await seedConfig(request, []);
    await gotoApp(page, { skipOnboarding: false });

    expect(await page.evaluate(() => document.documentElement.className)).toContain('static-background');
  });

  test('footer shows static credit on initial load', async ({ page, request }) => {
    await stubBackground(page);
    await seedConfig(request, []);
    await gotoApp(page, { skipOnboarding: false });
    const credit = page.locator('[data-testid="photo-credit"]');
    await expect(credit).toBeVisible();
    await expect(credit).toContainText('Pexels');
  });

  test('toggle ON persists to config', async ({ page, request }) => {
    await stubBackground(page);
    await seedConfig(request, []);
    await gotoApp(page, { skipOnboarding: false });

    const toggle = page.locator('[data-testid="background-rotate-toggle"]');
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.screenshot({ path: 'test-results/background-toggle-on.png', fullPage: true });

    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('dynamic-background');
    expect(htmlClass).not.toContain('static-background');

    const config = await page.evaluate(async () => {
      const r = await fetch('/api/config');
      return r.json();
    });
    expect(config.background_rotate).toBe(true);
  });

  test('background status endpoint works', async ({ page }) => {
    // No stub here: this test asserts the real server response shape.
    await gotoApp(page, { skipOnboarding: false });
    const body = await page.evaluate(async () => {
      const r = await fetch('/api/background/status');
      return r.json();
    });
    expect(body).toHaveProperty('available');
    expect(body).toHaveProperty('rotate_enabled');
    expect(body).toHaveProperty('photo');
    expect(typeof body.available).toBe('boolean');
    expect(typeof body.rotate_enabled).toBe('boolean');
  });

  test('toggle is hidden when the feature is unavailable', { tag: '@background' }, async ({ page }) => {
    await stubBackgroundUnavailable(page);
    await gotoApp(page, { skipOnboarding: false });

    await expect(page.locator('[data-testid="background-rotate-toggle"]')).toBeHidden();
  });

  test('toggle is visible and off when the feature is available', { tag: '@background' }, async ({ page }) => {
    await stubBackground(page);
    await gotoApp(page, { skipOnboarding: false });

    const toggle = page.locator('[data-testid="background-rotate-toggle"]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
