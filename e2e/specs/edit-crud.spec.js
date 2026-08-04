import { test, expect } from '@playwright/test';

test('toggle enters edit mode', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }
  await page.locator('[data-testid="edit-toggle"]').click();
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('edit-mode'))).toBe(true);
});

test('toggle returns to view mode', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }
  const toggle = page.locator('[data-testid="edit-toggle"]');
  await toggle.click();
  await toggle.click();
  await expect.poll(() => page.evaluate(() => document.body.classList.contains('edit-mode'))).toBe(false);
});

test('edit controls survive toggle off and on', async ({ page, request }) => {
  await request.put('/api/config', {
    data: {
      title: 'Test',
      language: 'en',
      scan_defaults: 'simple',
      services: [
        { name: 'Survivor', url: 'http://survivor.local', icon: null, description: null, position: { row: 0, col: 0 } },
      ],
    },
  });
  await page.goto('/');
  const toggle = page.locator('[data-testid="edit-toggle"]');
  await toggle.click();
  await expect(page.locator('[data-testid="edit-tile"]')).toBeVisible();
  await toggle.click();
  await expect(page.locator('[data-testid="edit-tile"]')).toBeHidden();
  await toggle.click();
  await expect(page.locator('[data-testid="edit-tile"]')).toBeVisible();
});

test('add service via edit panel and persist', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }
  await page.locator('[data-testid="edit-toggle"]').click();
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-manual-button"]').click();
  await page.locator('[data-testid="edit-name"]').fill('My Test App');
  await page.locator('[data-testid="edit-url"]').fill('http://test-app.local:8080');
  const savePromise = page.waitForResponse(response => response.url().includes('/api/config') && response.request().method() === 'PUT');
  await page.locator('[data-testid="edit-save"]').click({ force: true });
  await expect(page.locator('.tile').filter({ hasText: 'My Test App' })).toBeVisible();
  await savePromise;
  await page.reload();
  await expect(page.locator('.tile').filter({ hasText: 'My Test App' })).toBeVisible();
});

test('delete service', async ({ page, request }) => {
  await request.put('/api/config', {
    data: {
      title: 'Test',
      language: 'en',
      scan_defaults: 'simple',
      services: [
        { name: 'To Delete', url: 'http://delete-me.local', icon: null, description: null, position: { row: 0, col: 0 } },
      ],
    },
  });
  await page.goto('/');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('[data-testid="edit-toggle"]').click();
  const deleteBtn = page.locator('[data-testid="delete-tile"]').first();
  const savePromise = page.waitForResponse(response => response.url().includes('/api/config') && response.request().method() === 'PUT');
  await deleteBtn.click();
  await savePromise;
  await page.reload();
  const onboarding = page.locator('[data-testid="onboarding"]');
  await expect(onboarding).toBeVisible();
});

test('edit existing service and persist', async ({ page, request }) => {
  await request.put('/api/config', {
    data: {
      title: 'Test',
      language: 'en',
      scan_defaults: 'simple',
      services: [
        { name: 'To Edit', url: 'http://edit-me.local', icon: null, description: null, position: { row: 0, col: 0 } },
      ],
    },
  });
  await page.goto('/');
  await page.locator('[data-testid="edit-toggle"]').click();
  await page.locator('[data-testid="edit-tile"]').first().click();
  await page.locator('[data-testid="edit-name"]').fill('Edited Name');
  const savePromise = page.waitForResponse(response => response.url().includes('/api/config') && response.request().method() === 'PUT');
  await page.locator('[data-testid="edit-save"]').click({ force: true });
  await expect(page.locator('.tile').filter({ hasText: 'Edited Name' })).toBeVisible();
  await savePromise;
  await page.reload();
  await expect(page.locator('.tile').filter({ hasText: 'Edited Name' })).toBeVisible();
});

test('edit form validation shows errors', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }
  await page.locator('[data-testid="edit-toggle"]').click();
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-manual-button"]').click();
  await page.locator('[data-testid="edit-save"]').click({ force: true });
  await expect(page.locator('[data-testid="edit-name-error"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="edit-url-error"]')).toHaveCount(1);
});
