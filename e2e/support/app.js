import { test as base, expect } from '@playwright/test';

export const EMPTY_CONFIG = {
  title: 'Test',
  language: 'en',
  scan_defaults: 'simple',
  background_rotate: false,
  services: [],
};

/**
 * Wait until the app has rendered either tiles or the onboarding pane.
 * `networkidle` is unreliable because tile icons load from external CDNs.
 */
export async function waitForApp(page) {
  await page.waitForFunction(() => {
    const tiles = document.querySelectorAll('[data-testid="tile"]');
    const onboarding = document.querySelector('[data-testid="onboarding"]');
    return tiles.length > 0 || onboarding?.getAttribute('aria-hidden') === 'false';
  });
}

/** Tolerantly dismiss onboarding when it is visible. */
export async function dismissOnboarding(page) {
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
  }
}

/** Navigate, wait deterministically, and optionally dismiss onboarding. */
export async function gotoApp(page, { skipOnboarding = true } = {}) {
  await page.goto('/');
  await waitForApp(page);
  if (skipOnboarding) await dismissOnboarding(page);
}

/** Replace the server config for this test. */
export async function seedConfig(request, services, overrides = {}) {
  await request.put('/api/config', {
    data: { ...EMPTY_CONFIG, ...overrides, services },
  });
}

/** A service fixture with the persisted position contract. */
export function service(name, url, col = 0, extra = {}) {
  return {
    name,
    url,
    icon: null,
    description: null,
    position: { row: 0, col },
    ...extra,
  };
}

/** Stub the scan endpoint with a complete SSE body. */
export async function stubScan(page, body, status = 200) {
  await page.route('**/api/scan', (route) =>
    route.fulfill({ status, contentType: 'text/event-stream', body }),
  );
}

/**
 * Fixture seam: every spec gets a page whose uncaught errors fail the test and
 * whose config is reset afterwards, so spec files stop depending on each other.
 */
export const test = base.extend({
  page: async ({ page, request }, use) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await use(page);

    await request.put('/api/config', { data: EMPTY_CONFIG });
    expect(pageErrors, 'uncaught page errors').toEqual([]);
  },
});

export { expect };
