import { test, expect } from '@playwright/test';

test('German locale shows German text', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  const toggleText = await page.locator('[data-testid="edit-toggle"]').textContent();
  expect(toggleText).not.toMatch(/Edit Mode/i);
  await context.close();
});

test('English locale shows English text', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const toggleText = await page.locator('[data-testid="edit-toggle"]').textContent();
  expect(toggleText).toMatch(/Edit|View/i);
  await context.close();
});

test('German locale covers the dialogs too', async ({ browser, request }) => {
  await request.put('/api/config', {
    data: {
      title: 'Test',
      language: 'en',
      scan_defaults: 'simple',
      services: [
        { name: 'One', url: 'http://127.0.0.1:13569/api/health', icon: null, description: null, position: { row: 0, col: 0 } },
      ],
    },
  });

  const context = await browser.newContext({ locale: 'de-DE' });
  const page = await context.newPage();
  await page.goto('/');

  // Add dialog
  await page.locator('[data-testid="add-button"]').click();
  await expect(page.locator('[data-testid="add-dialog"] h2')).toHaveText('Dienst hinzufügen');
  await expect(page.locator('[data-testid="add-manual-button"]')).toHaveText('Manuell hinzufügen');

  // Scan dialog
  await page.locator('[data-testid="add-scan-button"]').click();
  await expect(page.locator('[data-testid="scan-dialog"] h2')).toHaveText('Netzwerk scannen');
  await expect(page.locator('label[for="scan-host"]')).toHaveText('Host / IP');
  await expect(page.locator('[data-testid="scan-depth-deep"] + span')).toHaveText('Tief');
  await expect(page.locator('[data-testid="scan-start-button"]')).toHaveText('Scan starten');

  // Edit panel + validation text
  await page.locator('[data-testid="scan-dialog-close"]').click();
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-manual-button"]').click();
  await expect(page.locator('#edit-panel-title')).toHaveText('Dienst hinzufügen');
  await expect(page.locator('[data-testid="edit-save"]')).toHaveText('Speichern');
  await page.locator('[data-testid="edit-save"]').click();
  await expect(page.locator('[data-testid="edit-name-error"]')).toHaveText('Name ist erforderlich.');
  await expect(page.locator('[data-testid="edit-name-error"]')).toBeVisible();

  await context.close();
});
