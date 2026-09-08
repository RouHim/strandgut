import { test, expect } from '@playwright/test';

test.describe('gpu ambient fallback', () => {
  // In-body emulation: installed Playwright 1.62.1 drops reducedMotion
  // from test.use/project fixtures. Meaningful everywhere: headless
  // Chromium HAS WebGL2, so the gate must actively stop the canvas.
  test('no canvas when reduced-motion is set', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    // Seed one service: with zero services the app shows onboarding instead
    // of the grid (Ruling 7 — tests must not depend on ambient local config).
    await page.evaluate(async () => {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Strandgut',
          language: 'en',
          scan_defaults: 'simple',
          services: [
            { name: 'S1', url: 'http://example.com', position: { row: 0, col: 0 } },
          ],
        }),
      });
    });
    await page.reload();
    await expect(page.locator('[data-testid="service-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="gpu-canvas"]')).toHaveCount(0);
  });

  test('gpu modules are served as javascript', async ({ page }) => {
    for (const mod of ['detect.js', 'context.js', 'uniforms.js']) {
      const resp = await page.request.get(`/assets/js/gpu/${mod}`);
      expect(resp.status()).toBe(200);
      expect(resp.headers()['content-type']).toContain('javascript');
    }
  });
});

test.describe('gpu ambient presence', () => {
  test('canvas presents one frame', async ({ page }) => {
    await page.goto('/');
    // Seed one service: with zero services the app shows onboarding instead
    // of the grid, so the grid assertion below needs ambient state.
    await page.evaluate(async () => {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Strandgut',
          language: 'en',
          scan_defaults: 'simple',
          services: [
            { name: 'S1', url: 'http://example.com', position: { row: 0, col: 0 } },
          ],
        }),
      });
    });
    await page.reload();
    // Marker, not visibility: context-loss teardown may remove the canvas
    // after frames were presented.
    await expect
      .poll(() => page.evaluate(() => window.__gpuPresented === true), {
        timeout: 30000,
      })
      .toBe(true);
    await expect(page.locator('[data-testid="service-grid"]')).toBeVisible();
  });
});

test.describe('tile tilt fallback', () => {
  test('hover tilts tile without canvas', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'needs hover-capable viewport');
    await page.goto('/');
    await page.evaluate(async () => {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Strandgut',
          language: 'en',
          scan_defaults: 'simple',
          services: [
            { name: 'S1', url: 'http://example.com', position: { row: 0, col: 0 } },
            { name: 'S2', url: 'http://example.com', position: { row: 0, col: 1 } },
          ],
        }),
      });
    });
    await page.reload();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const tile = page.locator('[data-testid="tile"]').first();
    await expect(tile).toBeVisible();
    await tile.hover();
    expect(await tile.evaluate((el) => el.style.transform)).toContain('perspective');
    await expect(page.locator('[data-testid="gpu-canvas"]')).toHaveCount(0);
  });
});
