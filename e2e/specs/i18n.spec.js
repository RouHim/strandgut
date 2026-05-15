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
