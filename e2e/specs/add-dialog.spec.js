import { test, expect } from '@playwright/test';

test('add dialog opens from header', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }
  await page.locator('[data-testid="add-button"]').click();
  await expect(page.locator('[data-testid="add-dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid="add-manual-button"]')).toBeVisible();
  await expect(page.locator('[data-testid="add-scan-button"]')).toBeVisible();
});

test('add dialog can be closed', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-dialog-close"]').click({ force: true });
  await expect(page.locator('[data-testid="add-dialog"]')).toBeHidden();
});

test('add dialog manual opens edit panel', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-manual-button"]').click();
  await expect(page.locator('[data-testid="edit-form"]')).toBeVisible();
});

test('add dialog scan opens scan dialog', async ({ page }) => {
  await page.goto('/');
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }
  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await expect(page.locator('[data-testid="scan-dialog"]')).toBeVisible();
});
