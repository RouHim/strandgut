import { test, expect } from '@playwright/test';

test.describe('background rotation', { tag: '@background' }, () => {
  test('toggle is visible and initially OFF', async ({ page }) => {
    await page.goto('/');

    const statusResp = await page.evaluate(async () => {
      const r = await fetch('/api/background/status');
      return r.json();
    });

    test.skip(statusResp.available === false, 'Background rotation feature is not available');

    await page.evaluate(async () => {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Strandgut',
          language: 'en',
          scan_defaults: 'simple',
          services: [],
          background_rotate: false,
        }),
      });
    });
    await page.reload();

    const toggle = page.locator('[data-testid="background-rotate-toggle"]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle.locator('.pill-switch__track')).toBeVisible();
    await expect(toggle.locator('.pill-switch__thumb')).toBeVisible();
    await page.screenshot({ path: 'test-results/background-toggle-off.png', fullPage: true });
  });

  test('static background on initial load', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(async () => {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Strandgut',
          language: 'en',
          scan_defaults: 'simple',
          services: [],
          background_rotate: false,
        }),
      });
    });
    await page.reload();

    expect(await page.evaluate(() => document.documentElement.className)).toContain('static-background');
  });

  test('footer shows static credit on initial load', async ({ page }) => {
    await page.goto('/');
    const credit = page.locator('[data-testid="photo-credit"]');
    await expect(credit).toBeVisible();
    await expect(credit).toContainText('Pexels');
  });

  test('toggle ON persists to config', async ({ page }) => {
    await page.goto('/');

    const statusResp = await page.evaluate(async () => {
      const r = await fetch('/api/background/status');
      return r.json();
    });

    test.skip(statusResp.available === false, 'Background rotation feature is not available');

    await page.evaluate(async () => {
      const r = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Strandgut',
          language: 'en',
          scan_defaults: 'simple',
          services: [],
          background_rotate: false,
        }),
      });
      if (!r.ok) throw new Error('reset failed');
    });
    await page.reload();

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

    await page.evaluate(async () => {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Strandgut',
          language: 'en',
          scan_defaults: 'simple',
          services: [],
          background_rotate: false,
        }),
      });
    });
  });

  test('background status endpoint works', async ({ page }) => {
    await page.goto('/');
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

  test('toggle hidden when feature unavailable', { tag: '@background' }, async ({ page }) => {
    await page.goto('/');

    await page.evaluate(async () => {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Strandgut',
          language: 'en',
          scan_defaults: 'simple',
          services: [],
          background_rotate: false,
        }),
      });
    });
    await page.reload();

    const toggle = page.locator('[data-testid="background-rotate-toggle"]');

    const statusResp = await page.evaluate(async () => {
      const r = await fetch('/api/background/status');
      return r.json();
    });

    if (statusResp.available === false) {
      await expect(toggle).toBeHidden();
    } else {
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
  });
});
