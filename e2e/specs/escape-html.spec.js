import { test, expect } from '@playwright/test';

// Characterization tests for escapeHtml() in assets/js/api.js.
// Pins current escaping behavior so refactors cannot silently change
// the XSS-relevant output. Values below reflect observed browser behavior.

function escapeInPage(page, input) {
  return page.evaluate((value) => import('/assets/js/api.js').then((m) => m.escapeHtml(value)), input);
}

test('escapeHtml escapes HTML metacharacters', async ({ page }) => {
  await page.goto('/');

  expect(await escapeInPage(page, '<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(await escapeInPage(page, 'a & b')).toBe('a &amp; b');
  // Quotes are not escaped: textContent -> innerHTML only escapes <, >, &.
  expect(await escapeInPage(page, '"quoted"')).toBe('"quoted"');
  expect(await escapeInPage(page, "'single'")).toBe("'single'");
});

test('escapeHtml passes through plain text', async ({ page }) => {
  await page.goto('/');

  expect(await escapeInPage(page, 'plain text 123')).toBe('plain text 123');
  expect(await escapeInPage(page, '')).toBe('');
  expect(await escapeInPage(page, 'a\nb')).toBe('a\nb');
});

test('escapeHtml handles non-string inputs', async ({ page }) => {
  await page.goto('/');

  // LegacyNullToEmptyString: null and undefined both coerce to ''.
  expect(await escapeInPage(page, null)).toBe('');
  expect(await escapeInPage(page, undefined)).toBe('');
  expect(await escapeInPage(page, 42)).toBe('42');
});
