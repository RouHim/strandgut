import { test, expect } from '@playwright/test';

test('health endpoint returns 200', async ({ request }) => {
  const resp = await request.get('/api/health');
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body.status).toBe('ok');
});

test('readyz endpoint returns 200', async ({ request }) => {
  const resp = await request.get('/api/readyz');
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body.status).toBe('ok');
});

test('config GET returns valid JSON', async ({ request }) => {
  const resp = await request.get('/api/config');
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body).toHaveProperty('title');
  expect(body).toHaveProperty('services');
  expect(Array.isArray(body.services)).toBe(true);
});

test('config PUT roundtrip works', async ({ request }) => {
  const payload = {
    title: 'E2E Roundtrip',
    language: 'en',
    scan_defaults: 'simple',
    services: []
  };
  const putResp = await request.put('/api/config', { data: payload });
  expect(putResp.ok()).toBeTruthy();

  const getResp = await request.get('/api/config');
  const body = await getResp.json();
  expect(body.title).toBe('E2E Roundtrip');
});

test('invalid config PUT returns 400', async ({ request }) => {
  const resp = await request.put('/api/config', {
    data: 'this is not valid json {{{',
    headers: { 'Content-Type': 'text/plain' }
  });
  expect(resp.status()).toBe(400);
});
