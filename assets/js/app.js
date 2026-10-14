import { loadConfig, loadStatus, saveConfig, escapeHtml } from './api.js';
import { getConfig, setConfig, isConfigDirty, markClean, getServices, setServiceStatuses } from './state.js';
import { openAddDialog } from './add-dialog.js';
import { renderGrid, updateTileStatuses } from './grid.js';
import { initDrag } from './drag.js';
import { initBackgroundToggle } from './background.js';
import './edit.js';
import './pill-switch.js';
import { t, applyTranslations } from './i18n.js';

function getOnboardingEl() {
  return document.querySelector('[data-testid="onboarding"]');
}

function getGridEl() {
  return document.querySelector('[data-testid="service-grid"]');
}

function showOnboarding() {
  const onboarding = getOnboardingEl();
  const grid = getGridEl();
  if (onboarding) {
    onboarding.setAttribute('aria-hidden', 'false');
  }
  if (grid) {
    grid.hidden = true;
  }
}

function dismissOnboarding() {
  const onboarding = getOnboardingEl();
  const grid = getGridEl();
  if (onboarding) {
    onboarding.setAttribute('aria-hidden', 'true');
  }
  if (grid) {
    grid.hidden = false;
  }
}

function showLoadError() {
  const onboarding = getOnboardingEl();
  const grid = getGridEl();
  if (onboarding) onboarding.setAttribute('aria-hidden', 'true');
  if (!grid) return;
  grid.hidden = false;
  grid.innerHTML = `
    <div class="load-error" role="alert" data-testid="load-error" style="grid-column: 1 / -1;">
      <h2>${escapeHtml(t('error.load.title'))}</h2>
      <p>${escapeHtml(t('error.load.body'))}</p>
      <button type="button" class="btn btn-primary" data-testid="load-error-retry">
        ${escapeHtml(t('error.retry'))}
      </button>
    </div>
  `;
  grid.querySelector('[data-testid="load-error-retry"]')?.addEventListener('click', () => {
    window.location.reload();
  });
}

/** Persistent, non-blocking save failure with retry — never a native alert. */
function showSaveError() {
  let banner = document.querySelector('[data-testid="save-banner"]');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'save-banner';
    banner.setAttribute('data-testid', 'save-banner');
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <span>${escapeHtml(t('error.save'))}</span>
      <button type="button" class="btn btn-secondary" data-testid="save-retry">${escapeHtml(t('error.save.retry'))}</button>
    `;
    document.body.appendChild(banner);
    banner.querySelector('[data-testid="save-retry"]').addEventListener('click', () => {
      saveCurrentConfig();
    });
  }
  banner.hidden = false;
}

function hideSaveError() {
  const banner = document.querySelector('[data-testid="save-banner"]');
  if (banner) banner.hidden = true;
}

async function saveCurrentConfig() {
  try {
    await saveConfig(getConfig());
    markClean();
    hideSaveError();
  } catch (err) {
    console.error('Auto-save failed:', err);
    showSaveError();
  }
}

function showEmptyState() {
  dismissOnboarding();
  const grid = getGridEl();
  if (!grid) return;
  grid.innerHTML = `
    <div class="onboarding" style="grid-column: 1 / -1;" role="status" aria-live="polite">
      <h2>${escapeHtml(t('empty.title'))}</h2>
      <p>${escapeHtml(t('empty.subtitle'))}</p>
    </div>
  `;
}

async function init() {
  try {
    const cfg = await loadConfig();
    setConfig(cfg);

    window.addEventListener('configchanged', async () => {
      if (!isConfigDirty()) return;
      await saveCurrentConfig();
    });

    document.querySelector('[data-testid="add-button"]')?.addEventListener('click', () => {
      openAddDialog();
    });

    document.querySelector('[data-testid="onboarding-cta"]')?.addEventListener('click', () => {
      openAddDialog();
    });

    document.querySelector('[data-testid="onboarding-skip"]')?.addEventListener('click', () => {
      showEmptyState();
    });

    window.addEventListener('serviceadded', () => {
      dismissOnboarding();
      renderGrid();
    });

    await initBackgroundToggle();
    initDrag();
    applyTranslations();

    if (getServices().length === 0) {
      showOnboarding();
    } else {
      renderGrid({ entrance: true });
    }

    // Reachability is checked once per page load — no polling, no refresh.
    try {
      const { services: statuses } = await loadStatus();
      setServiceStatuses(statuses);
      updateTileStatuses();
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  } catch (err) {
    console.error('Failed to load config:', err);
    showLoadError();
  }
}

document.addEventListener('DOMContentLoaded', init);
