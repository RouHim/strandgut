import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScanRequest, startScanSession } from '../../assets/js/scan-session.js';

const encoder = new TextEncoder();

function streamResponse(chunks, status = 200) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

function collectSession(chunks, status = 200) {
  const events = [];
  const fetchImpl = async () => streamResponse(chunks, status);
  return startScanSession(
    { body: { host: '127.0.0.1', depth: 'simple' } },
    {
      onFound: (result) => events.push({ type: 'found', result }),
      onProgress: (progress) => events.push({ type: 'progress', progress }),
      onError: (error) => events.push({ type: 'error', error }),
      onDone: () => events.push({ type: 'done' }),
    },
    { fetchImpl },
  ).done.then(() => events);
}

test('builds a depth request with the port count', () => {
  assert.deepEqual(buildScanRequest({ host: ' 127.0.0.1 ', depth: 'medium' }), {
    ok: true,
    request: {
      host: '127.0.0.1',
      body: { host: '127.0.0.1', depth: 'medium' },
    },
  });
});

test('builds a custom port request and filters invalid ports', () => {
  const result = buildScanRequest({ host: 'nas.local', portsText: '80, 443, 70000, -1, abc' });

  assert.equal(result.ok, true);
  assert.deepEqual(result.request.body.ports, [80, 443]);
});

test('rejects a missing host and an empty port list', () => {
  assert.deepEqual(buildScanRequest({ host: '   ' }), {
    ok: false,
    reason: 'missing_host',
  });
  assert.deepEqual(buildScanRequest({ host: 'nas.local', portsText: 'abc' }), {
    ok: false,
    reason: 'invalid_ports',
  });
});

test('parses event frames across arbitrary chunk boundaries', async () => {
  const events = await collectSession([
    'event: progress\ndata: {"scanned":0,"total":10}\n',
    '\nevent: fou',
    'nd\ndata: {"host":"127.0.0.1","port":80}\n\n',
    'event: done\n\n',
  ]);

  assert.deepEqual(
    events.map((entry) => entry.type),
    ['progress', 'found', 'done'],
  );
  assert.deepEqual(events[0].progress, { scanned: 0, total: 10 });
  assert.deepEqual(events[1].result, { host: '127.0.0.1', port: 80 });
});

test('reports an SSE error code and does not emit done', async () => {
  const events = await collectSession([
    'event: error\ndata: host_not_found\n\n',
  ]);

  assert.deepEqual(events, [
    { type: 'error', error: { code: 'host_not_found' } },
  ]);
});

test('a done frame terminates before later frames are parsed', async () => {
  const events = await collectSession([
    'event: done\n\n',
    'event: found\ndata: {"host":"127.0.0.1","port":80}\n\n',
  ]);

  assert.deepEqual(events, [{ type: 'done' }]);
});

test('reports a 409 response as a busy scan', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: 'scan already in progress' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  const events = [];

  await startScanSession(
    { body: { host: '127.0.0.1', depth: 'simple' } },
    {
      onError: (error) => events.push(error),
      onDone: () => events.push({ code: 'done' }),
    },
    { fetchImpl },
  ).done;

  assert.deepEqual(events, [{ code: 'busy' }]);
});

test('aborting rejects the fetch without reporting an error', async () => {
  const fetchImpl = (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  const events = [];

  const handle = startScanSession(
    { body: { host: '127.0.0.1', depth: 'simple' } },
    {
      onError: (error) => events.push(error),
      onDone: () => events.push({ code: 'done' }),
    },
    { fetchImpl },
  );

  handle.abort();
  await handle.done;

  assert.deepEqual(events, []);
});
