import { test, expect, gotoApp, seedConfig, service } from '../support/app.js';

/**
 * Regression guard for the mobile scroll jank: every tile's backdrop-filter
 * forced the compositor to re-blur the scrolling backdrop each frame, taking
 * scroll pacing to ~30fps. Touch devices must now paint tiles without the
 * per-tile blur (components.css); the tinted glass stays.
 */
test('mobile scroll keeps 60fps frame pacing with a full grid', async ({
  page,
  request,
  isMobile,
}) => {
  test.skip(!isMobile, 'scroll pacing is a touch-device concern');

  const services = Array.from({ length: 40 }, (_, i) =>
    service(`Service ${i + 1}`, `http://192.168.1.${(i % 250) + 1}:${8000 + i}`),
  );
  await seedConfig(request, services);

  // Keep icons local and instant: external CDNs make frame timing flaky.
  await page.route('https://cdn.jsdelivr.net/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }),
  );
  await page.route('https://cdn.simpleicons.org/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }),
  );

  await gotoApp(page);
  await page.waitForTimeout(500);

  const stats = await page.evaluate(async () => {
    const deltas = [];
    let last = null;
    let maxY = 0;
    let active = false;
    const tick = (t) => {
      if (active && last !== null) deltas.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    active = true;
    const start = performance.now();
    let steered = 0;
    await new Promise((resolve) => {
      const step = () => {
        if (performance.now() - start < 2500 && window.scrollY < maxScroll - 2 && steered < 200) {
          steered++;
          window.scrollBy({ top: 16, behavior: 'instant' });
          maxY = Math.max(maxY, window.scrollY);
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
    active = false;

    const sorted = [...deltas].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
    return {
      frames: deltas.length,
      steered,
      scrollMax: maxY,
      p95: +p95.toFixed(1),
      over33Pct: +((100 * sorted.filter((d) => d > 33.4).length) / (sorted.length || 1)).toFixed(1),
    };
  });

  // Guard the measurement itself: a short or non-scrolling page proves nothing.
  // The floor is below the janky (~30fps) range on purpose: p95 is the verdict.
  expect(stats.scrollMax, JSON.stringify(stats)).toBeGreaterThan(500);
  expect(stats.frames, JSON.stringify(stats)).toBeGreaterThan(50);
  expect(stats.p95, JSON.stringify(stats)).toBeLessThan(25);
});
