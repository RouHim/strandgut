import { getGlowApi } from './background.js';

const MAX_TILT_DEG = 4;

export function initTileGlow() {
  if (window.matchMedia('(hover: none)').matches) return;
  const grid = document.querySelector('[data-testid="service-grid"]');
  if (!grid) return;
  let lastTile = null;
  grid.addEventListener('pointermove', (ev) => {
    const tile = ev.target.closest('[data-testid="tile"]');
    const api = getGlowApi();
    const nx = ev.clientX / window.innerWidth;
    const ny = ev.clientY / window.innerHeight;
    if (api) api.setGlow(nx, ny, tile ? 0.9 : 0.0);
    if (tile !== lastTile) {
      if (lastTile) lastTile.style.transform = '';
      lastTile = tile;
    }
    if (!tile) return;
    const r = tile.getBoundingClientRect();
    const px = (ev.clientX - r.left) / Math.max(r.width, 1) - 0.5;
    const py = (ev.clientY - r.top) / Math.max(r.height, 1) - 0.5;
    tile.style.transform =
      `perspective(600px) rotateX(${(-py * MAX_TILT_DEG).toFixed(2)}deg) ` +
      `rotateY(${(px * MAX_TILT_DEG).toFixed(2)}deg)`;
  });
  grid.addEventListener('pointerleave', () => {
    const api = getGlowApi();
    if (api) api.clearGlow();
    lastTile = null;
    grid.querySelectorAll('[data-testid="tile"]').forEach((t) => {
      t.style.transform = '';
    });
  });
}
