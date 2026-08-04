import { test, expect } from '@playwright/test';

test('URL open button visible and enabled for service with URL', async ({ page, request }) => {
  await request.put('/api/config', {
    data: {
      title: 'Test',
      language: 'en',
      scan_defaults: 'simple',
      services: [{ name: 'Example', url: 'https://example.com', icon: 'globe', position: { row: 0, col: 0 } }]
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }

  await page.locator('[data-testid="edit-toggle"]').click();
  await page.locator('[data-testid="edit-tile"]').first().click();

  const panel = page.locator('.edit-panel-overlay');
  await expect(panel).toBeVisible();

  const urlOpenBtn = page.locator('[data-testid="edit-url-open"]');
  await expect(urlOpenBtn).toBeVisible();
  await expect(urlOpenBtn).toBeEnabled();

  const svg = urlOpenBtn.locator('svg');
  await expect(svg).toBeVisible();

  const urlInput = page.locator('#edit-url');
  await expect(urlInput).toHaveClass(/edit-input--url/);

  await panel.locator('[data-testid="edit-cancel"]').click();
});

test('URL open button disabled when URL is empty', async ({ page, request }) => {
  await request.put('/api/config', {
    data: {
      title: 'Test',
      language: 'en',
      scan_defaults: 'simple',
      services: [{ name: 'Empty URL', url: '', icon: 'globe', position: { row: 0, col: 0 } }]
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }

  await page.locator('[data-testid="edit-toggle"]').click();
  await page.locator('[data-testid="edit-tile"]').first().click();

  const panel = page.locator('.edit-panel-overlay');
  await expect(panel).toBeVisible();

  const urlOpenBtn = page.locator('[data-testid="edit-url-open"]');
  await expect(urlOpenBtn).toBeVisible();
  await expect(urlOpenBtn).toBeDisabled();

  // Typing a URL should enable the button
  const urlInput = page.locator('#edit-url');
  await urlInput.fill('https://test.com');
  await expect(urlOpenBtn).toBeEnabled();

  // Clearing the URL should disable again
  await urlInput.fill('');
  await expect(urlOpenBtn).toBeDisabled();

  await panel.locator('[data-testid="edit-cancel"]').click();
});
