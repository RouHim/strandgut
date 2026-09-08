import { test, expect } from '@playwright/test';

test.describe('gpu ambient fallback', () => {
  test.use({ reducedMotion: 'reduce' });

  test('no canvas when reduced-motion is set', async ({ page }) => {
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
