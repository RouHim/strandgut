import { test, expect } from '@playwright/test';

test.describe('gpu ambient fallback', () => {
  // In-body emulation: installed Playwright 1.62.1 drops reducedMotion
  // from test.use/project fixtures. Meaningful everywhere: headless
  // Chromium HAS WebGL2, so the gate must actively stop the canvas.
  test('no canvas when reduced-motion is set', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
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
