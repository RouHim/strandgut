import { test, expect } from '@playwright/test';

test.describe('gpu ambient fallback', () => {
  test('no canvas when reduced-motion is set', async ({ page }) => {
    // Playwright 1.62.1 drops the reducedMotion test option (no such fixture
    // in the runner bundle), so emulate in-body instead of test.use().
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    // Dismiss onboarding if present (hides the grid)
    const skip = page.locator('[data-testid="onboarding-skip"]');
    if (await skip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skip.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
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
  // NOTE: test.info() is only valid inside a test body. Gate per-test.
  test('canvas presents one frame', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'webgpu',
      'needs the webgpu project (SwiftShader flags)'
    );
    await page.goto('/');
    const canvas = page.locator('[data-testid="gpu-canvas"]');
    await expect(canvas).toBeVisible();
    const size = await canvas.evaluate((el) => ({
      w: el.width,
      h: el.height,
    }));
    expect(size.w).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);
    await expect(page.locator('[data-testid="service-grid"]')).toBeVisible();
  });
});

test.describe('tile tilt fallback', () => {
  test('hover tilts tile without canvas', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'needs hover-capable viewport');
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'gpu', { value: undefined });
    });
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
    const tile = page.locator('[data-testid="tile"]').first();
    await expect(tile).toBeVisible();
    await tile.hover();
    expect(await tile.evaluate((el) => el.style.transform)).toContain('perspective');
    await expect(page.locator('[data-testid="gpu-canvas"]')).toHaveCount(0);
  });
});
