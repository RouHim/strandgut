import { loadConfig, saveConfig, escapeHtml } from './api.js';
import { getConfig, setConfig, isConfigDirty, markClean, getServices } from './state.js';
import { openAddDialog } from './add-dialog.js';
import { renderGrid } from './grid.js';
import { initDrag } from './drag.js';
import { initBackgroundToggle } from './background.js';
import './edit.js';
import './pill-switch.js';
import en from './i18n/en.js';
import de from './i18n/de.js';

const lang = navigator.language.startsWith('de') ? 'de' : 'en';
document.documentElement.lang = lang;
const translations = lang === 'de' ? de : en;

export function t(key) {
  return translations[key] || key;
}
window.__t = t;

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}

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
      try {
        await saveConfig(getConfig());
        markClean();
      } catch (err) {
        console.error('Auto-save failed:', err);
        alert(err.message);
      }
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
      renderGrid();
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

document.addEventListener('DOMContentLoaded', init);
