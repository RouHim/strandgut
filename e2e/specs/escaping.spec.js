import { test, expect, gotoApp, seedConfig, service, stubScan } from '../support/app.js';

const trickyName = 'He said "hi" <b>bold</b>';
const trickyDescription = 'line "one" & <two>';

test('tile names are text, not markup', async ({ page, request }) => {
  await seedConfig(request, [
    service(trickyName, 'https://example.com/?q="x"', 0, {
      icon: 'globe',
      description: trickyDescription,
    }),
  ]);
  await gotoApp(page, { skipOnboarding: false });

  const title = page.locator('[data-testid="tile"] .tile-title');
  await expect(title).toHaveText(trickyName);
  await expect(page.locator('[data-testid="tile"] b')).toHaveCount(0);
});

test('edit inputs preserve quotes and angle brackets', async ({ page, request }) => {
  await seedConfig(request, [
    service(trickyName, 'https://example.com/?q="x"', 0, {
      icon: 'globe',
      description: trickyDescription,
    }),
  ]);
  await gotoApp(page, { skipOnboarding: false });

  await page.locator('[data-testid="edit-toggle"]').click();
  await page.locator('[data-testid="edit-tile"]').first().click();

  await expect(page.locator('[data-testid="edit-name"]')).toHaveValue(trickyName);
  await expect(page.locator('[data-testid="edit-description"]')).toHaveValue(trickyDescription);
  await expect(page.locator('[data-testid="edit-url"]')).toHaveValue('https://example.com/?q="x"');
  await expect(page.locator('[data-testid="edit-name"] b')).toHaveCount(0);

  await page.locator('[data-testid="edit-cancel"]').click();
});

test('scan result cards render host, name and title as text', async ({ page, request }) => {
  await seedConfig(request, []);
  const result = {
    host: '127.0.0.1',
    port: 8080,
    service_name: trickyName,
    icon_slug: null,
    title: 'Title "quoted" <b>x</b>',
    reachable: false,
  };
  const body = `event: found\ndata: ${JSON.stringify(result)}\n\nevent: done\n\n`;

  await stubScan(page, body);
  await gotoApp(page, { skipOnboarding: false });
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await page.locator('[data-testid="scan-start-button"]').click();

  const card = page.locator('[data-testid="scan-result-card"]').first();
  await expect(card).toContainText(trickyName);
  await expect(card).toContainText('Title "quoted" <b>x</b>');
  await expect(card.locator('b')).toHaveCount(0);

  await page.locator('[data-testid="scan-close-button"]').click();
});
