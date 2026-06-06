import { addService, getServices } from './state.js';
import { escapeHtml } from './api.js';
import { renderGrid } from './grid.js';
import { t } from './app.js';

let abortController = null;
let dialogEl = null;

export function openScanDialog() {
  if (dialogEl) return;

  dialogEl = document.createElement('div');
  dialogEl.className = 'scan-dialog-overlay';
  dialogEl.setAttribute('role', 'dialog');
  dialogEl.setAttribute('aria-modal', 'true');
  dialogEl.setAttribute('aria-label', 'Network Scan');

  const defaultHost = escapeHtml(window.location.hostname || '192.168.1.1');

  dialogEl.innerHTML = `
    <div class="scan-dialog" data-testid="scan-dialog">
      <header class="scan-dialog__header">
        <h2 data-i18n="scan.title">Scan Network</h2>
        <button type="button" class="btn btn-ghost scan-dialog__close" data-testid="scan-dialog-close" aria-label="Close">&times;</button>
      </header>

      <div class="scan-dialog__body">
        <div class="scan-field">
          <label for="scan-host">Host / IP</label>
          <input type="text" id="scan-host" class="scan-input" value="${defaultHost}" data-testid="scan-host-input">
        </div>

        <fieldset class="scan-fieldset">
          <legend>Scan Depth</legend>
          <div class="scan-radio-group">
            <label class="scan-radio">
              <input type="radio" name="scan-depth" value="simple" checked data-testid="scan-depth-simple">
              <span>Simple</span>
            </label>
            <label class="scan-radio">
              <input type="radio" name="scan-depth" value="medium" data-testid="scan-depth-medium">
              <span>Medium</span>
            </label>
            <label class="scan-radio">
              <input type="radio" name="scan-depth" value="deep" data-testid="scan-depth-deep">
              <span>Deep</span>
            </label>
          </div>
        </fieldset>

        <details class="scan-advanced" data-testid="scan-advanced-toggle">
          <summary>Advanced</summary>
          <div class="scan-field">
            <label for="scan-ports">Port Range (comma-separated)</label>
            <input type="text" id="scan-ports" class="scan-input" placeholder="e.g. 80,443,8080" data-testid="scan-ports-input">
          </div>
        </details>

        <div class="scan-progress" hidden>
          <div class="scan-progress__track">
            <div class="scan-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" data-testid="scan-progress-bar"></div>
          </div>
        </div>
        <div class="scan-status" data-testid="scan-status"></div>

        <div class="scan-results" data-testid="scan-results"></div>
      </div>

      <footer class="scan-dialog__footer">
        <button type="button" class="btn btn-primary" data-testid="scan-start-button">${t('scan.start')}</button>
        <button type="button" class="btn btn-secondary" data-testid="scan-add-all-button" hidden>${t('scan.addAll')}</button>
        <button type="button" class="btn btn-secondary" data-testid="scan-close-button" hidden>Close</button>
      </footer>
    </div>
  `;

  document.body.appendChild(dialogEl);

  dialogEl.querySelector('[data-testid="scan-dialog-close"]').addEventListener('click', () => closeScanDialog());
  dialogEl.querySelector('[data-testid="scan-start-button"]').addEventListener('click', startScan);
  dialogEl.querySelector('[data-testid="scan-close-button"]').addEventListener('click', closeScanDialog);

  const addAllBtn = dialogEl.querySelector('[data-testid="scan-add-all-button"]');
  if (addAllBtn) {
    addAllBtn.addEventListener('click', () => {
      document.querySelectorAll('[data-testid="scan-result-card"]').forEach(card => {
        const addBtn = card.querySelector('[data-testid="scan-add-service"]');
        const hasReachableDot = card.querySelector('.scan-result-card__reachable');
        if (addBtn && !addBtn.disabled && hasReachableDot) addBtn.click();
      });
      addAllBtn.disabled = true;
    });
  }

  const hostInput = dialogEl.querySelector('#scan-host');
  hostInput.focus();
  hostInput.focus();
  hostInput.select();
  hostInput.addEventListener('click', () => hostInput.select());

  const handleKeydown = (e) => {
    if (e.key === 'Escape') closeScanDialog();
  };
  document.addEventListener('keydown', handleKeydown);
  dialogEl._keydownHandler = handleKeydown;

  dialogEl.addEventListener('click', (e) => {
    if (e.target === dialogEl) closeScanDialog();
  });
}

function parseSseEvents(text) {
  const events = [];
  const chunks = text.split('\n\n');
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.slice(7);
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }
    if (event || data) {
      events.push({ event, data });
    }
  }
  return events;
}

async function startScan() {
  const hostInput = dialogEl.querySelector('#scan-host');
  const portsInput = dialogEl.querySelector('#scan-ports');
  const depthRadios = dialogEl.querySelectorAll('input[name="scan-depth"]');
  const startBtn = dialogEl.querySelector('[data-testid="scan-start-button"]');
  const closeBtn = dialogEl.querySelector('[data-testid="scan-close-button"]');
  const progressEl = dialogEl.querySelector('.scan-progress');
  const progressBar = dialogEl.querySelector('[data-testid="scan-progress-bar"]');
  const statusEl = dialogEl.querySelector('[data-testid="scan-status"]');
  const resultsEl = dialogEl.querySelector('[data-testid="scan-results"]');

  const host = hostInput.value.trim();
  if (!host) {
    statusEl.textContent = 'Please enter a host or IP address.';
    return;
  }

  let body;
  let totalPorts;
  const customPorts = portsInput.value.trim();
  if (customPorts) {
    const ports = customPorts
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((p) => !isNaN(p) && p > 0 && p <= 65535);
    if (ports.length === 0) {
      statusEl.textContent = 'Please enter valid port numbers.';
      return;
    }
    body = JSON.stringify({ host, ports });
    totalPorts = ports.length;
  } else {
    let depth = 'simple';
    for (const radio of depthRadios) {
      if (radio.checked) {
        depth = radio.value;
        break;
      }
    }
    body = JSON.stringify({ host, depth });
    totalPorts = depth === 'simple' ? 9 : (depth === 'medium' ? 33 : 65535);
  }

  startBtn.disabled = true;
  progressEl.hidden = false;
  statusEl.className = 'scan-status';
  statusEl.textContent = 'Scanning…';
  resultsEl.innerHTML = '';

  const scanState = { hasFoundResults: false };
  abortController = new AbortController();

  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: abortController.signal,
    });

    if (!response.ok) {
      let msg = `Scan failed: ${response.status}`;
      try {
        const json = await response.json();
        if (json.error) msg = json.error;
      } catch {
      }
      throw new Error(msg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lastDoubleNewline = buffer.lastIndexOf('\n\n');
      if (lastDoubleNewline !== -1) {
        const complete = buffer.slice(0, lastDoubleNewline);
        buffer = buffer.slice(lastDoubleNewline + 2);
        const events = parseSseEvents(complete);
        for (const { event, data } of events) {
          handleScanEvent(event, data, progressBar, statusEl, resultsEl, scanState);
        }
      }
    }

    const events = parseSseEvents(buffer);
    for (const { event, data } of events) {
      handleScanEvent(event, data, progressBar, statusEl, resultsEl, scanState);
    }

    if (!statusEl.textContent.startsWith('Error')) {
      statusEl.textContent = scanState.hasFoundResults ? 'Scan complete.' : t('scan.noServices');
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      statusEl.textContent = 'Error: ' + err.message;
      statusEl.className = 'scan-status scan-status--error';
      progressBar.style.animation = 'none';
      progressBar.style.width = '100%';
      progressBar.style.background = 'var(--color-danger, #c4746e)';
    }
  } finally {
    startBtn.disabled = false;
    startBtn.hidden = false;
    closeBtn.hidden = false;
    statusEl.className = 'scan-status';
    const addAllBtn = dialogEl.querySelector('[data-testid="scan-add-all-button"]');
    if (addAllBtn && scanState && scanState.hasFoundResults) addAllBtn.hidden = false;
    abortController = null;
  }
}

function handleScanEvent(event, data, progressBar, statusEl, resultsEl, scanState) {
  switch (event) {
    case 'found': {
      if (scanState) scanState.hasFoundResults = true;
      let result;
      try {
        result = JSON.parse(data);
      } catch {
        break;
      }
      const card = createResultCard(result);
      resultsEl.appendChild(card);
      break;
    }
    case 'done': {
      statusEl.textContent = scanState && !scanState.hasFoundResults ? t('scan.noServices') : 'Scan complete.';
      statusEl.className = 'scan-status scan-status--success';
      progressBar.style.animation = 'none';
      progressBar.style.width = '100%';
      progressBar.style.background = 'var(--color-success, #6baf92)';
      const closeBtn = dialogEl.querySelector('[data-testid="scan-close-button"]');
      if (closeBtn) closeBtn.hidden = false;
      break;
    }
    case 'error': {
      statusEl.textContent = 'Error: ' + (data || 'Unknown error');
      statusEl.className = 'scan-status scan-status--error';
      progressBar.style.animation = 'none';
      progressBar.style.width = '100%';
      progressBar.style.background = 'var(--color-danger, #c4746e)';
      const closeBtn = dialogEl.querySelector('[data-testid="scan-close-button"]');
      if (closeBtn) closeBtn.hidden = false;
      break;
    }
  }
}

function createResultCard(result) {
  const existing = getServices();
  const url = buildUrl(result.host, result.port);
  const isDuplicate = existing.some((s) => s.url === url);

  const card = document.createElement('div');
  card.className = 'scan-result-card';
  card.dataset.testid = 'scan-result-card';

  const reachableDot = result.reachable ? '<span class="scan-result-card__reachable" title="Reachable"></span>' : '';
  const name = escapeHtml(result.service_name || result.title || `${result.host}:${result.port}`);
  const hostPort = escapeHtml(`${result.host}:${result.port}`);
  const titleLine = result.title ? `<span class="scan-result-card__title">${escapeHtml(result.title)}</span>` : '';

  card.innerHTML = `
    <div class="scan-result-card__info">
      <strong>${reachableDot}${name}</strong>
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="scan-result-card__meta">${hostPort}</a>
      ${titleLine}
    </div>
    <button type="button" class="btn btn-secondary scan-result-card__add" data-testid="scan-add-service" ${isDuplicate ? 'disabled' : ''}>
      ${isDuplicate ? 'Added' : 'Add to Dashboard'}
    </button>
  `;

  const addBtn = card.querySelector('[data-testid="scan-add-service"]');
  if (!isDuplicate) {
    addBtn.addEventListener('click', () => {
      const service = buildService(result);
      addService(service);
      renderGrid();
      window.dispatchEvent(new CustomEvent('serviceadded'));
      addBtn.disabled = true;
      addBtn.textContent = 'Added';
    });
  }

  return card;
}

function buildUrl(host, port) {
  if (port === 443) return `https://${host}`;
  if (port === 80) return `http://${host}`;
  return `http://${host}:${port}`;
}

function buildService(result) {
  const url = buildUrl(result.host, result.port);
  const existing = getServices();

  let maxRow = 0;
  let maxCol = -1;
  for (const s of existing) {
    if (s.position) {
      if (s.position.row > maxRow) {
        maxRow = s.position.row;
        maxCol = s.position.col;
      } else if (s.position.row === maxRow && s.position.col > maxCol) {
        maxCol = s.position.col;
      }
    }
  }

  const cols = 4;
  let nextRow = maxRow;
  let nextCol = maxCol + 1;
  if (nextCol >= cols) {
    nextRow += 1;
    nextCol = 0;
  }

  return {
    name: result.service_name || result.title || `${result.host}:${result.port}`,
    url,
    icon: result.icon_slug || null,
    description: null,
    position: { row: nextRow, col: nextCol },
  };
}

function closeScanDialog() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  if (dialogEl) {
    if (dialogEl._keydownHandler) {
      document.removeEventListener('keydown', dialogEl._keydownHandler);
    }
    dialogEl.remove();
    dialogEl = null;
  }
}
