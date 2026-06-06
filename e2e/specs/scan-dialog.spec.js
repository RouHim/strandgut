import { test, expect } from '@playwright/test';

test('scan dialog opens and has inputs', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await expect(page.locator('[data-testid="scan-dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid="scan-host-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="scan-depth-simple"]')).toBeChecked();
  await expect(page.locator('[data-testid="scan-start-button"]')).toBeVisible();
});

test('scan depth radios work', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await page.locator('[data-testid="scan-depth-medium"]').check();
  await expect(page.locator('[data-testid="scan-depth-medium"]')).toBeChecked();
  await expect(page.locator('[data-testid="scan-depth-simple"]')).not.toBeChecked();
});

test('scan dialog can be closed', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await page.locator('[data-testid="scan-dialog-close"]').click({ force: true });
  await expect(page.locator('[data-testid="scan-dialog"]')).toBeHidden();
});



test('dialog close during reachability ping does not error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err));

  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();

  const hostInput = page.locator('[data-testid="scan-host-input"]');
  await hostInput.fill('192.0.2.1');
  await hostInput.blur();

  await page.waitForTimeout(150);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="scan-dialog"]')).toBeHidden();

  await page.waitForTimeout(300);
  expect(errors).toHaveLength(0);
});

test('add discovered service from scan results appears in grid', async ({ page, request }) => {
  await request.put('/api/config', {
    data: { title: 'Strandgut', language: 'en', scan_defaults: 'simple', services: [] }
  });
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await page.route('/api/scan', async route => {
    const body = `event: found\ndata: {"host":"test.local","port":8080,"service_name":"Test Service","title":"Test Service","reachable":true}\n\nevent: done\ndata: {}\n\n`;
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    });
  });

  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await page.locator('[data-testid="scan-start-button"]').click();

  await expect(page.locator('[data-testid="scan-result-card"]')).toBeVisible();
  await page.locator('[data-testid="scan-add-service"]').click();

  await expect(page.locator('[data-testid="tile"]').filter({ hasText: 'Test Service' })).toBeVisible();
});

test('scan result card shows title and reachable dot', async ({ page, request }) => {
  await request.put('/api/config', {
    data: { title: 'Strandgut', language: 'en', scan_defaults: 'simple', services: [] }
  });
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await page.route('/api/scan', async route => {
    const body = `event: found\ndata: {"host":"test.local","port":8080,"service_name":"Test Service","title":"My Dashboard","reachable":true}\n\nevent: done\ndata: {}\n\n`;
    route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });

  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await page.locator('[data-testid="scan-start-button"]').click();

  const card = page.locator('[data-testid="scan-result-card"]');
  await expect(card).toBeVisible();
  // Verify service name is displayed in <strong>
  await expect(card.locator('strong')).toContainText('Test Service');
  // Verify title text is displayed
  await expect(card.locator('.scan-result-card__title')).toBeVisible();
  await expect(card.locator('.scan-result-card__title')).toHaveText('My Dashboard');
  // Verify reachable dot is present
  await expect(card.locator('.scan-result-card__reachable')).toBeVisible();
});

test('scan result card hides reachable dot for unreachable service', async ({ page, request }) => {
  await request.put('/api/config', {
    data: { title: 'Strandgut', language: 'en', scan_defaults: 'simple', services: [] }
  });
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await page.route('/api/scan', async route => {
    const body = `event: found\ndata: {"host":"bad.local","port":9999,"service_name":null,"title":null,"reachable":false}\n\nevent: done\ndata: {}\n\n`;
    route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });

  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await page.locator('[data-testid="scan-start-button"]').click();

  const card = page.locator('[data-testid="scan-result-card"]');
  await expect(card).toBeVisible();
  // Verify host:port is shown as fallback name (no service_name, no title)
  await expect(card.locator('strong')).toContainText('bad.local:9999');
  // Verify reachable dot is NOT present
  await expect(card.locator('.scan-result-card__reachable')).toHaveCount(0);
  // Verify title line is NOT present
  await expect(card.locator('.scan-result-card__title')).toHaveCount(0);
});
