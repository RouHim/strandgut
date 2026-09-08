import { test, expect } from '@playwright/test';

test.describe('gpu ambient fallback', () => {
  test.use({ reducedMotion: 'reduce' });

  // NOTE (Task 1 deviation from brief): the brief's verbatim assertion
  // `toHaveCount(0)` cannot pass — Step 6 places the canvas statically in
  // index.html, and nothing in Task 1 removes it (no init is wired yet, and
  // `toHaveCount` counts hidden elements too). The Task-1-observable
  // fallback contract is that WebGPU never *activates*: fitCanvas() never
  // runs, so the canvas keeps its default bitmap size and paints nothing.
  test('webgpu stays inactive when reduced-motion is set', async ({ page }) => {
    await page.goto('/');
    // Dismiss onboarding if present (hides the grid)
    const skip = page.locator('[data-testid="onboarding-skip"]');
    if (await skip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skip.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    await expect(page.locator('[data-testid="service-grid"]')).toBeVisible();
    const canvas = page.locator('[data-testid="gpu-canvas"]');
    await expect(canvas).toHaveCount(1);
    expect(await canvas.evaluate((el) => ({ w: el.width, h: el.height }))).toEqual({
      w: 300,
      h: 150,
    });
  });

  test('gpu modules are served as javascript', async ({ page }) => {
    for (const mod of ['detect.js', 'context.js', 'uniforms.js']) {
      const resp = await page.request.get(`/assets/js/gpu/${mod}`);
      expect(resp.status()).toBe(200);
      expect(resp.headers()['content-type']).toContain('javascript');
    }
  });
});
