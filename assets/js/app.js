import { loadConfig, loadStatus, saveConfig } from './api.js';
import {
  configureStore,
  getServices,
  retrySave,
  subscribe,
} from './store.js';
import { setServiceStatuses } from './state.js';
import { openAddDialog } from './add-dialog.js';
import { renderGrid, updateTileStatuses } from './grid.js';
import { renderEditMode } from './edit.js';
import { initDrag } from './drag.js';
import { initBackgroundToggle } from './background.js';
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
      <h2></h2>
      <p></p>
      <button type="button" class="btn btn-primary" data-testid="load-error-retry"></button>
    </div>
  `;
  grid.querySelector('.load-error h2').textContent = t('error.load.title');
  grid.querySelector('.load-error p').textContent = t('error.load.body');
  grid.querySelector('[data-testid="load-error-retry"]').textContent = t('error.retry');
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
      <span></span>
      <button type="button" class="btn btn-secondary" data-testid="save-retry"></button>
    `;
    banner.querySelector('span').textContent = t('error.save');
    banner.querySelector('[data-testid="save-retry"]').textContent = t('error.save.retry');
    document.body.appendChild(banner);
    banner.querySelector('[data-testid="save-retry"]').addEventListener('click', () => {
      retrySave();
    });
  }
  banner.hidden = false;
}

function hideSaveError() {
  const banner = document.querySelector('[data-testid="save-banner"]');
  if (banner) banner.hidden = true;
}

function showEmptyState() {
  dismissOnboarding();
  const grid = getGridEl();
  if (!grid) return;
  grid.innerHTML = `
    <div class="onboarding" style="grid-column: 1 / -1;" role="status" aria-live="polite">
      <h2></h2>
      <p></p>
    </div>
  `;
  grid.querySelector('.onboarding h2').textContent = t('empty.title');
  grid.querySelector('.onboarding p').textContent = t('empty.subtitle');
}

/**
 * The single redraw path: one store mutation or edit-mode change ends here.
 * The render pair is intentionally inseparable.
 */
function renderDashboard() {
  if (getServices().length > 0) dismissOnboarding();
  renderGrid();
  renderEditMode();
}

function markAppReady() {
  document.documentElement.dataset.appReady = 'true';
}

async function init() {
  try {
    const cfg = await loadConfig();
    configureStore({
      initialConfig: cfg,
      save: saveConfig,
      onError: (err) => {
        console.error('Auto-save failed:', err);
        showSaveError();
      },
      onSaved: hideSaveError,
    });

    subscribe(({ servicesChanged }) => {
      if (servicesChanged) renderDashboard();
    });
    window.addEventListener('editmodechange', renderDashboard);

    document.querySelector('[data-testid="add-button"]')?.addEventListener('click', () => {
      openAddDialog();
    });

    document.querySelector('[data-testid="onboarding-cta"]')?.addEventListener('click', () => {
      openAddDialog();
    });

    document.querySelector('[data-testid="onboarding-skip"]')?.addEventListener('click', () => {
      showEmptyState();
    });

    await initBackgroundToggle();
    initDrag();
    applyTranslations();

    if (getServices().length === 0) {
      showOnboarding();
    } else {
      renderGrid({ entrance: true });
      renderEditMode();
    }
    markAppReady();

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
    markAppReady();
  }
}

document.addEventListener('DOMContentLoaded', init);
