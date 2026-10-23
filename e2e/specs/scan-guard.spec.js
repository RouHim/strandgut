import { test, expect, dismissOnboarding, seedConfig, service } from '../support/app.js';

async function openScanDialog(page) {
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await expect(page.locator('[data-testid="scan-dialog"]')).toBeVisible();
}

test('a port range disables the scan depth and says why', async ({ page, request }) => {
  await seedConfig(request, [service('One', 'http://127.0.0.1:13569/api/health')]);
  await page.goto('/');
  await openScanDialog(page);

  const hint = page.locator('[data-testid="scan-ports-hint"]');
  const deep = page.locator('[data-testid="scan-depth-deep"]');

  await expect(hint).toBeHidden();
  expect(await deep.isEnabled()).toBe(true);

  await page.locator('[data-testid="scan-advanced-toggle"] summary').click();
  await page.fill('[data-testid="scan-ports-input"]', '80,443');

  await expect(hint).toBeVisible();
  expect(await deep.isDisabled()).toBe(true);

  await page.fill('[data-testid="scan-ports-input"]', '');
  await expect(hint).toBeHidden();
  expect(await deep.isEnabled()).toBe(true);
});

test('closing a running scan asks before discarding it', async ({ page, request }) => {
  await seedConfig(request, [service('One', 'http://127.0.0.1:13569/api/health')]);
  await page.goto('/');
  await openScanDialog(page);

  // An unroutable host with three ports keeps the scan in flight for ~2 s.
  await page.fill('[data-testid="scan-host-input"]', '10.255.255.1');
  await page.locator('[data-testid="scan-advanced-toggle"] summary').click();
  await page.fill('[data-testid="scan-ports-input"]', '80,443,8080');
  await page.locator('[data-testid="scan-start-button"]').click();
  await expect(page.locator('[data-testid="scan-status"]')).toContainText('Scanning');

  // Closing must ask first, and "Keep scanning" must leave everything running.
  await page.locator('[data-testid="scan-dialog-close"]').click();
  const confirm = page.locator('[data-testid="scan-abort-confirm"]');
  await expect(confirm).toBeVisible();
  await expect(page.locator('[data-testid="scan-dialog"]')).toBeVisible();

  await page.locator('[data-testid="scan-abort-keep"]').click();
  await expect(confirm).toHaveCount(0);
  await expect(page.locator('[data-testid="scan-dialog"]')).toBeVisible();

  // The second ask closes when the user insists.
  await page.locator('[data-testid="scan-dialog-close"]').click();
  await page.locator('[data-testid="scan-abort-close"]').click();
  await expect(page.locator('[data-testid="scan-dialog"]')).toHaveCount(0);
});
