import { test, expect } from '@playwright/test';

test('theme toggle changes data-theme attribute', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('theme', 'dark');
  });
  await page.reload();

  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.locator('#theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.locator('#theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('theme persists across page reload', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('OS preference auto-detection when no stored preference', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.evaluate(() => localStorage.clear());
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('FOWT prevention — data-theme set before first paint', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload({ waitUntil: 'domcontentloaded' });

  const theme = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme')
  );
  expect(theme).toBe('dark');
});

test('toggle has correct ARIA attributes', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('#theme-toggle');

  await expect(toggle).toHaveAttribute('role', 'switch');
  await expect(toggle).toHaveAttribute('aria-label', /Switch to (light|dark) theme/);
  await expect(toggle).toHaveAttribute('aria-checked', /true|false/);
});

test('keyboard accessibility — Enter toggles theme', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('theme', 'dark');
  });
  await page.reload();

  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.click();

  const toggle = page.locator('#theme-toggle');
  await toggle.focus();
  await expect(toggle).toBeFocused();

  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('graceful degradation when localStorage is unavailable', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { return undefined; },
      configurable: true
    });
  });

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(consoleErrors).toHaveLength(0);
  expect(pageErrors).toHaveLength(0);
});

test('scan dialog renders correctly in light theme', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('theme', 'light');
  });
  await page.reload();

  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.click();

  await page.locator('[data-testid="add-button"]').click();
  await page.locator('[data-testid="add-scan-button"]').click();
  await expect(page.locator('[data-testid="scan-dialog"]')).toBeVisible();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('theme icon updates when theme changes', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('theme', 'dark');
  });
  await page.reload();

  const sun = page.locator('#theme-toggle .theme-icon-sun');
  const moon = page.locator('#theme-toggle .theme-icon-moon');

  await expect(sun).toBeVisible();
  await expect(moon).toBeHidden();

  await page.locator('#theme-toggle').click();

  await expect(sun).toBeHidden();
  await expect(moon).toBeVisible();
});
