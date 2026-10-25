import { getConfig, setBackgroundRotate } from './store.js';
import { t } from './i18n.js';

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

  setBackgroundRotate(next);

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

function safeHttpUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function applyPhoto(photo) {
  const url = safeHttpUrl(photo.photo_url);
  if (!url) return;
  const escaped = url.replace(/["\\]/g, (char) => (char === '"' ? '%22' : '%5C'));
  html.style.setProperty('--bg-photo-url', `url("${escaped}")`);
  updatePhotoCredit(photo);
}

function updatePhotoCredit(photo) {
  const credit = document.querySelector('[data-testid="photo-credit"]');
  if (!credit) return;
  renderCredit(credit, photo.photographer, photo.photographer_url);
}

function renderCredit(
  credit,
  photographerName,
  photographerUrl,
  formatKey = 'footer.credit.format',
) {
  const photographer = document.createElement('a');
  photographer.href = safeHttpUrl(photographerUrl) || 'https://www.pexels.com';
  photographer.target = '_blank';
  photographer.rel = 'noopener';
  photographer.textContent = photographerName || 'Pexels';

  const [before, after = ''] = t(formatKey).split('{photographer}');
  credit.replaceChildren(
    document.createTextNode(before),
    photographer,
    document.createTextNode(after),
  );
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
    renderCredit(credit, 'Pexels', 'https://www.pexels.com', 'footer.credit.static');
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
