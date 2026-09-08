# WebGL Ambient Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subtle WebGL2 ambient visuals for Strandgut in 4 stacked tasks: shared foundation, living background, tactile tiles, ambient polish. WebGL2-only per Ruling 6 (WebGPU can never activate over plain-HTTP LAN).

**Architecture:** One fixed `<canvas>` behind the tile grid, one shared `assets/js/gpu/` module (a11y gate, WebGL2 context, shared uniforms object). Each effect registers a render pass on the shared rAF loop; GLSL ES 3.00 inline in JS. Any init failure removes the canvas; page pixel-identical to today.

**Tech Stack:** Raw WebGL2 + inline GLSL ES 3.00, vanilla ES modules (no bundler), Rust `include_bytes!` asset registry, Playwright e2e (no special project — headless Chromium does WebGL2 by default).

**Spec:** `docs/superpowers/specs/2026-09-08-webgpu-ambient-design.md` (including Pivot: WebGL2-only)

## Global Constraints

- `cargo fmt --check` clean and `cargo clippy -- -D warnings` zero warnings before each task commit.
- No `unwrap()` in Rust production paths (tests may unwrap).
- JS: ES modules, explicit imports, no dependencies. `node --check` every new file.
- `data-testid="gpu-canvas"` on the canvas; `aria-hidden="true"` (decorative).
- Binary stays <5MB; musl container only.
- e2e: never set `launchOptions.executablePath`; run locally with `CI= npx playwright test specs/<file>` from `e2e/` to reuse the dev server (explicit spec path — bare filters match the whole suite). Pre-build with `cargo build --release`.
- Emulated media always in-body (`await page.emulateMedia(...)`); installed Playwright 1.62.1 drops `reducedMotion` from `test.use`/project fixtures.
- Silent fallback everywhere: no user-facing errors, grid render never blocked.
- `.app-header` is never touched by canvas CSS (`layout.css` owns its sticky/z-100; `themes.css` imports last).

---

## File Structure

```
assets/js/gpu/detect.js      NEW  Task 1: a11y gate (capability is proven by context creation)
assets/js/gpu/uniforms.js    NEW  Task 1: shared uniforms object + GL apply helper
assets/js/gpu/context.js     NEW  Task 1: canvas, webgl2 ctx, frame loop, teardown, re-entry guard
assets/js/gpu/background.js  NEW  Task 2: gradient+grain+ripple-ring pass, init entry
assets/js/gpu/tiles.js       NEW  Task 3: DOM tilt + glow uniform writer
assets/js/gpu/particles.js   NEW  Task 4: mote pass + serviceadded ripple trigger
assets/css/themes.css        EDIT Task 1: canvas placement (main/.app-footer only) + print hiding
src/spa.rs                   EDIT Task 1: 6 get_asset arms + test asserts
assets/js/app.js             EDIT Task 2/3/4: sequential init calls
e2e/specs/gpu-ambient.spec.js NEW Task 1 (absence), extended Tasks 2-4
```

Shared uniforms object — single source of truth, mirrored as individual uniforms in every GLSL program:

| field | init | meaning |
|---|---|---|
| time | 0 | seconds since start |
| w, h | 0 | canvas CSS pixels |
| glowX, glowY | -1 | pointer 0..1 (`-1` = no glow) |
| glow | 0 | 0..1 strength |
| rippleT | -1 | seconds since ripple (`-1` = idle) |

GLSL programs declare: `uniform float u_time; uniform vec2 u_res; uniform vec3 u_glow; uniform float u_ripple;`

---

### Task 1: Shared foundation (no visual change)

**Files:**
- Create: `assets/js/gpu/detect.js`, `assets/js/gpu/uniforms.js`, `assets/js/gpu/context.js`
- Modify: `assets/css/themes.css` (placement), `src/spa.rs` (`get_asset` arms + `test_assets_embedded`)
- Test: `src/spa.rs` tests, `e2e/specs/gpu-ambient.spec.js` (absence tests), `node --check`

**Interfaces:**
- Consumes: `get_asset(path)` match in `src/spa.rs`.
- Produces: `isGpuAmbientAllowed() -> boolean` (detect.js); `createUniforms() -> { time,w,h,glowX,glowY,glow,rippleT, setSize(w,h), setGlow(x,y,s), clearGlow(), fireRipple(), tick(dt) }` + `applyUniforms(gl, loc, u)` (uniforms.js); `initGpuCanvas() -> { gl } | null`, `addPass(fn)`, `compileProgram(gl, vsSrc, fsSrc) -> WebGLProgram | null` (context.js). Pass signature: `(gl, dt) => void`.

- [ ] **Step 1: Extend the failing Rust test**

In `src/spa.rs`, `test_assets_embedded`, add:

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
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return false;
  if (window.matchMedia('(forced-colors: active)').matches) return false;
  return true;
}
```

Capability is proven by context creation in Step 5 (a null context fails the same way everywhere, no separate probe needed).

- [ ] **Step 4: Create `assets/js/gpu/uniforms.js`**

```js
export function createUniforms() {
  const u = {
    time: 0, w: 0, h: 0,
    glowX: -1, glowY: -1, glow: 0,
    rippleT: -1,
    setSize(w, h) { u.w = w; u.h = h; },
    setGlow(x, y, s) { u.glowX = x; u.glowY = y; u.glow = s; },
    clearGlow() { u.glow = 0; },
    fireRipple() { u.rippleT = 0; },
    tick(dt) {
      u.time += dt;
      if (u.rippleT >= 0) {
        u.rippleT += dt;
        if (u.rippleT > 1.2) u.rippleT = -1;
      }
    },
  };
  return u;
}

export function applyUniforms(gl, loc, u) {
  gl.uniform1f(loc.time, u.time);
  gl.uniform2f(loc.res, u.w, u.h);
  gl.uniform3f(loc.glow, u.glowX, u.glowY, u.glow);
  gl.uniform1f(loc.ripple, u.rippleT);
}

export function getUniformLocs(gl, prog) {
  return {
    time: gl.getUniformLocation(prog, 'u_time'),
    res: gl.getUniformLocation(prog, 'u_res'),
    glow: gl.getUniformLocation(prog, 'u_glow'),
    ripple: gl.getUniformLocation(prog, 'u_ripple'),
  };
}
```

- [ ] **Step 5: Create `assets/js/gpu/context.js`**

```js
import { isGpuAmbientAllowed } from './detect.js';

let gl = null;
let canvas = null;
let passes = [];
let rafId = 0;
let lastT = 0;
let initPromise = null;

function teardown() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  passes = [];
  if (canvas) canvas.remove();
  canvas = null;
  gl = null;
}

function fitCanvas() {
  if (!canvas || !gl) return;
  const w = Math.max(1, Math.floor(window.innerWidth * 0.5));
  const h = Math.max(1, Math.floor(window.innerHeight * 0.5));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

function frame(t) {
  rafId = 0;
  if (!gl || passes.length === 0) return;
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0.016);
  lastT = t;
  try {
    for (const pass of passes) pass(gl, dt);
  } catch (err) {
    console.error('WebGL frame failed, disabling ambient canvas:', err);
    teardown();
    return;
  }
  rafId = requestAnimationFrame(frame);
}

export function addPass(fn) {
  passes.push(fn);
  if (!rafId && gl) {
    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }
}

export function getGL() { return gl; }

export function compileProgram(glc, vsSrc, fsSrc) {
  function shader(type, src) {
    const s = glc.createShader(type);
    glc.shaderSource(s, src);
    glc.compileShader(s);
    if (!glc.getShaderParameter(s, glc.COMPILE_STATUS)) {
      console.error('Shader compile failed:', glc.getShaderInfoLog(s));
      glc.deleteShader(s);
      return null;
    }
    return s;
  }
  const vs = shader(glc.VERTEX_SHADER, vsSrc);
  const fs = shader(glc.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = glc.createProgram();
  glc.attachShader(prog, vs);
  glc.attachShader(prog, fs);
  glc.linkProgram(prog);
  glc.deleteShader(vs);
  glc.deleteShader(fs);
  if (!glc.getProgramParameter(prog, glc.LINK_STATUS)) {
    console.error('Program link failed:', glc.getProgramInfoLog(prog));
    glc.deleteProgram(prog);
    return null;
  }
  return prog;
}

async function initGpuCanvasOnce() {
  if (!isGpuAmbientAllowed()) return null;
  canvas = document.createElement('canvas');
  canvas.className = 'gpu-canvas';
  canvas.setAttribute('data-testid', 'gpu-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const main = document.querySelector('main');
  if (!main || !main.parentNode) { canvas = null; return null; }
  main.parentNode.insertBefore(canvas, main);
  try {
    gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
    });
    if (!gl) { teardown(); return null; }
  } catch (err) {
    console.error('WebGL2 unavailable, using static background:', err);
    teardown();
    return null;
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    teardown();
  });
  document.addEventListener('visibilitychange', () => {
    if (!gl) return;
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (passes.length > 0 && !rafId) {
      lastT = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  });
  return { gl };
}

export function initGpuCanvas() {
  if (!initPromise) initPromise = initGpuCanvasOnce();
  return initPromise;
}
```

Re-entry guard is built in from the start (`app.js` evaluates twice: entry `app.js?v=` vs bare `./app.js` are distinct module URLs).

- [ ] **Step 6: Add placement CSS to `assets/css/themes.css`**

Append after the `.dynamic-background` block:

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

`.app-header` excluded on purpose (`layout.css` owns its sticky/z-100; `themes.css` imports last).

- [ ] **Step 7: Register assets in `src/spa.rs` `get_asset`**

Add after the `"js/background.js"` arm:

```rust
"js/gpu/detect.js" => include_bytes!("../assets/js/gpu/detect.js"),
"js/gpu/context.js" => include_bytes!("../assets/js/gpu/context.js"),
"js/gpu/uniforms.js" => include_bytes!("../assets/js/gpu/uniforms.js"),
"js/gpu/background.js" => include_bytes!("../assets/js/gpu/background.js"),
"js/gpu/tiles.js" => include_bytes!("../assets/js/gpu/tiles.js"),
"js/gpu/particles.js" => include_bytes!("../assets/js/gpu/particles.js"),
```

`include_bytes!` needs real files: create `background.js`, `tiles.js`, `particles.js` as one-line ownership comments (`// Owned by Task N — full implementation there.`), fully overwritten by Tasks 2-4. MIME detection already covers `.js`.

- [ ] **Step 8: Write absence e2e spec `e2e/specs/gpu-ambient.spec.js`**

```js
import { test, expect } from '@playwright/test';

test.describe('gpu ambient fallback', () => {
  // In-body emulation: installed Playwright 1.62.1 drops reducedMotion
  // from test.use/project fixtures. Meaningful everywhere: headless
  // Chromium HAS WebGL2, so the gate must actively stop the canvas.
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

Note: an unregistered asset falls back to `index.html` (`text/html`), so the content-type assertion fails until Step 7 is in place and the binary rebuilt.

- [ ] **Step 9: Run gates**

Run: `node --check` on all 6 `assets/js/gpu/*.js`
Expected: clean.
Run: `cargo test spa` then `cargo clippy -- -D warnings` then `cargo fmt --check`
Expected: all pass.
Run (after `cargo build --release`): `CI= npx playwright test specs/gpu-ambient.spec.js` from `e2e/`
Expected: 2 passed on desktop + mobile.

- [ ] **Step 10: Commit**

```bash
git add src/spa.rs assets/css/themes.css assets/js/gpu/ e2e/specs/gpu-ambient.spec.js
git commit -m "feat(gl): shared WebGL foundation with silent fallback"
```

Deliverable: gated context exists, no visual change anywhere, Rust registry covers all 6 modules.

---

### Task 2: Living background

**Files:**
- Create (overwrite stub): `assets/js/gpu/background.js`
- Modify: `assets/js/app.js` (import + `await initGpuBackground()` after `await initBackgroundToggle();`), `e2e/specs/gpu-ambient.spec.js` (presence test)
- Test: presence test on desktop/mobile (WebGL2 works headless, no special project)

**Interfaces:**
- Consumes: `initGpuCanvas`, `addPass`, `compileProgram` from `./context.js`; `createUniforms`, `applyUniforms`, `getUniformLocs` from `./uniforms.js`.
- Produces: `initGpuBackground() -> Promise<void>`; `getGlowApi()` (uniforms handle or null; null it in catch so failed init never reports ready).

- [ ] **Step 1: Write `assets/js/gpu/background.js`**

```js
import { initGpuCanvas, addPass, compileProgram } from './context.js';
import { createUniforms, applyUniforms, getUniformLocs } from './uniforms.js';

const VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform vec2 u_res;
uniform vec3 u_glow;
uniform float u_ripple;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 uv = v_uv;
  uv.x *= aspect;
  float t = u_time * 0.033;
  float warp = sin(uv.y * 2.1 + t) * 0.5 + sin(uv.x * 1.3 - t * 0.7) * 0.5;
  float m = clamp(uv.y * 0.5 + 0.5 + warp * 0.08, 0.0, 1.0);
  vec3 top = vec3(0.10, 0.10, 0.18);
  vec3 mid = vec3(0.09, 0.13, 0.24);
  vec3 bot = vec3(0.05, 0.16, 0.20);
  vec3 col = mix(top, mid, smoothstep(0.0, 0.55, m));
  col = mix(col, bot, smoothstep(0.55, 1.0, m));
  if (u_glow.z > 0.001) {
    vec2 g = vec2(u_glow.x * aspect, 1.0 - u_glow.y);
    float d = distance(uv, g);
    col += vec3(0.10, 0.14, 0.20) * u_glow.z * exp(-d * 4.0);
  }
  if (u_ripple >= 0.0) {
    float d = distance(uv, vec2(0.5 * aspect, 0.5));
    float r = u_ripple * 0.9;
    float ring = exp(-abs(d - r) * 22.0) * (1.0 - u_ripple / 1.2);
    col += vec3(0.12, 0.18, 0.22) * max(ring, 0.0);
  }
  col += (hash(v_uv * u_res + fract(u_time)) - 0.5) * 0.035;
  outColor = vec4(col, 1.0);
}
`;

let uniforms = null;

export function getGlowApi() { return uniforms; }

export async function initGpuBackground() {
  const ctx = await initGpuCanvas();
  if (!ctx) return;
  const { gl } = ctx;
  try {
    const u = createUniforms();
    const prog = compileProgram(gl, VS, FS);
    if (!prog) throw new Error('background program failed');
    const loc = getUniformLocs(gl, prog);
    u.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () =>
      u.setSize(window.innerWidth, window.innerHeight));
    uniforms = u;
    addPass((glc, dt) => {
      u.tick(dt);
      glc.viewport(0, 0, glc.drawingBufferWidth, glc.drawingBufferHeight);
      glc.clearColor(0.1, 0.1, 0.18, 1.0);
      glc.clear(glc.COLOR_BUFFER_BIT);
      glc.useProgram(prog);
      applyUniforms(glc, loc, u);
      glc.drawArrays(glc.TRIANGLES, 0, 3);
      window.__gpuPresented = true;
    });
  } catch (err) {
    console.error('WebGL background failed, using static background:', err);
    uniforms = null;
    document.querySelector('[data-testid="gpu-canvas"]')?.remove();
  }
}
```

Dormant-by-design: ripple renders nothing until Task 4 calls `fireRipple()`; glow nothing until Task 3 calls `setGlow()`. `window.__gpuPresented` (precedent: `window.__t`) marks the first presented frame for tests. `uniforms = null` in catch so `getGlowApi()` never reports ready after failed init.

- [ ] **Step 2: Wire init in `assets/js/app.js`**

```js
import { initGpuBackground } from './gpu/background.js';
```

after the `background.js` import, and:

```js
await initGpuBackground();
```

after `await initBackgroundToggle();`.

- [ ] **Step 3: Add presence test**

Append to `e2e/specs/gpu-ambient.spec.js`:

```js
test.describe('gpu ambient presence', () => {
  test('canvas presents one frame', async ({ page }) => {
    await page.goto('/');
    // Marker, not visibility: context-loss teardown may remove the canvas
    // after frames were presented.
    await expect
      .poll(() => page.evaluate(() => window.__gpuPresented === true), {
        timeout: 30000,
      })
      .toBe(true);
    await expect(page.locator('[data-testid="service-grid"]')).toBeVisible();
  });
});
```

Runs on desktop + mobile (headless Chromium has WebGL2; no special project or flags).

- [ ] **Step 4: Run gates**

Run: `node --check` on touched JS. `cargo test spa && cargo clippy -- -D warnings && cargo fmt --check`. Rebuild release. From `e2e/`: `CI= npx playwright test specs/gpu-ambient.spec.js` — expect all pass on desktop + mobile.

- [ ] **Step 5: Commit**

```bash
git add assets/js/gpu/background.js assets/js/app.js e2e/specs/gpu-ambient.spec.js
git commit -m "feat(gl): ambient background shader pass"
```

---

### Task 3: Tactile tiles

**Files:**
- Create (overwrite stub): `assets/js/gpu/tiles.js`
- Modify: `assets/js/app.js` (import + sync `initTileGlow()` after `await initGpuBackground();`), `assets/css/components.css` (tilt transition + mobile override), `e2e/specs/gpu-ambient.spec.js` (tilt test)

**Interfaces:**
- Consumes: `getGlowApi()` from `./background.js`.
- Produces: `initTileGlow() -> void`.

- [ ] **Step 1: Write `assets/js/gpu/tiles.js`**

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

Inline `style.transform` so `renderGrid()` re-renders wipe it. Null API (fallback) still tilts.

- [ ] **Step 2: Wire init + Step 3: CSS** (same as proven WebGPU plan)

`app.js`: `import { initTileGlow } from './gpu/tiles.js';` + `initTileGlow();` after `await initGpuBackground();` (sync; binds to the persistent grid section).

`components.css` appended at end (after the mobile block):

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

Transform-only (GPU-composited rule); mobile disables transition (`tiles.js` exits on hover:none anyway).

- [ ] **Step 4: Tilt test** (fallback forced via proven in-body emulation)

```js
test.describe('tile tilt fallback', () => {
  test('hover tilts tile without canvas', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'needs hover-capable viewport');
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
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const tile = page.locator('[data-testid="tile"]').first();
    await expect(tile).toBeVisible();
    await tile.hover();
    expect(await tile.evaluate((el) => el.style.transform)).toContain('perspective');
    await expect(page.locator('[data-testid="gpu-canvas"]')).toHaveCount(0);
  });
});
```

Seeding needs a page context (goto first); emulation before the final reload so init observes it.

- [ ] **Step 5: Gates + Step 6: Commit**

`node --check`, release rebuild, `CI= npx playwright test specs/gpu-ambient.spec.js` desktop+mobile.

```bash
git add assets/js/gpu/tiles.js assets/js/app.js assets/css/components.css e2e/specs/gpu-ambient.spec.js
git commit -m "feat(gl): tactile tile tilt with glow"
```

---

### Task 4: Ambient polish

**Files:**
- Create (overwrite stub): `assets/js/gpu/particles.js`
- Modify: `assets/js/app.js` (`initParticles()` after `initTileGlow();`), `e2e/specs/gpu-ambient.spec.js` (ripple test)
- Test: ripple smoke test + FULL gates (`cargo test`, clippy, fmt, full e2e suite)

**Interfaces:**
- Consumes: `addPass` from `./context.js`; `getGlowApi()` from `./background.js`.
- Produces: `initParticles() -> void`. No `scan.js` change (existing `serviceadded` event).

- [ ] **Step 1: Write `assets/js/gpu/particles.js`**

48 instanced quads, alpha 0.08 max, single draw, composited over the background pass (no clear — draws on top):

```js
import { addPass } from './context.js';
import { getGlowApi } from './background.js';
import { getUniformLocs, applyUniforms } from './uniforms.js';

const COUNT = 48;

const VS = `#version 300 es
uniform float u_time;
out float v_a;
void main() {
  uint ii = uint(gl_InstanceID);
  uint vi = uint(gl_VertexID);
  float f = fract(sin(float(ii) * 12.9898) * 43758.5453);
  float g = fract(sin(float(ii) * 78.233) * 12543.123);
  float speed = 0.008 + f * 0.014;
  float y = fract(g - u_time * speed);
  float x = fract(f + sin(u_time * 0.05 + f * 6.28) * 0.02);
  float qx = (vi == 1u || vi == 4u) ? 1.0 : -1.0;
  float qy = (vi < 2u) ? -1.0 : 1.0;
  float size = 0.0016 + f * 0.0022;
  vec2 p = vec2((x - 0.5) * 2.0 + qx * size * 2.0, (y - 0.5) * 2.0 + qy * size * 2.0);
  gl_Position = vec4(p, 0.0, 1.0);
  v_a = 0.08 * smoothstep(0.0, 0.15, y) * smoothstep(1.0, 0.7, y);
}
`;

const FS = `#version 300 es
precision highp float;
in float v_a;
out vec4 outColor;
void main() {
  outColor = vec4(0.55, 0.65, 0.85, v_a);
}
`;

export function initParticles() {
  const api = getGlowApi();
  if (!api) return;
  window.addEventListener('serviceadded', () => api.fireRipple());
  let prog = null;
  let loc = null;
  addPass((glc, _dt) => {
    if (!prog) {
      prog = glc.createProgram();
      if (!prog) return;
      const { compileProgram } = { compileProgram: null };
    }
  });
}
```

Wait — `compileProgram` import was dropped above but the lazy body needs it. Correct final body (import it from context.js at top):

```js
import { addPass, compileProgram } from './context.js';
import { getGlowApi } from './background.js';
import { getUniformLocs, applyUniforms } from './uniforms.js';
```

and the pass:

```js
  let prog = null;
  let loc = null;
  addPass((glc, _dt) => {
    if (!prog) {
      prog = compileProgram(glc, VS, FS);
      if (!prog) return;
      loc = getUniformLocs(glc, prog);
      glc.enable(glc.BLEND);
      glc.blendFunc(glc.SRC_ALPHA, glc.ONE_MINUS_SRC_ALPHA);
    }
    const apiNow = getGlowApi();
    if (!apiNow) return;
    glc.useProgram(prog);
    applyUniforms(glc, loc, apiNow);
    glc.drawArrays(glc.TRIANGLES, 0, 6 * COUNT);
  });
```

Instancing without a bound ARRAY_BUFFER: `drawArrays(TRIANGLES, 0, 6*COUNT)` with no enabled attribs dispatches `gl_VertexID` 0..6*COUNT-1 and `gl_InstanceID` = vertex/6? NO — wrong: without instanced draw, gl_InstanceID is 0 and VertexID runs 0..287. Must use `drawArraysInstanced(TRIANGLES, 0, 6, COUNT)`. Corrected line:

```js
    glc.drawArraysInstanced(glc.TRIANGLES, 0, 6, COUNT);
```

(Attribute-less rendering with only gl_VertexID/gl_InstanceID is valid WebGL2.) The file ships the corrected form above: imports incl. `compileProgram`, lazy program creation, `drawArraysInstanced`.

`loadOp` equivalent: the pass simply does not clear, so motes composite over the background output. Both passes share one rAF in registration order (background first).

- [ ] **Step 2: Wire init** (`import { initParticles }...` + `initParticles();` after `initTileGlow();` — `initGpuBackground()` awaited earlier, handle valid).

- [ ] **Step 3: Ripple test**

```js
test.describe('gpu ripple', () => {
  test('serviceadded does not break the page', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('serviceadded')));
    await expect
      .poll(() => page.evaluate(() => window.__gpuPresented === true), {
        timeout: 30000,
      })
      .toBe(true);
    await expect(page.locator('[data-testid="service-grid"]')).toBeVisible();
  });
});
```

DOM + marker only, no pixel-diff. Runs on desktop + mobile (WebGL2 headless).

- [ ] **Step 4: Full gates + Step 5: Commit**

`node --check`, `cargo test` (full), `cargo clippy -- -D warnings`, `cargo fmt --check`, release rebuild, `CI= npx playwright test specs/gpu-ambient.spec.js`, then FULL `CI= npx playwright test`.

```bash
git add assets/js/gpu/particles.js assets/js/app.js e2e/specs/gpu-ambient.spec.js
git commit -m "feat(gl): drifting motes and scan ripple"
```

---

## Self-Review

1. **Spec coverage:** foundation → T1; background → T2; tilt+glow → T3; motes+ripple → T4; Ruling 6 (WebGL2-only, no secure-context dependency) throughout; a11y gates, silent fallback, no pixel-diff, header exclusion all specified.
2. **Placeholder scan:** every step carries exact code/commands/expectations. The Step-1 draft in Task 4 is explicitly superseded in the same step by the corrected imports + `drawArraysInstanced` form — the file ships the corrected form.
3. **Type consistency:** uniforms object fields match GLSL `u_*` names via `applyUniforms`/`getUniformLocs` in all three programs; pass signature `(gl, dt)` identical in context/background/particles; `getGlowApi()` null-until-ready with catch-nulling in both init paths.
