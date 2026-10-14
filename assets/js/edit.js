import {
  getServices,
  addService,
  updateService,
  removeService,
  isEditing,
} from './state.js';
import { escapeHtml } from './api.js';
import { activateOverlay, releaseOverlayFor } from './overlay.js';
import { t } from './i18n.js';
import { renderGrid } from './grid.js';
import { initIconPicker } from './icon-picker.js';

let panelElement = null;

/**
 * Renders edit-mode controls on each tile.
 * Adds/removes ✏️ and 🗑️ buttons and toggles the Add-Service button visibility.
 */
export function renderEditMode() {
  const grid = document.querySelector('[data-testid="service-grid"]');

  document.body.classList.toggle('edit-mode', isEditing());

  if (!grid) return;

  grid.querySelectorAll('.edit-controls').forEach((el) => el.remove());

  if (!isEditing()) return;

  const tiles = grid.querySelectorAll('[data-index]');
  tiles.forEach((tile) => {
    const index = parseInt(tile.dataset.index, 10);
    if (Number.isNaN(index)) return;

    const controls = document.createElement('div');
    controls.className = 'edit-controls';
    controls.setAttribute('draggable', 'false');

    controls.innerHTML = `
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="edit-tile"
        aria-label="${t('edit.editService')}"
      ><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="delete-tile"
        aria-label="${t('edit.deleteService')}"
      ><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
    `;

    controls
      .querySelector('[data-testid="edit-tile"]')
      .addEventListener('click', (e) => {
        e.stopPropagation();
        openEditPanel(index);
      });

    controls
      .querySelector('[data-testid="delete-tile"]')
      .addEventListener('click', (e) => {
        e.stopPropagation();
        deleteService(index);
      });

    tile.appendChild(controls);
  });
}

/**
 * Opens the inline add/edit panel.
 * @param {number|null|undefined} index — null/undefined → add new; number → edit existing.
 */
export function openEditPanel(index) {
  if (panelElement) {
    closePanel();
  }

  const services = getServices();
  const isNew = index == null;
  const service = isNew
    ? { name: '', url: '', icon: '', description: '' }
    : services[index] || { name: '', url: '', icon: '', description: '' };

  panelElement = document.createElement('div');
  panelElement.className = 'edit-panel-overlay';
  panelElement.setAttribute('role', 'dialog');
  panelElement.setAttribute('aria-modal', 'true');
  panelElement.setAttribute('aria-labelledby', 'edit-panel-title');

  const panel = document.createElement('div');
  panel.className = 'edit-panel';

  const heading = isNew ? t('edit.title.add') : t('edit.title.edit');
  panel.innerHTML = `
    <h2 id="edit-panel-title">${escapeHtml(heading)}</h2>

    <form id="edit-form" novalidate data-testid="edit-form">
      <div class="edit-panel__fields">
        <div class="form-field">
          <label for="edit-name">
            ${t('edit.name')} <span aria-label="${t('edit.required')}" class="required">*</span>
          </label>
          <input
            type="text"
            id="edit-name"
            name="name"
            data-testid="edit-name"
            class="edit-input"
            value="${escapeHtml(service.name || '')}"
            required
          />
          <span class="error-msg" data-field="name" data-testid="edit-name-error"></span>
        </div>

        <div class="form-field">
          <label for="edit-url">
            URL <span aria-label="${t('edit.required')}" class="required">*</span>
          </label>
          <div class="edit-panel__url-row">
            <input
              type="url"
              id="edit-url"
              name="url"
              data-testid="edit-url"
              class="edit-input edit-input--url"
              value="${escapeHtml(service.url || '')}"
              required
              placeholder="${t('edit.url.placeholder')}"
            />
            <button
              type="button"
              id="edit-url-open"
              class="btn btn-ghost edit-panel__url-open"
              data-testid="edit-url-open"
              aria-label="${t('edit.openUrl')}"
            ><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
          </div>
          <span class="error-msg" data-field="url" data-testid="edit-url-error"></span>
        </div>

        <div class="form-field">
          <label for="edit-icon">
            ${t('edit.icon')}
          </label>
          <div class="edit-panel__icon-row">
            <input
              type="text"
              id="edit-icon"
              name="icon"
              data-testid="edit-icon"
              class="edit-input edit-input--icon"
              value="${escapeHtml(service.icon || '')}"
              placeholder="${t('edit.icon.placeholder')}"
            />
            <img
              id="icon-preview"
              class="icon-preview"
              src=""
              alt=""
            />
          </div>
        </div>

        <div class="form-field">
          <label for="edit-description">
            ${t('edit.description')}
          </label>
          <input
            type="text"
            id="edit-description"
            name="description"
            data-testid="edit-description"
            class="edit-input"
            value="${escapeHtml(service.description || '')}"
          />
        </div>
      </div>
    </form>

    <div class="edit-panel__actions">
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="edit-cancel"
        id="edit-cancel"
      >${t('edit.cancel')}</button>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="edit-save"
        id="edit-save"
      >${t('edit.save')}</button>
    </div>
  `;

  panelElement.appendChild(panel);
  document.body.appendChild(panelElement);

  activateOverlay(panelElement);

  const nameInput = panel.querySelector('#edit-name');
  if (nameInput) {
    nameInput.setAttribute('data-autofocus', '');
    nameInput.focus();
  }

  const iconInput = panel.querySelector('#edit-icon');
  const iconPreview = panel.querySelector('#icon-preview');
  if (iconInput && iconPreview) {
    initIconPicker(iconInput, iconPreview);
  }
  const urlOpenBtn = panel.querySelector('#edit-url-open');
  const urlInput = panel.querySelector('#edit-url');
  if (urlOpenBtn && urlInput) {
    const updateUrlBtn = () => {
      urlOpenBtn.disabled = !urlInput.value.trim();
    };
    updateUrlBtn();
    urlInput.addEventListener('input', updateUrlBtn);
    urlOpenBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  panel.querySelector('#edit-cancel').addEventListener('click', closePanel);

  panel.querySelector('#edit-save').addEventListener('click', () => {
    if (!validateForm(panel)) return;

    const updated = {
      ...service,
      name: panel.querySelector('#edit-name').value.trim(),
      url: panel.querySelector('#edit-url').value.trim(),
      icon: panel.querySelector('#edit-icon').value.trim() || undefined,
      description: panel.querySelector('#edit-description').value.trim() || undefined,
    };

    if (isNew) {
      addService(updated);
    } else {
      updateService(index, updated);
    }

    closePanel();
    renderGrid();
    renderEditMode();
  });

  panelElement.addEventListener('click', (e) => {
    if (e.target === panelElement) closePanel();
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closePanel();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function closePanel() {
  if (panelElement) {
    releaseOverlayFor(panelElement);
    panelElement.remove();
    panelElement = null;
  }
}

function validateForm(panel) {
  let valid = true;

  const nameInput = panel.querySelector('#edit-name');
  const nameError = panel.querySelector('[data-field="name"]');
  const nameValue = nameInput.value.trim();

  if (!nameValue) {
    nameError.textContent = t('edit.error.name');
    nameError.classList.add('error-msg--visible');
    nameInput.classList.add('form-field--error');
    valid = false;
  } else {
    nameError.classList.remove('error-msg--visible');
    nameInput.classList.remove('form-field--error');
  }

  const urlInput = panel.querySelector('#edit-url');
  const urlError = panel.querySelector('[data-field="url"]');
  const urlValue = urlInput.value.trim();

  if (!urlValue) {
    urlError.textContent = t('edit.error.url');
    urlError.classList.add('error-msg--visible');
    urlInput.classList.add('form-field--error');
    valid = false;
  } else if (!/^https?:\/\//i.test(urlValue)) {
    urlError.textContent = t('edit.error.urlScheme');
    urlError.classList.add('error-msg--visible');
    urlInput.classList.add('form-field--error');
    valid = false;
  } else {
    urlError.classList.remove('error-msg--visible');
    urlInput.classList.remove('form-field--error');
  }

  return valid;
}

/**
 * Deletes a service after confirmation.
 * @param {number} index
 */
async function deleteService(index) {
  const services = getServices();
  const name = services[index]?.name || `${services[index]?.url || ''}`;

  if (!(await confirmDelete(name))) return;

  removeService(index);
  renderGrid();
  renderEditMode();
}

/** In-system delete confirmation — no native confirm(), translated, trapped. */
function confirmDelete(name) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'edit-panel-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'confirm-delete-title');
    overlay.innerHTML = `
      <div class="edit-panel confirm-panel">
        <h2 id="confirm-delete-title">${escapeHtml(t('edit.confirmDelete').replace('{name}', name))}</h2>
        <div class="edit-panel__actions">
          <button type="button" class="btn btn-ghost" data-testid="confirm-delete-cancel" data-autofocus>${escapeHtml(t('edit.cancel'))}</button>
          <button type="button" class="btn btn-primary" data-testid="confirm-delete-ok">${escapeHtml(t('edit.confirmDelete.button'))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    activateOverlay(overlay);

    const done = (answer) => {
      releaseOverlayFor(overlay);
      overlay.remove();
      resolve(answer);
    };
    overlay.querySelector('[data-testid="confirm-delete-cancel"]').addEventListener('click', () => done(false));
    overlay.querySelector('[data-testid="confirm-delete-ok"]').addEventListener('click', () => done(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(false);
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') done(false);
    });
  });
}

window.addEventListener('editmodechange', () => {
  renderGrid();
  renderEditMode();
});

window.addEventListener('editservice', (e) => {
  const idx = e.detail?.index;
  openEditPanel(idx);
});


