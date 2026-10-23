import { test, expect, dismissOnboarding, gotoApp } from '../support/app.js';

test('progress bar visible during medium scan', async ({ page }) => {
  await gotoApp(page);

  await page.route('/api/scan', async route => {
    const body = 'event: done\n\n';
    route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });

  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await page.locator('[data-testid="scan-depth-medium"]').check();
  await page.locator('[data-testid="scan-start-button"]').click();

  await expect(page.locator('[data-testid="scan-progress-bar"]')).toBeVisible();
});

test('progress bar visible during simple scan', async ({ page }) => {
  await gotoApp(page);

  await page.route('/api/scan', async route => {
    const body = 'event: done\n\n';
    route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });

  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await page.locator('[data-testid="scan-start-button"]').click();

  await expect(page.locator('[data-testid="scan-progress-bar"]')).toBeVisible();
});

test('scanning status shown during scan', async ({ page }) => {
  await gotoApp(page);

  await page.route('/api/scan', async route => {
    // Delay so the UI has time to render "Scanning…" before scan completes
    await new Promise(r => setTimeout(r, 200));
    const body = 'event: done\n\n';
    route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });

  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await page.locator('[data-testid="scan-depth-medium"]').check();
  await page.locator('[data-testid="scan-start-button"]').click();

  await expect(page.locator('[data-testid="scan-status"]')).toHaveText('Scanning\u2026');
});
