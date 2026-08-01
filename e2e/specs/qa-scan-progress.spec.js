// QA: Scan Progress Feature - Manual Verification Scenarios
// Run: cd e2e && npx playwright test specs/qa-scan-progress.mjs --project=desktop

import { test, expect } from '@playwright/test';

test.describe('Scan Progress QA', () => {

  // ─── SCENARIO 1: Medium scan → progress bar visible ───
  test('Scenario 1: Medium scan shows progress bar', async ({ page }) => {
    await page.route('/api/scan', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();

      const chunks = [
        'event: found\ndata: {"host":"test.local","port":8123,"service_name":"Test","icon_slug":"globe"}\n\n',
        'event: done\n\n',
      ];

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: chunks.join(''),
      });
    });

    await page.goto('/');

    await page.click('[data-testid="add-button"]');
    await expect(page.locator('[data-testid="add-dialog"]')).toBeVisible();
    await page.click('[data-testid="add-scan-button"]');
    await expect(page.locator('[data-testid="scan-dialog"]')).toBeVisible();

    await page.click('[data-testid="scan-depth-medium"]');
    await expect(page.locator('[data-testid="scan-depth-medium"]')).toBeChecked();

    await page.click('[data-testid="scan-start-button"]');

    const progressTrack = page.locator('.scan-progress');
    await expect(progressTrack).toBeVisible({ timeout: 5000 });
    await expect(progressTrack).not.toHaveAttribute('hidden');

    await expect(page.locator('[data-testid="scan-status"]')).toContainText('Scan complete', { timeout: 5000 });

    await expect(page.locator('[data-testid="scan-close-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="scan-result-card"]')).toHaveCount(1);
  });

  // ─── SCENARIO 2: Simple scan → progress bar visible ───
  test('Scenario 2: Simple scan shows progress bar', async ({ page }) => {
    await page.goto('/');

    await page.click('[data-testid="add-button"]');
    await page.click('[data-testid="add-scan-button"]');

    await expect(page.locator('[data-testid="scan-depth-simple"]')).toBeChecked();

    await page.click('[data-testid="scan-start-button"]');

    const progressTrack = page.locator('.scan-progress');
    await expect(progressTrack).toBeVisible({ timeout: 5000 });
    await expect(progressTrack).not.toHaveAttribute('hidden');

    // Wait for scan to complete (simple scan is fast, status may skip "Scanning…")
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-testid="scan-status"]');
      return status && (status.textContent.includes('complete') || status.textContent.includes('No services'));
    }, { timeout: 30000 });

    await expect(progressTrack).toBeVisible();
  });

  // ─── SCENARIO 3: Mock empty SSE → "No services found" ───
  test('Scenario 3: Empty scan shows "No services found"', async ({ page }) => {
    await page.route('/api/scan', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Transfer-Encoding': 'chunked',
        },
        body: 'event: done\n\n',
      });
    });

    await page.goto('/');

    await page.click('[data-testid="add-button"]');
    await page.click('[data-testid="add-scan-button"]');

    await page.click('[data-testid="scan-start-button"]');

    await page.waitForFunction(() => {
      const status = document.querySelector('[data-testid="scan-status"]');
      return status && status.textContent.includes('No services found');
    }, { timeout: 10000 });

    const statusText = await page.locator('[data-testid="scan-status"]').textContent();
    console.log(`[Scenario 3] Status: ${statusText}`);
    expect(statusText).toContain('No services found');

    await expect(page.locator('[data-testid="scan-result-card"]')).toHaveCount(0);
  });

  // ─── SCENARIO 4: German locale → "Scanning…" / "Keine Dienste gefunden" ───
  test('Scenario 4: German locale shows correct strings', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'language', { value: 'de', configurable: true });
    });

    await page.route('/api/scan', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();

      // Hold the stream open briefly so the transient "Scanning…" status is
      // observable before `done` flips it to "Keine Dienste gefunden".
      await new Promise((resolve) => setTimeout(resolve, 750));

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Transfer-Encoding': 'chunked',
        },
        body: 'event: done\n\n',
      });
    });

    await page.goto('/');

    await page.click('[data-testid="add-button"]');
    await page.click('[data-testid="add-scan-button"]');

    const heading = await page.locator('[data-testid="scan-dialog"] h2').textContent();
    console.log(`[Scenario 4] Scan dialog title: ${heading}`);

    await page.click('[data-testid="scan-depth-medium"]');
    await page.click('[data-testid="scan-start-button"]');

    await expect(page.locator('[data-testid="scan-status"]')).toContainText('Scanning…', { timeout: 5000 });
    console.log('[Scenario 4] ✓ "Scanning…" found');

    await page.waitForFunction(() => {
      const status = document.querySelector('[data-testid="scan-status"]');
      return status && status.textContent.includes('Keine Dienste gefunden');
    }, { timeout: 10000 });

    const finalStatus = await page.locator('[data-testid="scan-status"]').textContent();
    console.log(`[Scenario 4] Final status: ${finalStatus}`);
    expect(finalStatus).toContain('Keine Dienste gefunden');
    console.log('[Scenario 4] ✓ "Keine Dienste gefunden" found');
  });

});
