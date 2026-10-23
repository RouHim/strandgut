import { openScanDialog } from './scan.js';
import { openEditPanel } from './edit.js';
import { activateOverlay } from './overlay.js';
import { t } from './i18n.js';

let dialogEl = null;
let overlayHandle = null;

export function openAddDialog() {
  if (dialogEl) return;

  dialogEl = document.createElement('div');
  dialogEl.className = 'add-dialog-overlay';
  dialogEl.setAttribute('role', 'dialog');
  dialogEl.setAttribute('aria-modal', 'true');
  dialogEl.setAttribute('aria-labelledby', 'add-dialog-title');

  dialogEl.innerHTML = `
    <div class="add-dialog" data-testid="add-dialog">
      <header class="add-dialog__header">
        <h2 id="add-dialog-title">${t('add.title')}</h2>
        <button type="button" class="btn btn-ghost add-dialog__close" data-testid="add-dialog-close" aria-label="${t('add.close')}">&times;</button>
      </header>
      <div class="add-dialog__body">
        <button type="button" class="btn btn-secondary add-dialog__option" data-testid="add-manual-button" data-autofocus>
          <span>${t('add.manual')}</span>
        </button>
        <button type="button" class="btn btn-secondary add-dialog__option" data-testid="add-scan-button">
          <span>${t('add.scan')}</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialogEl);
  overlayHandle = activateOverlay(dialogEl, { onClose: closeAddDialog });

  dialogEl.querySelector('[data-testid="add-dialog-close"]').addEventListener('click', closeAddDialog);
  dialogEl.querySelector('[data-testid="add-manual-button"]').addEventListener('click', () => {
    closeAddDialog();
    openEditPanel(null);
  });
  dialogEl.querySelector('[data-testid="add-scan-button"]').addEventListener('click', () => {
    closeAddDialog();
    openScanDialog();
  });
}

function closeAddDialog() {
  if (dialogEl) {
    overlayHandle?.close();
    overlayHandle = null;
    dialogEl.remove();
    dialogEl = null;
  }
}
