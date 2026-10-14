import { addService, getServices, GRID_COLUMNS } from './state.js';
import { escapeHtml } from './api.js';
import { renderGrid } from './grid.js';
import { t } from './i18n.js';
import { activateOverlay, releaseOverlayFor } from './overlay.js';

let abortController = null;
let dialogEl = null;

export function openScanDialog() {
  if (dialogEl) return;

  dialogEl = document.createElement('div');
  dialogEl.className = 'scan-dialog-overlay';
  dialogEl.setAttribute('role', 'dialog');
  dialogEl.setAttribute('aria-modal', 'true');
  dialogEl.setAttribute('aria-labelledby', 'scan-dialog-title');

  const defaultHost = escapeHtml(window.location.hostname || '192.168.1.1');

  dialogEl.innerHTML = `
    <div class="scan-dialog" data-testid="scan-dialog">
      <header class="scan-dialog__header">
        <h2 id="scan-dialog-title">${t('scan.title')}</h2>
        <button type="button" class="btn btn-ghost scan-dialog__close" data-testid="scan-dialog-close" aria-label="${t('scan.close')}">&times;</button>
      </header>

      <div class="scan-dialog__body">
        <div class="scan-field">
          <label for="scan-host">${t('scan.host.label')}</label>
          <input type="text" id="scan-host" class="scan-input" value="${defaultHost}" data-testid="scan-host-input" data-autofocus>
        </div>

        <fieldset class="scan-fieldset">
          <legend>${t('scan.depth.label')}</legend>
          <div class="scan-radio-group">
            <label class="scan-radio">
              <input type="radio" name="scan-depth" value="simple" checked data-testid="scan-depth-simple">
              <span>${t('scan.depth.simple')}</span>
            </label>
            <label class="scan-radio">
              <input type="radio" name="scan-depth" value="medium" data-testid="scan-depth-medium">
              <span>${t('scan.depth.medium')}</span>
            </label>
            <label class="scan-radio">
              <input type="radio" name="scan-depth" value="deep" data-testid="scan-depth-deep">
              <span>${t('scan.depth.deep')}</span>
            </label>
          </div>
        </fieldset>

        <details class="scan-advanced" data-testid="scan-advanced-toggle">
          <summary>${t('scan.advanced')}</summary>
          <div class="scan-field">
            <label for="scan-ports">${t('scan.ports.label')}</label>
            <input type="text" id="scan-ports" class="scan-input" placeholder="${t('scan.ports.placeholder')}" data-testid="scan-ports-input">
            <p class="scan-hint" data-testid="scan-ports-hint" hidden>${t('scan.ports.hint')}</p>
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
        <button type="button" class="btn btn-secondary" data-testid="scan-close-button" hidden>${t('scan.close')}</button>
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
  activateOverlay(dialogEl);
  hostInput.select();
  hostInput.addEventListener('click', () => hostInput.select());

  const portsInput = dialogEl.querySelector('#scan-ports');
  const depthRadios = dialogEl.querySelectorAll('input[name="scan-depth"]');
  const portsHint = dialogEl.querySelector('[data-testid="scan-ports-hint"]');
  const syncPortsOverride = () => {
    const overrides = portsInput.value.trim() !== '';
    depthRadios.forEach((radio) => {
      radio.disabled = overrides;
    });
    portsHint.hidden = !overrides;
  };
  portsInput.addEventListener('input', syncPortsOverride);
  syncPortsOverride();

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
    statusEl.textContent = t('scan.enterHost');
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
      statusEl.textContent = t('scan.invalidPorts');
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
  statusEl.textContent = t('scan.scanning');
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
      statusEl.textContent = scanState.hasFoundResults ? t('scan.complete') : t('scan.noServices');
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      statusEl.textContent = t('scan.errorPrefix') + err.message;
      statusEl.className = 'scan-status scan-status--error';
      finishProgressBar(progressBar, 'var(--color-danger, #c4746e)');
    }
  } finally {
    startBtn.disabled = false;
    startBtn.hidden = false;
    closeBtn.hidden = false;
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
      statusEl.textContent = scanState && !scanState.hasFoundResults ? t('scan.noServices') : t('scan.complete');
      statusEl.className = 'scan-status scan-status--success';
      finishProgressBar(progressBar, 'var(--color-success, #6baf92)');
      const closeBtn = dialogEl.querySelector('[data-testid="scan-close-button"]');
      if (closeBtn) closeBtn.hidden = false;
      break;
    }
    case 'error': {
      const detail = data === 'host_not_found' ? t('scan.error.hostNotFound') : data || t('scan.unknownError');
      statusEl.textContent = t('scan.errorPrefix') + detail;
      statusEl.className = 'scan-status scan-status--error';
      finishProgressBar(progressBar, 'var(--color-danger, #c4746e)');
      const closeBtn = dialogEl.querySelector('[data-testid="scan-close-button"]');
      if (closeBtn) closeBtn.hidden = false;
      break;
    }
  }
}

function finishProgressBar(progressBar, color) {
  progressBar.style.animation = 'none';
  progressBar.style.width = '100%';
  progressBar.style.background = color;
}

function createResultCard(result) {
  const existing = getServices();
  const url = buildUrl(result.host, result.port);
  const isDuplicate = existing.some((s) => s.url === url);

  const card = document.createElement('div');
  card.className = 'scan-result-card';
  card.dataset.testid = 'scan-result-card';

  const reachableDot = result.reachable
    ? `<span class="scan-result-card__reachable" role="img" aria-label="${t('status.up')}" title="${t('status.up')}"></span>`
    : '';
  const name = escapeHtml(result.service_name || result.title || `${result.host}:${result.port}`);
  const hostPort = escapeHtml(`${result.host}:${result.port}`);
  const titleLine =
    result.title && result.title !== (result.service_name || '')
      ? `<span class="scan-result-card__title">${escapeHtml(result.title)}</span>`
      : '';

  card.innerHTML = `
    <div class="scan-result-card__info">
      <strong>${reachableDot}${name}</strong>
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="scan-result-card__meta">${hostPort}</a>
      ${titleLine}
    </div>
    <button type="button" class="btn btn-secondary scan-result-card__add" data-testid="scan-add-service" ${isDuplicate ? 'disabled' : ''}>
      ${isDuplicate ? t('scan.added') : t('scan.addToDashboard')}
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
      addBtn.textContent = t('scan.added');
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

  const cols = GRID_COLUMNS;
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

function showAbortConfirm() {
  if (!dialogEl) return;
  if (dialogEl.querySelector('[data-testid="scan-abort-confirm"]')) return;

  const footer = dialogEl.querySelector('.scan-dialog__footer');
  const row = document.createElement('div');
  row.className = 'scan-confirm';
  row.setAttribute('data-testid', 'scan-abort-confirm');
  row.setAttribute('role', 'alertdialog');
  row.innerHTML = `
    <p>${t('scan.abort.confirm')}</p>
    <button type="button" class="btn btn-secondary" data-testid="scan-abort-keep">${t('scan.abort.keep')}</button>
    <button type="button" class="btn btn-primary" data-testid="scan-abort-close">${t('scan.abort.close')}</button>
  `;
  footer.appendChild(row);

  const keep = row.querySelector('[data-testid="scan-abort-keep"]');
  keep.addEventListener('click', () => row.remove());
  row.querySelector('[data-testid="scan-abort-close"]').addEventListener('click', () => {
    closeScanDialog({ force: true });
  });
  keep.focus();
}

function closeScanDialog({ force = false } = {}) {
  // A running scan is not silently discarded: ask inside the dialog first.
  if (abortController && !force) {
    showAbortConfirm();
    return;
  }
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  if (dialogEl) {
    if (dialogEl._keydownHandler) {
      document.removeEventListener('keydown', dialogEl._keydownHandler);
    }
    releaseOverlayFor(dialogEl);
    dialogEl.remove();
    dialogEl = null;
  }
}
