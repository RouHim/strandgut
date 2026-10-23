/**
 * Scan protocol session.
 *
 * Owns request construction, the SSE transport, frame parsing, and terminal
 * status. The dialog owns DOM only. `fetchImpl` is injectable so tests can
 * drive arbitrary chunk boundaries without a server.
 */

export const SCAN_DEPTHS = Object.freeze({
  simple: 9,
  medium: 33,
  deep: 65535,
});

/**
 * Build the POST body for a scan dialog submission.
 *
 * @param {{host: string, portsText?: string, depth?: string}} input
 * @returns {{ok: true, request: {host: string, body: object, totalPorts: number}}
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
        totalPorts: ports.length,
      },
    };
  }

  const scanDepth = Object.hasOwn(SCAN_DEPTHS, depth) ? depth : 'simple';
  return {
    ok: true,
    request: {
      host: trimmedHost,
      body: { host: trimmedHost, depth: scanDepth },
      totalPorts: SCAN_DEPTHS[scanDepth],
    },
  };
}

/**
 * Start a scan and stream its events.
 *
 * Handlers:
 * - `onFound(result)`
 * - `onProgress({scanned, total})`
 * - `onError({code, message})` — `host_not_found` or a transport failure
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
        const message = await readErrorMessage(response);
        finished = true;
        handlers.onError?.({ code: 'transport', message });
        return;
      }
      if (!response.body) {
        finished = true;
        handlers.onError?.({ code: 'transport', message: 'scan stream unavailable' });
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
          await reader.cancel();
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
    } catch (error) {
      if (aborted) return;
      finished = true;
      handlers.onError?.({
        code: 'transport',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return handle;
}

async function readErrorMessage(response) {
  try {
    const body = await response.json();
    return body.error || `scan failed: ${response.status}`;
  } catch {
    return `scan failed: ${response.status}`;
  }
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

  if (data.length === 0) return null;
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
