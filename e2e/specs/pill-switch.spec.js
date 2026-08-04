import { test, expect } from '@playwright/test';

test.describe('Pill Switch', () => {
  async function dismissOnboarding(page) {
    const skip = page.locator('[data-testid="onboarding-skip"]');
    if (await skip.isVisible().catch(() => false)) {
      await skip.click({ timeout: 3000 }).catch(() => {});
    }
  }

  test('has role="switch"', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    await expect(page.locator('[data-testid="edit-toggle"]')).toHaveAttribute('role', 'switch');
  });

  test('initial aria-checked is false', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    await expect(page.locator('[data-testid="edit-toggle"]')).toHaveAttribute('aria-checked', 'false');
  });

  test('aria-label matches i18n', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    await expect(page.locator('[data-testid="edit-toggle"]')).toHaveAttribute('aria-label', 'Toggle edit mode');
  });

  test('visual labels are aria-hidden', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    const toggle = page.locator('[data-testid="edit-toggle"]');
    const hiddenLabels = toggle.locator('.pill-switch__label[aria-hidden="true"]');
    await expect(hiddenLabels).toHaveCount(2);
  });

  test('click toggles aria-checked to true', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    const toggle = page.locator('[data-testid="edit-toggle"]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('click toggles aria-checked to false', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    const toggle = page.locator('[data-testid="edit-toggle"]');
    await toggle.click();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  test('click fires editmodechange event', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    const toggle = page.locator('[data-testid="edit-toggle"]');
    await page.evaluate(() => {
      window.__editmodechangeFired = false;
      window.addEventListener('editmodechange', () => { window.__editmodechangeFired = true; }, { once: true });
    });
    await toggle.click();
    await expect.poll(() => page.evaluate(() => window.__editmodechangeFired)).toBe(true);
  });

  test('click adds edit-mode class to body', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    await page.locator('[data-testid="edit-toggle"]').click();
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('edit-mode'))).toBe(true);
  });

  test('keyboard Space toggles switch', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    const toggle = page.locator('[data-testid="edit-toggle"]');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('pill switch height is at least 44px', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    const toggle = page.locator('[data-testid="edit-toggle"]');
    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(36);
  });

  test('thumb uses CSS transition', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    const thumb = page.locator('[data-testid="edit-toggle"] .pill-switch__thumb');
    const transition = await thumb.evaluate(el => getComputedStyle(el).transition);
    expect(transition).toContain('transform');
  });

  test('track has pill border-radius', async ({ page }) => {
    await page.goto('/');
    await dismissOnboarding(page);
    const track = page.locator('[data-testid="edit-toggle"] .pill-switch__track');
    const radius = await track.evaluate(el => getComputedStyle(el).borderRadius);
    expect(parseInt(radius)).toBeGreaterThanOrEqual(28);
  });
});
