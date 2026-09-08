# WebGPU Ambient Visuals — Design

Date: 2026-09-08
Status: approved 2026-09-08, ready for implementation planning
Path: architectural (new rendering subsystem, no existing flow to tweak)

## Goal

Add subtle WebGPU-driven fanciness to the Strandgut LAN dashboard without
weakening its minimalist feel, offline ability, or low-maintenance profile.
Ship as three stacked, independently revertible PRs on one shared foundation.

## Decisions (from brainstorming)

- Surfaces: PR1 animated background, PR2 interactive tiles, PR3 ambient polish.
- Fallback: auto-degrade silently. No UI toggle, no `config.toml` field.
- Intensity: subtle ambient. Existing dark overlay and legibility unchanged.
- Approach: raw WebGPU + inline WGSL, no 3D lib, no WebGL fallback (YAGNI).

## Non-goals

- No WebGL2 backend, no three.js/babylon, no CDN dependency (offline LAN).
- No backend endpoint, no config schema change, no theme change.
- No pixel-diff screenshot tests on shader output.

## Architecture

One fixed full-viewport canvas behind content, one shared GPU module.
WGSL lives as inline template strings in JS modules, not separate files.

```
index.html              assets/js/gpu/            effect (PR)
+ canvas#gpu-canvas  -> detect.js (gate)      -> background (PR1)
  (pointer-events:      context.js (device,       glow via uniform (PR2)
   none, below grid)    half-res, pause,         particles (PR3)
                        teardown)
```

- Canvas sits between the `background.webp` layer and the tile grid.
- If init fails at any point, the canvas is never inserted (or is removed).
  The page is then pixel-identical to today.
- `src/spa.rs` `get_asset()` needs one match arm per new JS file (explicit
  registry): `detect.js`, `context.js`, `uniforms.js`, `background.js`,
  `tiles.js`, `particles.js`. MIME detection already covers `.js`. No other
  Rust change; binary stays <5MB.

## Shared foundation (§1)

- `assets/js/gpu/detect.js`: gate. Returns false when `navigator.gpu`
  is missing OR `prefers-reduced-motion` / `prefers-reduced-transparency` /
  `forced-colors: active` match. Single function, no UI.
- `assets/js/gpu/context.js`: owns adapter (`powerPreference: "low-power"`),
  device, canvas configuration, half-res sizing (render ~0.5x, CSS upscale),
  `visibilitychange` pause, `device.lost` teardown. Uniform buffers allocated
  once and reused; no per-frame allocations.
- `index.html` untouched: `initGpuCanvas()` creates the canvas (with `data-testid="gpu-canvas"`) only after gate + device succeed, inserting it before `<main>`.
- One CSS rule for canvas placement + print hiding.

## PR slices (§2)

PR1 — living background (`gpu/background.js`, new, WGSL inline):
- Fullscreen pass: 2-3 slow sine-warped color stops from the existing dark
  palette plus hash-based film grain. ~30s loop. Renders under the dark
  overlay. E2E: canvas absent without WebGPU; layout unchanged with it.

PR2 — tactile tiles (no new shader):
- Tiles stay DOM. Pointer position feeds a uniform; the shared canvas paints
  a soft radial glow behind the hovered tile. Tile itself gets a CSS
  `transform: perspective` tilt (keeps the GPU-composited-only rule).
  Fallback: today's static tiles; hover works with canvas disabled.

PR3 — ambient polish (`gpu/particles.js`, new, WGSL inline):
- Scan progress emits a one-shot ripple uniform; drag lift reuses the tile
  transform; 40-60 instanced quads drift as dust motes (single draw,
  alpha <0.08) on the same canvas. Fallback: today's CSS
  `wash-ashore` / `dialog-in` only.

## Guards (§3)

- Accessibility: gate covers reduced-motion, reduced-transparency,
  forced-colors. Print hides canvas. Overlay stays on top; contrast unchanged.
- Performance: low-power adapter, DPR cap 1, 0.5x render + upscale, one
  fullscreen pass + one instanced draw max, pause when hidden.
- Errors: null adapter/device, lost device, or WGSL validation failure all
  resolve to silent fallback (log + remove canvas). Never user-facing, never
  blocks grid render. No new `AppError` path (frontend-only).
- Testing: `node --check` for new modules. Rust touch is `get_asset` arms
  only, covered by extending `test_assets_embedded`. Playwright: default project
  asserts graceful absence (no canvas, grid identical); opt-in WebGPU project with
  SwiftShader flags asserts one presented frame. DOM/layout asserts only, no
  shader pixel-diff. Verify CSS with a fresh tab (headless cache gotcha).
- Rollout: PR1 foundation first, PR2 and PR3 stack on it. Each revertible by
  removing its shader wiring. No migration.

## Files touched (expected)

- New: `assets/js/gpu/detect.js`, `assets/js/gpu/context.js`,
  `assets/js/gpu/uniforms.js` (shared uniform buffer: time, size, glow,
  ripple), `assets/js/gpu/background.js` (PR1, WGSL inline),
  `assets/js/gpu/tiles.js` (PR2, DOM tilt + glow uniform),
  `assets/js/gpu/particles.js` (PR3, WGSL inline).
- Edit: `assets/index.html` (canvas), `assets/css/themes.css` (placement +
  print), `src/spa.rs` (`get_asset` arms + `test_assets_embedded` asserts),
  `assets/js/app.js` (init call), `assets/js/grid.js` or tile CSS (PR2 tilt),
  `e2e/playwright.config.ts` + `e2e/specs/gpu-ambient.spec.js` (opt-in WebGPU
  project). PR3 needs no `scan.js` change: it listens to `serviceadded`.
- Untouched: `config.toml`, themes, i18n, `src/` error paths.

## Pivot 2026-09-08: WebGL2-only (Ruling 6)

- Constraint: the app only ever serves plain HTTP on home networks, and
  browsers gate `navigator.gpu` to secure contexts. WebGPU can never activate
  for LAN-IP clients (localhost exempt). Proven on Waterfox/Firefox 153 with a
  working RADV adapter: `'gpu' in navigator === false` on the LAN URL.
- Decision: WebGL2-only. WebGL2 has no secure-context requirement and is
  universally present (same Waterfox: full WebGL2 on Mesa). Same effects, same
  architecture, GLSL ES 3.00 mirrors of the WGSL shaders. No HTTPS, no per-client
  flags, no WebGL fallback chain (WebGL2 required, silent fallback otherwise).
- Consequences: no `webgpu` e2e project or SwiftShader flags (headless Chromium
  does WebGL2 by default); the `test.use reducedMotion` fixture defect is moot
  for new tests (in-body `emulateMedia` everywhere); PR #14 (WebGPU) closed
  unmerged in favor of `feature/webgl-ambient`.
