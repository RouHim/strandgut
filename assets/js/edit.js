import {
  getServices,
  addService,
  updateService,
  removeService,
  isEditing,
  isConfigDirty,
  markClean,
  getConfig,
} from './state.js';
import { escapeHtml } from './api.js';
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
        aria-label="Edit service"
      ><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="delete-tile"
        aria-label="Delete service"
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
  panelElement.setAttribute('aria-label', isNew ? 'Add service' : 'Edit service');

  const panel = document.createElement('div');
  panel.className = 'edit-panel';

  const heading = isNew ? 'Add Service' : 'Edit Service';
  panel.innerHTML = `
    <h2>${escapeHtml(heading)}</h2>

    <form id="edit-form" novalidate data-testid="edit-form">
      <div class="edit-panel__fields">
        <div class="form-field">
          <label for="edit-name">
            Name <span aria-label="required" class="required">*</span>
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
            URL <span aria-label="required" class="required">*</span>
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
              placeholder="https://example.com"
            />
            <button
              type="button"
              id="edit-url-open"
              class="btn btn-ghost edit-panel__url-open"
              data-testid="edit-url-open"
              aria-label="Open URL in new tab"
            ><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
          </div>
          <span class="error-msg" data-field="url" data-testid="edit-url-error"></span>
        </div>

        <div class="form-field">
          <label for="edit-icon">
            Icon
          </label>
          <div class="edit-panel__icon-row">
            <input
              type="text"
              id="edit-icon"
              name="icon"
              data-testid="edit-icon"
              class="edit-input edit-input--icon"
              value="${escapeHtml(service.icon || '')}"
              placeholder="e.g. github"
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
            Description
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
      >Cancel</button>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="edit-save"
        id="edit-save"
      >Save</button>
    </div>
  `;

  panelElement.appendChild(panel);
  document.body.appendChild(panelElement);

  const nameInput = panel.querySelector('#edit-name');
  nameInput?.focus();

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
    nameError.textContent = 'Name is required.';
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
    urlError.textContent = 'URL is required.';
    urlError.classList.add('error-msg--visible');
    urlInput.classList.add('form-field--error');
    valid = false;
  } else if (!/^https?:\/\//i.test(urlValue)) {
    urlError.textContent = 'URL must start with http:// or https://.';
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
export function deleteService(index) {
  const services = getServices();
  const svc = services[index];
  const name = svc?.name || 'this service';

  if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

  removeService(index);
  renderGrid();
  renderEditMode();
}

window.addEventListener('editmodechange', () => {
  renderGrid();
  renderEditMode();
});

window.addEventListener('editservice', (e) => {
  const idx = e.detail?.index;
  openEditPanel(idx);
});


