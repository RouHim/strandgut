import { addService, getServices } from './store.js';
import { buildScanRequest, startScanSession } from './scan-session.js';
import { t } from './i18n.js';
import { activateOverlay } from './overlay.js';

let scanSession = null;
let dialogEl = null;
let overlayHandle = null;

export function openScanDialog() {
  if (dialogEl) return;

  dialogEl = document.createElement('div');
  dialogEl.className = 'scan-dialog-overlay';
  dialogEl.setAttribute('role', 'dialog');
  dialogEl.setAttribute('aria-modal', 'true');
  dialogEl.setAttribute('aria-labelledby', 'scan-dialog-title');

  dialogEl.innerHTML = `
    <div class="scan-dialog" data-testid="scan-dialog">
      <header class="scan-dialog__header">
        <h2 id="scan-dialog-title">${t('scan.title')}</h2>
        <button type="button" class="btn btn-ghost scan-dialog__close" data-testid="scan-dialog-close" aria-label="${t('scan.close')}">&times;</button>
      </header>

      <div class="scan-dialog__body">
        <div class="scan-field">
          <label for="scan-host">${t('scan.host.label')}</label>
          <input type="text" id="scan-host" class="scan-input" data-testid="scan-host-input" data-autofocus>
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
  hostInput.value = window.location.hostname || '192.168.1.1';
  overlayHandle = activateOverlay(dialogEl, { onClose: closeScanDialog });
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
}

function selectedDepth(depthRadios) {
  for (const radio of depthRadios) {
    if (radio.checked) return radio.value;
  }
  return 'simple';
}

async function startScan() {
  if (!dialogEl) return;

  const hostInput = dialogEl.querySelector('#scan-host');
  const portsInput = dialogEl.querySelector('#scan-ports');
  const depthRadios = dialogEl.querySelectorAll('input[name="scan-depth"]');
  const startBtn = dialogEl.querySelector('[data-testid="scan-start-button"]');
  const closeBtn = dialogEl.querySelector('[data-testid="scan-close-button"]');
  const addAllBtn = dialogEl.querySelector('[data-testid="scan-add-all-button"]');
  const progressEl = dialogEl.querySelector('.scan-progress');
  const progressBar = dialogEl.querySelector('[data-testid="scan-progress-bar"]');
  const statusEl = dialogEl.querySelector('[data-testid="scan-status"]');
  const resultsEl = dialogEl.querySelector('[data-testid="scan-results"]');

  const built = buildScanRequest({
    host: hostInput.value,
    portsText: portsInput.value,
    depth: selectedDepth(depthRadios),
  });

  if (!built.ok) {
    statusEl.textContent = t(
      built.reason === 'missing_host' ? 'scan.enterHost' : 'scan.invalidPorts',
    );
    return;
  }

  startBtn.disabled = true;
  progressEl.hidden = false;
  statusEl.className = 'scan-status';
  statusEl.textContent = t('scan.scanning');
  resultsEl.innerHTML = '';

  const scanState = { hasFoundResults: false };

  scanSession = startScanSession(built.request, {
    onFound(result) {
      scanState.hasFoundResults = true;
      resultsEl.appendChild(createResultCard(result));
    },
    onProgress(progress) {
      if (progress.total > 0) {
        progressBar.setAttribute(
          'aria-valuenow',
          String(Math.round((progress.scanned / progress.total) * 100)),
        );
      }
    },
    onError(error) {
      const detail =
        error.code === 'host_not_found'
          ? t('scan.error.hostNotFound')
          : error.code === 'busy'
            ? t('scan.error.busy')
            : error.code === 'stream'
              ? t('scan.error.stream')
              : error.code === 'transport'
                ? t('scan.error.transport')
                : t('scan.unknownError');
      statusEl.textContent = t('scan.errorPrefix') + detail;
      statusEl.className = 'scan-status scan-status--error';
      finishProgressBar(progressBar, 'var(--color-danger, #c4746e)');
      closeBtn.hidden = false;
    },
    onDone() {
      statusEl.textContent = scanState.hasFoundResults
        ? t('scan.complete')
        : t('scan.noServices');
      statusEl.className = 'scan-status scan-status--success';
      finishProgressBar(progressBar, 'var(--color-success, #6baf92)');
      closeBtn.hidden = false;
    },
  });

  await scanSession.done;
  scanSession = null;

  startBtn.disabled = false;
  startBtn.hidden = false;
  closeBtn.hidden = false;
  addAllBtn.hidden = !scanState.hasFoundResults;
}

function finishProgressBar(progressBar, color) {
  progressBar.style.animation = 'none';
  progressBar.style.width = '100%';
  progressBar.style.background = color;
}

function createResultCard(result) {
  const existing = getServices();
  const url = buildUrl(result.host, result.port);
  const isDuplicate = existing.some((service) => service.url === url);
  const name = result.service_name || result.title || `${result.host}:${result.port}`;

  const card = document.createElement('div');
  card.className = 'scan-result-card';
  card.dataset.testid = 'scan-result-card';

  const info = document.createElement('div');
  info.className = 'scan-result-card__info';

  const strong = document.createElement('strong');
  if (result.reachable) {
    const dot = document.createElement('span');
    dot.className = 'scan-result-card__reachable';
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', t('status.up'));
    dot.title = t('status.up');
    strong.appendChild(dot);
  }
  strong.appendChild(document.createTextNode(name));

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'scan-result-card__meta';
  link.textContent = `${result.host}:${result.port}`;

  info.appendChild(strong);
  info.appendChild(link);

  if (result.title && result.title !== (result.service_name || '')) {
    const title = document.createElement('span');
    title.className = 'scan-result-card__title';
    title.textContent = result.title;
    info.appendChild(title);
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-secondary scan-result-card__add';
  addBtn.dataset.testid = 'scan-add-service';
  addBtn.disabled = isDuplicate;
  addBtn.textContent = isDuplicate ? t('scan.added') : t('scan.addToDashboard');

  if (!isDuplicate) {
    addBtn.addEventListener('click', () => {
      addService(buildService(result));
      addBtn.disabled = true;
      addBtn.textContent = t('scan.added');
    });
  }

  card.appendChild(info);
  card.appendChild(addBtn);
  return card;
}

function buildUrl(host, port) {
  if (port === 443) return `https://${host}`;
  if (port === 80) return `http://${host}`;
  return `http://${host}:${port}`;
}

function buildService(result) {
  return {
    name: result.service_name || result.title || `${result.host}:${result.port}`,
    url: buildUrl(result.host, result.port),
    icon: result.icon_slug || null,
    description: null,
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
  if (scanSession && !force) {
    showAbortConfirm();
    return;
  }
  if (scanSession) {
    scanSession.abort();
    scanSession = null;
  }
  if (dialogEl) {
    overlayHandle?.close();
    overlayHandle = null;
    dialogEl.remove();
    dialogEl = null;
  }
}
