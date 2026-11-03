import { test, expect, gotoApp, seedConfig } from '../support/app.js';

test('configured title replaces the bundled default', async ({ page, request }) => {
  await seedConfig(request, [], { title: 'Harbour Watch' });
  await gotoApp(page, { skipOnboarding: false });
  await expect(page).toHaveTitle('Harbour Watch');
});

test('configured language overrides the browser locale', async ({ page, request }) => {
  await seedConfig(request, [], { language: 'de' });
  await gotoApp(page, { skipOnboarding: false });

  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('[data-testid="edit-toggle"]')).toHaveText(/Bearbeiten|Ansicht/);
});

test('configured scan depth is preselected in the scan dialog', async ({ page, request }) => {
  await seedConfig(request, [], { scan_defaults: 'medium' });
  await gotoApp(page);

  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();

  await expect(page.locator('[data-testid="scan-depth-medium"]')).toBeChecked();
  await expect(page.locator('[data-testid="scan-depth-simple"]')).not.toBeChecked();
});
