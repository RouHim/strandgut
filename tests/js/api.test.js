import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig, loadStatus, saveConfig } from '../../assets/js/api.js';

/** Install a fetch stub for one test and restore the real fetch afterwards. */
function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test('loadConfig returns the parsed config', async () => {
  await withFetch(
    async () => jsonResponse({ title: 'Strandgut', services: [] }),
    async () => {
      const config = await loadConfig();
      assert.equal(config.title, 'Strandgut');
    },
  );
});

test('loadConfig rejects with the status code', async () => {
  await withFetch(
    async () => jsonResponse({}, { ok: false, status: 503 }),
    async () => {
      await assert.rejects(loadConfig, /Failed to load config: 503/);
    },
  );
});

test('loadStatus returns the service map', async () => {
  await withFetch(
    async () => jsonResponse({ services: [{ url: 'http://a', reachable: true }] }),
    async () => {
      const status = await loadStatus();
      assert.deepEqual(status.services, [{ url: 'http://a', reachable: true }]);
    },
  );
});

test('saveConfig puts JSON and returns the stored config', async () => {
  let seen = null;
  await withFetch(
    async (url, options) => {
      seen = { url, options };
      return jsonResponse({ title: 'Saved', services: [] });
    },
    async () => {
      const stored = await saveConfig({ title: 'Saved', services: [] });
      assert.equal(stored.title, 'Saved');
      assert.equal(seen.url, '/api/config');
      assert.equal(seen.options.method, 'PUT');
      assert.equal(seen.options.headers['Content-Type'], 'application/json');
      assert.equal(seen.options.body, '{"title":"Saved","services":[]}');
    },
  );
});

test('saveConfig surfaces the JSON error body', async () => {
  await withFetch(
    async () => jsonResponse({ error: 'bad request: unknown field' }, { ok: false, status: 400 }),
    async () => {
      await assert.rejects(
        () => saveConfig({ title: 'x' }),
        /Failed to save config: 400: bad request: unknown field/,
      );
    },
  );
});

test('saveConfig survives a non-JSON error body', async () => {
  await withFetch(
    async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }),
    async () => {
      await assert.rejects(() => saveConfig({ title: 'x' }), /Failed to save config: 500$/);
    },
  );
});
