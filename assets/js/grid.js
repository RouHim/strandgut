import { getServices } from './store.js';
import { getServiceStatus, isEditing } from './state.js';

const PLACEHOLDER_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="4"/><circle cx="12" cy="12" r="4"/><path d="M8 8l8 8M16 8l-8 8"/></svg>')}`;

/** Translations are registered by app.js before any tile is rendered. */
const t = (key) => (typeof window.__t === 'function' ? window.__t(key) : key);

/**
 * Sync one tile's reachability dot with the page-load status map.
 * `unknown` (no status for this url yet) stays silent for assistive tech.
 */
function syncStatusDot(dot, url) {
  const status = getServiceStatus(url);
  const state = status === null ? 'unknown' : status ? 'up' : 'down';
  dot.setAttribute('data-state', state);
  if (state === 'unknown') {
    dot.setAttribute('aria-hidden', 'true');
    dot.removeAttribute('role');
    dot.removeAttribute('aria-label');
    dot.removeAttribute('title');
  } else {
    const label = t(state === 'up' ? 'status.up' : 'status.down');
    dot.removeAttribute('aria-hidden');
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', label);
    dot.setAttribute('title', label);
  }
}

/** Re-sync every rendered dot after the page-load status check resolves. */
export function updateTileStatuses() {
  const services = getServices();
  document.querySelectorAll('[data-testid="tile"]').forEach((tile) => {
    const dot = tile.querySelector('[data-testid="tile-status"]');
    const service = services[Number(tile.getAttribute('data-index'))];
    if (dot && service) syncStatusDot(dot, service.url);
  });
}
/**
 * Resolve an icon URL with multi-CDN fallback chain.
 *
 * If the icon is already a full URL, returns it with no fallbacks.
 * Otherwise, treats the icon value (or service name) as a slug and
 * constructs a fallback chain: Dashboard Icons → Simple Icons → selfh.st.
 *
 * @param {{icon?: string, name: string}} service
 * @returns {{src: string, fallback: string[]}}
 */
function resolveIconUrl(service) {
  const icon = service.icon;
  if (icon && (icon.startsWith('http://') || icon.startsWith('https://'))) {
    return { src: icon, fallback: [] };
  }
  const slug = encodeURIComponent((icon || service.name).toLowerCase().replace(/\s+/g, '-'));
  return {
    src: `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg/${slug}.svg`,
    fallback: [
      `https://cdn.simpleicons.org/${slug}`,
      `https://cdn.jsdelivr.net/gh/selfhst/icons@master/svg/${slug}.svg`,
    ],
  };
}

export function renderGrid({ entrance = false } = {}) {
  const grid = document.querySelector('[data-testid="service-grid"]');
  if (!grid) return;

  const services = getServices();
  const onboarding = document.querySelector('[data-testid="onboarding"]');

  if (onboarding) {
    onboarding.setAttribute('aria-hidden', services.length > 0 ? 'true' : 'false');
  }

  grid.innerHTML = '';

  services.forEach((service, index) => {
    const tile = document.createElement(isEditing() ? 'article' : 'a');
    tile.className = 'tile';
    tile.setAttribute('data-testid', 'tile');
    tile.setAttribute('data-index', String(index));
    if (entrance) {
      tile.classList.add('tile--entrance');
      tile.style.animationDelay = `calc(${index} * 30ms)`;
    }

    if (!isEditing()) {
      tile.href = service.url;
      tile.target = '_blank';
      tile.rel = 'noopener noreferrer';
    }


    const resolved = resolveIconUrl(service);

    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'tile-icon';

    const img = document.createElement('img');
    img.src = resolved.src;
    img.alt = service.name;
    img.loading = 'lazy';

    let fallbackIdx = 0;
    img.onerror = function () {
      if (fallbackIdx < resolved.fallback.length) {
        this.src = resolved.fallback[fallbackIdx];
        fallbackIdx++;
      } else {
        this.src = PLACEHOLDER_SVG;
        this.onerror = null;
      }
    };

    iconWrapper.appendChild(img);

    const title = document.createElement('h3');
    title.className = 'tile-title';
    title.textContent = service.name;

    const info = document.createElement('div');
    info.className = 'tile-info';
    info.appendChild(title);

    tile.appendChild(iconWrapper);
    tile.appendChild(info);

    const statusDot = document.createElement('span');
    statusDot.className = 'tile-status';
    statusDot.setAttribute('data-testid', 'tile-status');
    syncStatusDot(statusDot, service.url);
    tile.appendChild(statusDot);

    if (isEditing()) {
      tile.setAttribute('draggable', 'true');
      tile.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('editservice', { detail: { index } }));
      });
    }

    grid.appendChild(tile);
  });
}
