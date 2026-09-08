# WebGPU Ambient Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subtle WebGPU ambient visuals to Strandgut in 4 stacked, independently revertible tasks: shared foundation, living background, tactile tiles, ambient polish.

**Architecture:** One fixed `<canvas>` behind the tile grid, one shared `assets/js/gpu/` module (gate, device context, shared uniform buffer). Each effect registers a render pass on the shared frame loop; WGSL is inline in JS. Any init failure removes the canvas and the page is pixel-identical to today.

**Tech Stack:** Raw WebGPU + inline WGSL, vanilla ES modules (no bundler), Rust `include_bytes!` asset registry, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-08-webgpu-ambient-design.md`

## Global Constraints

- `cargo fmt --check` clean and `cargo clippy -- -D warnings` zero warnings before each task commit.
- No `unwrap()` in Rust production paths (tests may unwrap).
- JS: ES modules, explicit imports, no dependencies. `node --check` every new file.
- `data-testid="gpu-canvas"` on the canvas; `aria-hidden="true"` (decorative).
- Binary stays <5MB; musl container only (dev host builds are fine).
- e2e: never set `launchOptions.executablePath`; use `devices['Desktop Chrome']`. Run locally with `CI= npx playwright test <file>` from `e2e/` to reuse the dev server. Pre-build with `cargo build --release` (clean release exceeds the 60s webServer timeout).
- Verify visuals with a fresh browser tab (headless Chromium caches embedded CSS).
- Silent fallback everywhere: no user-facing errors, grid render never blocked.

---

## File Structure

```
assets/js/gpu/detect.js      NEW  Task 1: capability + a11y gate
assets/js/gpu/uniforms.js    NEW  Task 1: shared uniform buffer (time/size/glow/ripple)
assets/js/gpu/context.js     NEW  Task 1: device, canvas, frame loop, teardown
assets/js/gpu/background.js  NEW  Task 2: gradient+grain+ripple-ring pass, init entry
assets/index.html            untouched (canvas is JS-created in Task 1 Step 5)
assets/js/gpu/particles.js   NEW  Task 4: mote pass + serviceadded ripple trigger
assets/css/themes.css        EDIT Task 1: canvas placement + print hiding
src/spa.rs                   EDIT Task 1: 6 get_asset arms + test asserts
assets/js/app.js             EDIT Task 2: call initGpuBackground() in init()
e2e/playwright.config.ts     EDIT Task 2: webgpu project
e2e/specs/gpu-ambient.spec.js NEW Task 1 (absence) + Task 2 (presence)
```

Shared uniform layout — `Float32Array(8)`, 32 bytes, mirrored exactly in every WGSL `struct U`:

| index | field | meaning |
|---|---|---|
| 0 | time | seconds since start |
| 1 | width | canvas CSS pixels |
| 2 | height | canvas CSS pixels |
| 3 | glowX | pointer x, 0..1 across viewport (`-1` = no glow) |
| 4 | glowY | pointer y, 0..1 down viewport |
| 5 | glow | 0..1 strength |
| 6 | rippleT | seconds since ripple, `-1` = idle |
| 7 | pad | unused |

- `index.html` untouched: the canvas is created by `initGpuCanvas()` only after gate + device succeed.

### Task 1: Shared foundation (no visual change)

**Files:**
- Create: `assets/js/gpu/detect.js`, `assets/js/gpu/uniforms.js`, `assets/js/gpu/context.js`
- Modify: `assets/css/themes.css` (placement), `src/spa.rs` (`get_asset` arms + `test_assets_embedded`)
- Test: `src/spa.rs` tests, `e2e/specs/gpu-ambient.spec.js` (absence tests), `node --check`

**Interfaces:**
- Consumes: nothing new. `get_asset(path)` match in `src/spa.rs:26-60`.
- Produces: `isGpuAmbientAllowed() -> boolean` (detect.js); `createUniforms(device) -> { buffer, setGlow(x,y,s), clearGlow(), fireRipple(), tick(dt), setSize(w,h) }` (uniforms.js); `initGpuCanvas() -> { device, format } | null`, `addPass(fn)`, `getCanvas()` (context.js). Pass signature: `(device, context, view, dt) => void`.

- [ ] **Step 1: Extend the failing Rust test**

In `src/spa.rs`, `test_assets_embedded` (line ~146), add:

```rust
assert!(get_asset("js/gpu/detect.js").is_some());
assert!(get_asset("js/gpu/context.js").is_some());
assert!(get_asset("js/gpu/uniforms.js").is_some());
assert!(get_asset("js/gpu/background.js").is_some());
assert!(get_asset("js/gpu/tiles.js").is_some());
assert!(get_asset("js/gpu/particles.js").is_some());
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test spa::tests::test_assets_embedded`
Expected: FAIL with `assertion failed: get_asset("js/gpu/detect.js").is_some()`

- [ ] **Step 3: Create `assets/js/gpu/detect.js`**

```js
export function isGpuAmbientAllowed() {
  if (!('gpu' in navigator) || !navigator.gpu) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return false;
  if (window.matchMedia('(forced-colors: active)').matches) return false;
  return true;
}
```

- [ ] **Step 4: Create `assets/js/gpu/uniforms.js`**

```js
export const UNIFORM_FLOATS = 8;

export function createUniforms(device) {
  const array = new Float32Array(UNIFORM_FLOATS);
  array[3] = -1;
  array[4] = -1;
  array[6] = -1;
  const buffer = device.createBuffer({
    size: UNIFORM_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const queue = device.queue;
  function flush() { queue.writeBuffer(buffer, 0, array); }
  flush();
  return {
    buffer,
    setSize(w, h) { array[1] = w; array[2] = h; flush(); },
    setGlow(x, y, s) { array[3] = x; array[4] = y; array[5] = s; flush(); },
    clearGlow() { array[5] = 0; flush(); },
    fireRipple() { array[6] = 0; flush(); },
    tick(dt) {
      array[0] += dt;
      if (array[6] >= 0) {
        array[6] += dt;
        if (array[6] > 1.2) array[6] = -1;
      }
      flush();
    },
  };
}
```

- [ ] **Step 5: Create `assets/js/gpu/context.js`**

```js
import { isGpuAmbientAllowed } from './detect.js';

let device = null;
let gpuContext = null;
let canvas = null;
let passes = [];
let rafId = 0;
let lastT = 0;

function teardown() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  passes = [];
  if (canvas) canvas.remove();
  canvas = null;
  gpuContext = null;
  device = null;
}

function fitCanvas() {
  if (!canvas) return;
  const w = Math.max(1, Math.floor(window.innerWidth * 0.5));
  const h = Math.max(1, Math.floor(window.innerHeight * 0.5));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

function frame(t) {
  rafId = 0;
  if (!device || passes.length === 0) return;
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0.016);
  lastT = t;
  try {
    const texture = gpuContext.getCurrentTexture();
    const view = texture.createView();
    for (const pass of passes) pass(device, gpuContext, view, dt);
  } catch (err) {
    console.error('WebGPU frame failed, disabling ambient canvas:', err);
    teardown();
    return;
  }
  rafId = requestAnimationFrame(frame);
}

export function addPass(fn) {
  passes.push(fn);
  if (!rafId && device) {
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }
}

export function getCanvas() { return canvas; }

export async function initGpuCanvas() {
  if (!isGpuAmbientAllowed()) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
    if (!adapter) return null;
    device = await adapter.requestDevice();
    if (!device) return null;
  } catch (err) {
    console.error('WebGPU unavailable, using static background:', err);
    return null;
  }
  canvas = document.createElement('canvas');
  canvas.className = 'gpu-canvas';
  canvas.setAttribute('data-testid', 'gpu-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const main = document.querySelector('main');
  if (!main || !main.parentNode) { device.destroy(); device = null; return null; }
  main.parentNode.insertBefore(canvas, main);
  const format = navigator.gpu.getPreferredCanvasFormat();
  gpuContext = canvas.getContext('webgpu');
  try {
    gpuContext.configure({ device, format, alphaMode: 'premultiplied' });
  } catch (err) {
    console.error('WebGPU configure failed, using static background:', err);
    teardown();
    return null;
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  device.lost.then(() => teardown());
  document.addEventListener('visibilitychange', () => {
    if (!device) return;
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (passes.length > 0 && !rafId) {
      lastT = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  });
  return { device, format };
}
```

Re-entry guard (Ruling 3): `app.js` evaluates twice (entry `app.js?v=0.2.0` vs
bare `./app.js` imported by `scan.js` are distinct module URLs), so `init()`
runs twice. Guard the whole body with a shared promise so double init yields
one canvas:

```js
let initPromise = null;
export function initGpuCanvas() {
  if (!initPromise) initPromise = initGpuCanvasOnce();
  return initPromise;
}
```

with the Step 5 body above renamed to `async function initGpuCanvasOnce()`.
The promise stays settled (success or null) for the page lifetime — no retry
path exists, and `device.lost` teardown needs no change.

- [ ] **Step 6: No `assets/index.html` change**

The canvas is created by `initGpuCanvas()` (Step 5) only after the gate and
device both succeed — per the spec, it is never inserted on the fallback
path, so the absence assertion in Step 9 holds. `index.html` stays untouched.

- [ ] **Step 7: Add placement CSS to `assets/css/themes.css`**

Append after the `.dynamic-background` block (line ~53):

```css
.gpu-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

main,
.app-header,
.app-footer {
  position: relative;
  z-index: 1;
}

@media print {
  .gpu-canvas {
    display: none;
  }
}
```
- [ ] **Step 8: Register assets in `src/spa.rs` `get_asset`**

Add after the `"js/background.js"` arm (line 51):

```rust
"js/gpu/detect.js" => include_bytes!("../assets/js/gpu/detect.js"),
"js/gpu/context.js" => include_bytes!("../assets/js/gpu/context.js"),
"js/gpu/uniforms.js" => include_bytes!("../assets/js/gpu/uniforms.js"),
"js/gpu/background.js" => include_bytes!("../assets/js/gpu/background.js"),
"js/gpu/tiles.js" => include_bytes!("../assets/js/gpu/tiles.js"),
"js/gpu/particles.js" => include_bytes!("../assets/js/gpu/particles.js"),
```

- [ ] **Step 9: Write absence e2e spec `e2e/specs/gpu-ambient.spec.js`**

```js
test.describe('gpu ambient fallback', () => {
  // NOTE: installed Playwright 1.62.1 drops reducedMotion from test.use and
  // project fixtures (bundle defect, zero occurrences in the runner bundle).
  // Emulate in-body instead — this also makes the test meaningful on the
  // webgpu project, where the adapter exists and the gate must actively stop it.
  test('no canvas when reduced-motion is set', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('[data-testid="service-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="gpu-canvas"]')).toHaveCount(0);
  });

  test('gpu modules are served as javascript', async ({ page }) => {
    for (const mod of ['detect.js', 'context.js', 'uniforms.js']) {
      const resp = await page.request.get(`/assets/js/gpu/${mod}`);
      expect(resp.status()).toBe(200);
      expect(resp.headers()['content-type']).toContain('javascript');
    }
  });
});
```

Note: an unregistered asset falls back to `index.html` (`text/html`), so the content-type assertion fails until Step 8 is in place and the binary rebuilt.

- [ ] **Step 10: Run gates**

Run: `node --check assets/js/gpu/detect.js && node --check assets/js/gpu/uniforms.js && node --check assets/js/gpu/context.js`
Expected: clean.
Run: `cargo test spa` then `cargo clippy -- -D warnings` then `cargo fmt --check`
Expected: all pass.
Run (after `cargo build --release`): `CI= npx playwright test specs/gpu-ambient.spec.js` from `e2e/`
Expected: 2 passed on desktop + mobile (webgpu project does not exist yet, so only these run). Use the explicit spec path: the bare `gpu-ambient` filter also matches the whole suite.

- [ ] **Step 11: Commit**

```bash
git add src/spa.rs assets/css/themes.css assets/js/gpu/ e2e/specs/gpu-ambient.spec.js
git commit -m "feat(gpu): shared WebGPU foundation with silent fallback"
```

Deliverable: gated context exists, no visual change anywhere (no canvas in DOM on any path yet — Task 2 wires init), Rust registry covers all 6 future modules.

---

### Task 2: PR1 living background

**Files:**
- Create: `assets/js/gpu/background.js`
- Modify: `assets/js/app.js` (init call), `e2e/playwright.config.ts` (webgpu project), `e2e/specs/gpu-ambient.spec.js` (presence test)
- Test: presence test in webgpu project, absence tests still pass

**Interfaces:**
- Consumes: `initGpuCanvas`, `addPass` from `./context.js`; `createUniforms` from `./uniforms.js`. Uniform indices per the File Structure table.
- Produces: `initGpuBackground() -> Promise<void>` (called once from `app.js` init); `setGlow(x, y, s)` re-exported for Task 3 via uniforms handle stored module-locally.

- [ ] **Step 1: Create `assets/js/gpu/background.js`**

```js
import { initGpuCanvas, addPass } from './context.js';
import { createUniforms } from './uniforms.js';

const SHADER = /* wgsl */ `
struct U {
  time: f32, width: f32, height: f32,
  glowX: f32, glowY: f32, glow: f32,
  rippleT: f32, pad: f32,
};
@group(0) @binding(0) var<uniform> u: U;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = p[i] * 0.5 + 0.5;
  return o;
}

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let aspect = u.width / max(u.height, 1.0);
  var uv = in.uv;
  uv.x *= aspect;
  let t = u.time * 0.033;
  let warp = sin(uv.y * 2.1 + t) * 0.5 + sin(uv.x * 1.3 - t * 0.7) * 0.5;
  let m = clamp(uv.y * 0.5 + 0.5 + warp * 0.08, 0.0, 1.0);
  let top = vec3f(0.10, 0.10, 0.18);
  let mid = vec3f(0.09, 0.13, 0.24);
  let bot = vec3f(0.05, 0.16, 0.20);
  var col = mix(top, mid, smoothstep(0.0, 0.55, m));
  col = mix(col, bot, smoothstep(0.55, 1.0, m));
  if (u.glow > 0.001) {
    var g = vec2f(u.glowX * aspect, 1.0 - u.glowY);
    let d = distance(uv, g);
    col += vec3f(0.10, 0.14, 0.20) * u.glow * exp(-d * 4.0);
  }
  if (u.rippleT >= 0.0) {
    let d = distance(uv, vec2f(0.5 * aspect, 0.5));
    let r = u.rippleT * 0.9;
    let ring = exp(-abs(d - r) * 22.0) * (1.0 - u.rippleT / 1.2);
    col += vec3f(0.12, 0.18, 0.22) * max(ring, 0.0);
  }
  col += (hash(in.uv * vec2f(u.width, u.height) + fract(u.time)) - 0.5) * 0.035;
  return vec4f(col, 1.0);
}
`;

let uniforms = null;

export function getGlowApi() { return uniforms; }

export async function initGpuBackground() {
  const ctx = await initGpuCanvas();
  if (!ctx) return;
  const { device, format } = ctx;
  try {
    uniforms = createUniforms(device);
    const module = device.createShaderModule({ code: SHADER });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    uniforms.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () =>
      uniforms.setSize(window.innerWidth, window.innerHeight));
    addPass((dev, _ctx, view, dt) => {
      uniforms.tick(dt);
      const encoder = dev.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view, loadOp: 'clear', storeOp: 'store',
          clearValue: { r: 0.1, g: 0.1, b: 0.18, a: 1 },
        }],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      dev.queue.submit([encoder.finish()]);
      window.__gpuPresented = true;
    });
  } catch (err) {
    console.error('WebGPU background failed, using static background:', err);
    document.querySelector('[data-testid="gpu-canvas"]')?.remove();
  }
}
```

Dormant-by-design: the ripple branch renders nothing until Task 4 calls `fireRipple()`; glow renders nothing until Task 3 calls `setGlow()`.

- [ ] **Step 2: Wire init in `assets/js/app.js`**

Add import at top (after the `background.js` import line 6):

```js
import { initGpuBackground } from './gpu/background.js';
```

Add call after `await initBackgroundToggle();` (line 105):

```js
await initGpuBackground();
```

`await` on a null-returning gate keeps ordering deterministic; failure never throws (all paths caught, canvas removed).

- [ ] **Step 3: Add webgpu project to `e2e/playwright.config.ts`**

Append to the `projects` array (after the mobile entry):

```ts
{
  name: 'webgpu',
  use: {
    ...devices['Desktop Chrome'],
    launchOptions: {
      args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'],
    },
  },
},
```

No `executablePath` (repo rule). If the local run reports WebGPU unavailable, fix with `npx playwright install chromium`, never a system path.

- [ ] **Step 4: Add presence test to `e2e/specs/gpu-ambient.spec.js`**

```js
test.describe('gpu ambient presence', () => {
  // NOTE: test.info() is only valid inside a test body. Gate per-test.
  test('canvas presents one frame', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'webgpu',
      'needs the webgpu project (SwiftShader flags)'
    );
    await page.goto('/');
    // Poll the first-frame marker, not canvas visibility: device.lost
    // teardown may remove the canvas after frames were presented.
    await expect
      .poll(() => page.evaluate(() => window.__gpuPresented === true), {
        timeout: 30000,
      })
      .toBe(true);
    await expect(page.locator('[data-testid="service-grid"]')).toBeVisible();
  });
});
```

Append after the fallback describe block. No change to the Task 1 absence
tests: they emulate `reducedMotion: 'reduce'`, which forces the gate off on
every project, so they pass on desktop, mobile, and webgpu alike.

- [ ] **Step 5: Run gates**

Run: `node --check assets/js/gpu/background.js && node --check assets/js/app.js`
Expected: clean.
Run: `cargo test spa && cargo clippy -- -D warnings && cargo fmt --check`
Expected: pass (release rebuild embeds new JS: `cargo build --release`).
Run: `CI= npx playwright test specs/gpu-ambient.spec.js --project=desktop --project=mobile` from `e2e/`
Expected: absence tests pass, presence skipped.
Run: `CI= npx playwright test specs/gpu-ambient.spec.js --project=webgpu` from `e2e/`
Expected: absence tests pass (reduced-motion forces fallback), presence passes via marker.
- [ ] **Step 6: Commit**

```bash
git add assets/js/gpu/background.js assets/js/app.js e2e/playwright.config.ts e2e/specs/gpu-ambient.spec.js
git commit -m "feat(gpu): ambient background shader pass"
```

Deliverable: PR1 — slow gradient+grain living background under the dark overlay on capable browsers; static `background.webp` everywhere else.

---

### Task 3: PR2 tactile tiles

**Files:**
- Create: `assets/js/gpu/tiles.js`
- Modify: `assets/js/app.js` (init call), `assets/css/components.css` (tilt transition + mobile override)
- Test: extend `e2e/specs/gpu-ambient.spec.js` (tilt works with canvas disabled)

**Interfaces:**
- Consumes: `getGlowApi()` from `./background.js` (returns uniforms handle or null). Uniform indices per File Structure table.
- Produces: `initTileGlow() -> void`.

- [ ] **Step 1: Create `assets/js/gpu/tiles.js`**

```js
import { getGlowApi } from './background.js';

const MAX_TILT_DEG = 4;

export function initTileGlow() {
  if (window.matchMedia('(hover: none)').matches) return;
  const grid = document.querySelector('[data-testid="service-grid"]');
  if (!grid) return;
  grid.addEventListener('pointermove', (ev) => {
    const tile = ev.target.closest('[data-testid="tile"]');
    const api = getGlowApi();
    const nx = ev.clientX / window.innerWidth;
    const ny = ev.clientY / window.innerHeight;
    if (api) api.setGlow(nx, ny, tile ? 0.9 : 0.0);
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
    grid.querySelectorAll('[data-testid="tile"]').forEach((t) => {
      t.style.transform = '';
    });
  });
}
```

Inline `style.transform` (not a class) so `renderGrid()` re-renders wipe it cleanly; entrance animation uses `animation`, unaffected. With WebGPU absent `getGlowApi()` returns null and only the CSS tilt applies.

- [ ] **Step 2: Wire init in `assets/js/app.js`**

```js
import { initTileGlow } from './gpu/tiles.js';
```

Call after `await initGpuBackground();`:

```js
initTileGlow();
```

Sync call (no device work, only event listeners). Safe to run before/after grid render since it binds to the persistent `[data-testid="service-grid"]` section, not tiles.

- [ ] **Step 3: Add tilt transition to `assets/css/components.css`**

Append at the end of the file (after the mobile `@media (max-width: 599px)` block, per the import-order learning — tile overrides live in components.css):

```css
.tile {
  transition: transform 0.15s ease-out;
  will-change: transform;
}

@media (max-width: 599px) {
  .tile {
    transition: none;
  }
}
```

Mobile keeps no tilt-transition (touch has no hover; `tiles.js` already exits on `(hover: none)`). Desktop transition only animates `transform`, preserving the GPU-composited-only rule.

- [ ] **Step 4: Add fallback interaction test**

Append to `e2e/specs/gpu-ambient.spec.js`:

```js
test.describe('tile tilt fallback', () => {
  test('hover tilts tile without canvas', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'needs hover-capable viewport');
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'gpu', { value: undefined });
    });
    await page.goto('/');
    await page.evaluate(async () => {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Strandgut',
          language: 'en',
          scan_defaults: 'simple',
          services: [
            { name: 'S1', url: 'http://example.com', position: { row: 0, col: 0 } },
            { name: 'S2', url: 'http://example.com', position: { row: 0, col: 1 } },
          ],
        }),
      });
    });
    await page.reload();
    const tile = page.locator('[data-testid="tile"]').first();
    await expect(tile).toBeVisible();
    await tile.hover();
    expect(await tile.evaluate((el) => el.style.transform)).toContain('perspective');
    await expect(page.locator('[data-testid="gpu-canvas"]')).toHaveCount(0);
  });
});
```

Follows the `background-rotate.spec.js` seed-via-API pattern (goto first:
evaluate needs a page context; onboarding otherwise blocks the grid).
`addInitScript` removes `navigator.gpu`, so this exercises the real no-WebGPU
path: tilt applies via inline style, glow is skipped, no canvas exists.
Skipped on mobile (no hover) and webgpu (GPU present) projects.

- [ ] **Step 5: Run gates**

Run: `node --check assets/js/gpu/tiles.js && node --check assets/js/app.js`
Expected: clean. Rebuild release, then:
Run: `CI= npx playwright test gpu-ambient --project=desktop --project=mobile` from `e2e/`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add assets/js/gpu/tiles.js assets/js/app.js assets/css/components.css e2e/specs/gpu-ambient.spec.js
git commit -m "feat(gpu): tactile tile tilt with glow uniform"
```

Deliverable: PR2 — pointer tilt on tiles + canvas glow on capable browsers; tilt-only (no glow) when WebGPU is gated off; nothing on touch.

---

### Task 4: PR3 ambient polish

**Files:**
- Create: `assets/js/gpu/particles.js`
- Modify: `assets/js/app.js` (init call), `e2e/specs/gpu-ambient.spec.js` (ripple smoke test)
- Test: webgpu-project ripple test, full gates (`cargo test`, clippy, fmt, full e2e)

**Interfaces:**
- Consumes: `addPass` from `./context.js`; `getGlowApi()` from `./background.js` (uniforms handle: `buffer`, `fireRipple()`). Uniform indices per File Structure table.
- Produces: `initParticles() -> void`.

- [ ] **Step 1: Create `assets/js/gpu/particles.js`**

48 instanced quads drifting upward, alpha 0.08 max, one draw call, second pass after the background pass:

```js
import { addPass } from './context.js';
import { getGlowApi } from './background.js';

const COUNT = 48;

const SHADER = /* wgsl */ `
struct U {
  time: f32, width: f32, height: f32,
  glowX: f32, glowY: f32, glow: f32,
  rippleT: f32, pad: f32,
};
@group(0) @binding(0) var<uniform> u: U;
struct VSOut { @builtin(position) pos: vec4f, @location(0) a: f32 };
@vertex fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
) -> VSOut {
  let f = fract(sin(f32(ii) * 12.9898) * 43758.5453);
  let g = fract(sin(f32(ii) * 78.233) * 12543.123);
  let speed = 0.008 + f * 0.014;
  var y = fract(g - u.time * speed);
  var x = fract(f + sin(u.time * 0.05 + f * 6.28) * 0.02);
  let quad = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let size = 0.0016 + f * 0.0022;
  var o: VSOut;
  o.pos = vec4f((x - 0.5) * 2.0 + quad[vi].x * size * 2.0, (y - 0.5) * 2.0 + quad[vi].y * size * 2.0, 0.0, 1.0);
  o.a = 0.08 * smoothstep(0.0, 0.15, y) * smoothstep(1.0, 0.7, y);
  return o;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return vec4f(0.55, 0.65, 0.85, in.a);
}
`;
```
Pipeline creation happens lazily inside the first pass invocation, because
`addPass` callbacks receive the device and `initParticles` does not have it:

```js
export function initParticles() {
  const api = getGlowApi();
  if (!api) return;
  window.addEventListener('serviceadded', () => api.fireRipple());
  let pipeline = null;
  let bindGroup = null;
  addPass((dev, _ctx, view, _dt) => {
    if (!pipeline) {
      const module = dev.createShaderModule({ code: SHADER });
      pipeline = dev.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [{
            format: navigator.gpu.getPreferredCanvasFormat(),
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
      });
      bindGroup = dev.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: api.buffer } }],
      });
    }
    const encoder = dev.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6, COUNT);
    pass.end();
    dev.queue.submit([encoder.finish()]);
  });
}
```

`loadOp: 'load'` composites motes over the background pass output. No-op without WebGPU: `getGlowApi()` is null until `initGpuBackground()` succeeds, so the early return covers fallback, touch, and reduced-motion.

- [ ] **Step 2: Wire init in `assets/js/app.js`**

```js
import { initParticles } from './gpu/particles.js';
```

Call after `initTileGlow();`:

```js
initParticles();
```

Order matters: `initGpuBackground()` (async, Task 2) must have resolved before `initParticles()` reads `getGlowApi()`. Both calls sit sequentially after `await initBackgroundToggle();`, so the await chain guarantees it.

- [ ] **Step 3: Add ripple smoke test**

Append to `e2e/specs/gpu-ambient.spec.js`:

```js
test.describe('gpu ripple', () => {
  // NOTE: test.info() is only valid inside a test body. Gate per-test.
  test('serviceadded does not break the page', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'webgpu',
      'needs the webgpu project (SwiftShader flags)'
    );
    await page.goto('/');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('serviceadded')));
    // Marker, not canvas visibility: device.lost teardown may remove the
    // canvas after frames were presented (Ruling 4).
    await expect
      .poll(() => page.evaluate(() => window.__gpuPresented === true), {
        timeout: 30000,
      })
      .toBe(true);
    await expect(page.locator('[data-testid="service-grid"]')).toBeVisible();
  });
});
```

Behavioral, not pixel: the ripple uniform fires, the frame loop survives, DOM asserts only (no shader pixel-diff per spec).

- [ ] **Step 4: Run full gates**

Run: `node --check assets/js/gpu/particles.js && node --check assets/js/app.js`
Expected: clean.
Run: `cargo test` (full suite)
Expected: pass.
Run: `cargo clippy -- -D warnings && cargo fmt --check`
Expected: clean.
Rebuild release, then from `e2e/`:
Run: `CI= npx playwright test gpu-ambient --project=webgpu`
Expected: pass.
Run: `CI= npx playwright test` (full suite, both projects + webgpu)
Expected: pass, only pre-existing skips.

- [ ] **Step 5: Commit**

```bash
git add assets/js/gpu/particles.js assets/js/app.js e2e/specs/gpu-ambient.spec.js
git commit -m "feat(gpu): drifting motes and scan ripple"
```

Deliverable: PR3 — mote drift + `serviceadded` ripple on capable browsers; CSS-only motion everywhere else.

---

## Self-Review

1. **Spec coverage:** shared foundation (§1: detect/context/canvas/CSS/spa.rs) → Task 1. PR1 background shader → Task 2. PR2 tilt + glow → Task 3. PR3 motes + ripple → Task 4. Guards: a11y gate in `detect.js` (Task 1), perf budget in context sizing + single-pass design (Tasks 1/2/4), error handling teardown paths (Tasks 1/2), testing split default/webgpu projects (Tasks 1/2/4), rollout stacking (task order). Covered.
2. **Placeholder scan:** no TBD/TODO; every step has exact code, exact commands, exact expected output. Task 4 Step 1 ships two consecutive blocks (imports + shader, then `initParticles` with lazy pipeline creation) — together they are the complete file.
3. **Type consistency:** uniform layout defined once (File Structure table, 8 floats) and mirrored in `uniforms.js`, background WGSL `struct U`, and particles WGSL `struct U`. `getGlowApi()` returns the uniforms handle `{ buffer, setGlow, clearGlow, fireRipple, tick, setSize }` everywhere. Pass signature `(device, context, view, dt)` identical in context/addPass, background, particles. `initGpuBackground` awaited before `initParticles` reads the handle.
