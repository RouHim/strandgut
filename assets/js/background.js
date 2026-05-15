import { getConfig, setConfig } from './state.js';
import { t } from './app.js';
import { escapeHtml } from './api.js';

const ROTATION_INTERVAL_MS = 60 * 60 * 1000;
const html = document.documentElement;
let rotationTimer = null;

export async function initBackgroundToggle() {
  const status = await fetchBackgroundStatus();

  const toggle = document.querySelector('[data-testid="background-rotate-toggle"]');
  if (!toggle) return;

  if (!status.available) {
    toggle.style.display = 'none';
    return;
  }

  const isEnabled = status.rotate_enabled;
  toggle.setAttribute('aria-checked', String(isEnabled));

  if (isEnabled) {
    await fetchAndApplyBackground();
    startRotationTimer();
  }

  toggle.addEventListener('click', handleToggleClick);
}

async function handleToggleClick() {
  const toggle = document.querySelector('[data-testid="background-rotate-toggle"]');
  const current = toggle.getAttribute('aria-checked') === 'true';
  const next = !current;

  const config = getConfig();
  if (!config) return;

  config.background_rotate = next;
  setConfig(config);

  window.dispatchEvent(new CustomEvent('configchanged'));

  toggle.setAttribute('aria-checked', String(next));

  if (next) {
    await fetchAndApplyBackground();
    startRotationTimer();
  } else {
    stopRotationTimer();
    removeDynamicBackground();
  }
}

async function fetchBackgroundStatus() {
  try {
    const resp = await fetch('/api/background/status');
    if (!resp.ok) return { available: false, rotate_enabled: false, photo: null };
    return await resp.json();
  } catch (e) {
    console.error('Failed to fetch background status:', e);
    return { available: false, rotate_enabled: false, photo: null };
  }
}

async function fetchAndApplyBackground() {
  try {
    const status = await fetchBackgroundStatus();
    html.classList.remove('static-background');
    html.classList.add('dynamic-background');
    if (status.photo) {
      applyPhoto(status.photo);
    } else {
      // First-time fetch: backend spawned async Pexels call.
      // Retry after 3s to pick up the result.
      setTimeout(async () => {
        const retry = await fetchBackgroundStatus();
        if (retry.photo) applyPhoto(retry.photo);
      }, 3000);
    }
  } catch (e) {
    console.error('Failed to apply background:', e);
  }
}

function applyPhoto(photo) {
  html.style.setProperty('--bg-photo-url', `url('${escapeHtml(photo.photo_url)}')`);
  updatePhotoCredit(photo);
}

function updatePhotoCredit(photo) {
  const credit = document.querySelector('[data-testid="photo-credit"]');
  if (!credit) return;

  credit.innerHTML = t('footer.credit.format')
    .replace('{photographer}', `<a href="${escapeHtml(photo.photographer_url)}" target="_blank" rel="noopener">${escapeHtml(photo.photographer)}</a>`);
}

function startRotationTimer() {
  stopRotationTimer();
  rotationTimer = setInterval(async () => {
    if (document.visibilityState === 'visible') {
      await fetchAndApplyBackground();
    }
  }, ROTATION_INTERVAL_MS);
}

function stopRotationTimer() {
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
}

function removeDynamicBackground() {
  html.classList.remove('dynamic-background');
  html.classList.add('static-background');
  html.style.removeProperty('--bg-photo-url');

  const credit = document.querySelector('[data-testid="photo-credit"]');
  if (credit) {
    credit.innerHTML = `Photo by <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a>`;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    stopRotationTimer();
  } else {
    const toggle = document.querySelector('[data-testid="background-rotate-toggle"]');
    if (toggle && toggle.getAttribute('aria-checked') === 'true') {
      startRotationTimer();
    }
  }
});
