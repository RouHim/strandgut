import { test, expect, dismissOnboarding, gotoApp } from '../support/app.js';

// A backend that cannot be reached is not an empty install (harden).

test('a config load failure shows an error state, not the onboarding', async ({ page }) => {
  await page.route('**/api/config', (route) => route.abort());
  await gotoApp(page, { skipOnboarding: false });

  const error = page.locator('[data-testid="load-error"]');
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('role', 'alert');
  await expect(page.locator('[data-testid="load-error-retry"]')).toBeVisible();

  // The onboarding must not pretend the shore is empty.
  await expect(page.locator('[data-testid="onboarding"]')).toHaveAttribute('aria-hidden', 'true');
});

test('a failed auto-save surfaces a banner with retry instead of an alert', async ({ page, request }) => {
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

  let putBlocked = true;
  let alerts = 0;
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'alert') {
      alerts += 1;
      dialog.dismiss();
    } else {
      dialog.accept();
    }
  });
  await page.route('**/api/config', (route) => {
    if (putBlocked && route.request().method() === 'PUT') {
      return route.abort();
    }
    return route.continue();
  });

  await gotoApp(page, { skipOnboarding: false });

  // Enter edit mode and delete the service: that PUT fails while blocked.
  await page.locator('[data-testid="edit-toggle"]').click();
  await page.locator('[data-testid="delete-tile"]').first().click();
  await page.locator('[data-testid="confirm-delete-ok"]').click();

  const banner = page.locator('[data-testid="save-banner"]');
  await expect(banner).toBeVisible();
  expect(alerts).toBe(0);

  // After the backend recovers, the retry stores the change and clears the banner.
  putBlocked = false;
  await page.locator('[data-testid="save-retry"]').click();
  await expect(banner).toBeHidden();
});
