import { getConfig, getServices, isEditing } from './state.js';
import { escapeHtml } from './api.js';

const PLACEHOLDER_SVG = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="4"/><circle cx="12" cy="12" r="4"/><path d="M8 8l8 8M16 8l-8 8"/></svg>')}`;
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

export function renderGrid() {
  const grid = document.querySelector('[data-testid="service-grid"]');
  if (!grid) return;

  const services = getServices();
  const onboarding = document.querySelector('[data-testid="onboarding"]');

  if (onboarding) {
    onboarding.setAttribute('aria-hidden', services.length > 0 ? 'true' : 'false');
  }

  grid.innerHTML = '';

  const indexedServices = services.map((service, index) => ({
    service,
    index,
    sortKey: (service.position?.row ?? 0) * 4 + (service.position?.col ?? 0),
  }));

  indexedServices.sort((a, b) => a.sortKey - b.sortKey);

  indexedServices.forEach(({ service, index }, i) => {
    const tile = document.createElement('article');
    tile.className = 'tile';
    tile.setAttribute('data-testid', 'tile');
    tile.setAttribute('data-index', String(index));
    tile.style.setProperty('--i', String(i));
    tile.style.animationDelay = `calc(${i} * 50ms)`;


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

    if (!isEditing()) {
      tile.style.cursor = 'pointer';
      tile.addEventListener('click', () => {
        window.open(service.url, '_blank', 'noopener,noreferrer');
      });
    } else {
      tile.setAttribute('draggable', 'true');
      tile.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('editservice', { detail: { index } }));
      });
    }

    grid.appendChild(tile);
  });
}
