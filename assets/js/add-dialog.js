import { openScanDialog } from './scan.js';
import { openEditPanel } from './edit.js';

let dialogEl = null;

export function openAddDialog() {
  if (dialogEl) return;

  dialogEl = document.createElement('div');
  dialogEl.className = 'add-dialog-overlay';
  dialogEl.setAttribute('role', 'dialog');
  dialogEl.setAttribute('aria-modal', 'true');
  dialogEl.setAttribute('aria-label', 'Add Service');

  dialogEl.innerHTML = `
    <div class="add-dialog" data-testid="add-dialog">
      <header class="add-dialog__header">
        <h2 data-i18n="add.title">Add Service</h2>
        <button type="button" class="btn btn-ghost add-dialog__close" data-testid="add-dialog-close" aria-label="Close">&times;</button>
      </header>
      <div class="add-dialog__body">
        <button type="button" class="btn btn-secondary add-dialog__option" data-testid="add-manual-button">
          <span data-i18n="add.manual">Add Manually</span>
        </button>
        <button type="button" class="btn btn-secondary add-dialog__option" data-testid="add-scan-button">
          <span data-i18n="add.scan">Scan Network</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialogEl);

  dialogEl.querySelector('[data-testid="add-dialog-close"]').addEventListener('click', closeAddDialog);
  dialogEl.querySelector('[data-testid="add-manual-button"]').addEventListener('click', () => {
    closeAddDialog();
    openEditPanel(null);
  });
  dialogEl.querySelector('[data-testid="add-scan-button"]').addEventListener('click', () => {
    closeAddDialog();
    openScanDialog();
  });

  dialogEl.addEventListener('click', (e) => {
    if (e.target === dialogEl) closeAddDialog();
  });

  const handleKeydown = (e) => {
    if (e.key === 'Escape') closeAddDialog();
  };
  document.addEventListener('keydown', handleKeydown);
  dialogEl._keydownHandler = handleKeydown;
}

export function closeAddDialog() {
  if (dialogEl) {
    if (dialogEl._keydownHandler) {
      document.removeEventListener('keydown', dialogEl._keydownHandler);
    }
    dialogEl.remove();
    dialogEl = null;
  }
}
