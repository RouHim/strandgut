import { test as base, expect } from '@playwright/test';

export const EMPTY_CONFIG = {
  title: 'Test',
  scan_defaults: 'simple',
  background_rotate: false,
  services: [],
};

/**
 * Wait until `app.js` has completed its first init pass.
 * `networkidle` is unreliable because tile icons load from external CDNs.
 */
export async function waitForApp(page) {
  await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
}

/** Dismiss onboarding when it is visible, after the app is ready. */
export async function dismissOnboarding(page) {
  await waitForApp(page);
  const skip = page.locator('[data-testid="onboarding-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 });
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

/**
 * Stub the background endpoints so the rotation feature is always available,
 * independent of PEXELS_API_KEY.
 */
export async function stubBackground(page) {
  await page.route('**/api/background/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        rotate_enabled: false,
        photo: {
          photographer: 'Ada',
          photographer_url: 'https://example.com/ada',
          photo_url: '/assets/img/logo.svg',
        },
      }),
    }),
  );
}

/** Stub the background endpoints as unavailable (no PEXELS_API_KEY). */
export async function stubBackgroundUnavailable(page) {
  await page.route('**/api/background/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: false, rotate_enabled: false, photo: null }),
    }),
  );
}

/**
 * Stub the scan endpoint with a request that never answers, so a scan stays
 * in flight for as long as the test needs it.
 */
export async function stubScanPending(page) {
  await page.route('**/api/scan', () => new Promise(() => {}));
}

/** Stub the scan endpoint with a complete SSE body. */
export async function stubScan(page, body, status = 200) {
  await page.route('**/api/scan', (route) =>
    route.fulfill({ status, contentType: 'text/event-stream', body }),
  );
}

/**
 * Fixture seam: every test resets the server config, every page collects
 * uncaught errors, so spec files stop depending on execution order.
 */
export const test = base.extend({
  configReset: [
    async ({ request }, use) => {
      // Reset before and after: the first test of a run must not inherit a
      // config left behind by a previous run or a dev server.
      await request.put('/api/config', { data: EMPTY_CONFIG });
      await use();
      await request.put('/api/config', { data: EMPTY_CONFIG });
    },
    { auto: true },
  ],
  page: async ({ page }, use) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await use(page);

    expect(pageErrors, 'uncaught page errors').toEqual([]);
  },
});

export { expect };
