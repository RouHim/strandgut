/**
 * Scan protocol session.
 *
 * Owns request construction, the SSE transport, frame parsing, and terminal
 * status. The dialog owns DOM only. `fetchImpl` is injectable so tests can
 * drive arbitrary chunk boundaries without a server.
 */

const SCAN_DEPTHS = new Set(['simple', 'medium', 'deep']);

/**
 * Build the POST body for a scan dialog submission.
 *
 * @param {{host: string, portsText?: string, depth?: string}} input
 * @returns {{ok: true, request: {host: string, body: object}}
 *          | {ok: false, reason: 'missing_host' | 'invalid_ports'}}
 */
export function buildScanRequest({ host, portsText = '', depth = 'simple' } = {}) {
  const trimmedHost = String(host || '').trim();
  if (!trimmedHost) {
    return { ok: false, reason: 'missing_host' };
  }

  const text = String(portsText || '').trim();
  if (text) {
    const ports = text
      .split(',')
      .map((port) => Number.parseInt(port.trim(), 10))
      .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);

    if (ports.length === 0) {
      return { ok: false, reason: 'invalid_ports' };
    }

    return {
      ok: true,
      request: {
        host: trimmedHost,
        body: { host: trimmedHost, ports },
      },
    };
  }

  const scanDepth = SCAN_DEPTHS.has(depth) ? depth : 'simple';
  return {
    ok: true,
    request: {
      host: trimmedHost,
      body: { host: trimmedHost, depth: scanDepth },
    },
  };
}

/**
 * Start a scan and stream its events.
 *
 * Handlers:
 * - `onFound(result)`
 * - `onProgress({scanned, total})`
 * - `onError({code})` — `host_not_found`, `busy`, `stream`, or `transport`
 * - `onDone()`
 *
 * @returns {{abort: () => void, done: Promise<void>}}
 */
export function startScanSession(request, handlers, { fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  let aborted = false;
  let finished = false;

  const handle = {
    abort() {
      aborted = true;
      controller.abort();
    },
    done: null,
  };

  handle.done = run();

  async function run() {
    try {
      const response = await fetchImpl('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });

      if (!response.ok) {
        finished = true;
        handlers.onError?.({ code: response.status === 409 ? 'busy' : 'transport' });
        return;
      }
      if (!response.body) {
        finished = true;
        handlers.onError?.({ code: 'stream' });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const drained = drainFrames(buffer, handlers);
        buffer = drained.rest;
        if (drained.terminal) {
          finished = true;
          await reader.cancel().catch(() => {});
          break;
        }
      }

      if (!finished && !aborted) {
        buffer += decoder.decode();
        const drained = drainFrames(`${buffer}\n\n`, handlers);
        finished = drained.terminal;
      }

      if (!finished && !aborted) {
        finished = true;
        handlers.onDone?.();
      }
    } catch {
      if (aborted || finished) return;
      finished = true;
      handlers.onError?.({ code: 'transport' });
    }
  }

  return handle;
}

function drainFrames(buffer, handlers) {
  let rest = buffer;

  while (true) {
    const boundary = rest.indexOf('\n\n');
    if (boundary === -1) break;

    const frame = parseFrame(rest.slice(0, boundary));
    rest = rest.slice(boundary + 2);
    if (frame && dispatchFrame(frame, handlers)) {
      return { rest, terminal: true };
    }
  }

  return { rest, terminal: false };
}

function parseFrame(chunk) {
  let event = 'message';
  const data = [];

  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }

  if (event === 'message' && data.length === 0) return null;
  return { event, data: data.join('\n') };
}

function dispatchFrame(frame, handlers) {
  switch (frame.event) {
    case 'found': {
      try {
        handlers.onFound?.(JSON.parse(frame.data));
      } catch {
        // A malformed result frame is ignored; the scan continues.
      }
      return false;
    }
    case 'progress': {
      try {
        const progress = JSON.parse(frame.data);
        handlers.onProgress?.(progress);
      } catch {
        // Ignore malformed progress.
      }
      return false;
    }
    case 'error':
      handlers.onError?.({ code: frame.data || 'unknown' });
      return true;
    case 'done':
      handlers.onDone?.();
      return true;
    default:
      return false;
  }
}
