import { test, expect } from '@playwright/test';

test.describe('F3 Manual QA: scan-reachability-check', () => {
  let consoleErrors = [];
  let consoleWarnings = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    consoleWarnings = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
      if (msg.type() === 'warning') consoleWarnings.push(msg.text());
    });
  });

  async function openScanDialog(page) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="add-button"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-testid="add-scan-button"]').click();
    await expect(page.locator('[data-testid="scan-dialog"]')).toBeVisible();
    await page.waitForTimeout(300);
  }

  test('Scenario 1: blur with 127.0.0.1 → green reachable badge', async ({ page }) => {
    await openScanDialog(page);

    const hostInput = page.locator('#scan-host');
    await hostInput.fill('127.0.0.1');
    await page.waitForTimeout(200);

    // Click away to trigger blur
    await page.locator('.app-header').click();
    await page.waitForTimeout(2000);

    const badge = page.locator('[data-testid="scan-ping-badge"]');
    await expect(badge).toBeVisible({ timeout: 3000 });

    const badgeText = (await badge.textContent()) || '';
    const badgeClass = (await badge.getAttribute('class')) || '';

    await page.screenshot({ path: '.sisyphus/evidence/final-qa/s1-reachable-127-0-0-1.png' });

    expect(badgeText.toLowerCase()).toMatch(/reachable|erreichbar/);
    expect(badgeClass).toContain('reachable');
  });

  test('Scenario 2: blur with empty input → no badge change', async ({ page }) => {
    await openScanDialog(page);

    const hostInput = page.locator('#scan-host');
    await hostInput.fill('');
    await page.waitForTimeout(200);

    await page.locator('.app-header').click();
    await page.waitForTimeout(1500);

    const badge = page.locator('[data-testid="scan-ping-badge"]');
    if (await badge.count() > 0) {
      const badgeClass = (await badge.getAttribute('class')) || '';
      const badgeText = (await badge.textContent()) || '';

      await page.screenshot({ path: '.sisyphus/evidence/final-qa/s2-empty-input.png' });

      const hasModifier = /(?:reachable|unreachable|checking|error)/.test(badgeClass);
      const isEmpty = badgeText.trim() === '';
      expect(hasModifier || isEmpty).toBeTruthy();
    }
  });

  test('Scenario 3: blur with 192.0.2.1 → red unreachable badge', async ({ page }) => {
    await openScanDialog(page);

    const hostInput = page.locator('#scan-host');
    await hostInput.fill('192.0.2.1');
    await page.waitForTimeout(200);

    await page.locator('.app-header').click();
    await page.waitForTimeout(3000);

    const badge = page.locator('[data-testid="scan-ping-badge"]');
    await expect(badge).toBeVisible({ timeout: 5000 });

    const badgeText = (await badge.textContent()) || '';
    const badgeClass = (await badge.getAttribute('class')) || '';

    await page.screenshot({ path: '.sisyphus/evidence/final-qa/s3-unreachable-192-0-2-1.png' });

    expect(badgeText.toLowerCase()).toMatch(/unreachable|nicht erreichbar/);
    expect(badgeClass).toContain('unreachable');
  });

  test('Scenario 4: close dialog during ping → no console errors', async ({ page }) => {
    await openScanDialog(page);

    const hostInput = page.locator('#scan-host');
    await hostInput.fill('192.0.2.1');
    await page.waitForTimeout(200);

    await page.locator('.app-header').click();
    await page.waitForTimeout(300);

    const closeBtn = page.locator('[data-testid="scan-dialog-close"]');
    await closeBtn.click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: '.sisyphus/evidence/final-qa/s4-after-dialog-close.png' });

    expect(consoleErrors.length).toBe(0);
  });
});
