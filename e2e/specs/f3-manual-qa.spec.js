import { test, expect } from '@playwright/test';

test.describe('F3 Manual QA: scan-reachability-check', () => {
  let consoleErrors = [];
  let consoleWarnings = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    consoleWarnings = [];

    // Capture uncaught JS exceptions (not resource load errors)
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
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

  test('Scenario 4: close dialog during ping → no console errors', async ({ page }) => {
    await openScanDialog(page);

    const hostInput = page.locator('#scan-host');
    await hostInput.fill('192.0.2.1');
    await page.waitForTimeout(200);

    await hostInput.blur();
    await page.waitForTimeout(300);

    const closeBtn = page.locator('[data-testid="scan-dialog-close"]');
    await closeBtn.click({ force: true });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: '.sisyphus/evidence/final-qa/s4-after-dialog-close.png' });

    expect(consoleErrors.length).toBe(0);
  });
});
