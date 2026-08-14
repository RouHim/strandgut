# Single Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the light theme and its toggle entirely; the Strandgut app always renders dark, ignoring OS `prefers-color-scheme` and any stored `localStorage` theme value.

**Architecture:** Delete the toggle UI, the `theme.js` module, and the `data-theme` attribute machinery. Collapse every `light-dark(<light>, <dark>)` token to its dark value and hoist the `[data-theme="dark"]` overrides into `:root` defaults. Delete all `[data-theme=...]` selectors and `prefers-color-scheme` media queries from the stylesheets. Replace the theme e2e spec with dark-only contract tests, one per removal stage (TDD red/green).

**Tech Stack:** Rust (hyper, `include_bytes!` assets), Vanilla JS ES modules, CSS custom properties, Playwright e2e (desktop + Pixel 5 projects).

**Spec:** Approved design from session 2026-08-14 (bounded change, no spec file): "Single dark theme (forced dark, toggle removed) — app always renders dark; OS preference and stored theme values are ignored; no `data-theme` attribute anywhere. A11y blocks (reduced-transparency, forced-colors, print) stay, dark-only."

## Global Constraints

- Zero-warning gate: `cargo clippy -- -D warnings` and `cargo build` must produce 0 warnings; `cargo fmt --check` must pass (CI-enforced).
- No `unwrap()` in production code; no `anyhow`.
- Assets are embedded at compile time (`include_bytes!`). CSS/JS/HTML edits only take effect after a binary rebuild; a running dev server must be restarted to pick up asset changes.
- Local Playwright: the harness shell exports `CI=1`, which makes `reuseExistingServer` false and errors "url is already used" if a server is running. Two clean modes:
  - No server running: `CI=1 npx playwright test ...` — the config's webServer runs `cargo run --release` (incremental rebuild after the first `cargo build --release`).
  - Server already running on 13569: `CI= STRANDGUT_NO_WEBSERVER=1 npx playwright test ...`.
  - Pre-build `cargo build --release` before any `CI=1 npx playwright test` run (cold release build ~55-90s exceeds the 60s webServer timeout).
- `node --check` on every modified `.js` / `.mjs` file.
- Conventional commits. Use `refactor(ui): ...` prefixes for these tasks (no semantic-release bump is wanted for a removal).
- Do not touch unrelated files. `config.toml` is untracked local state; never commit it.
- Known flake: `scan::tests::test_follows_301_redirect` is a pre-existing timing race; a failure there is not a blocker.

---

### Task 1: Remove the theme toggle UI and `theme.js`

**Files:**
- Modify: `e2e/specs/theme.spec.js` (full rewrite)
- Modify: `assets/index.html` (delete head FOWT script, toggle button, theme.js script tag; change `color-scheme` meta)
- Delete: `assets/js/theme.js`
- Modify: `src/spa.rs` (remove the `js/theme.js` include entry)

**Interfaces:**
- Consumes: nothing.
- Produces: `e2e/specs/theme.spec.js` — new dark-only spec that Task 2 extends. Task 2 relies on the test names and helper `canvasToken(page)` below.

- [ ] **Step 1: Rewrite `e2e/specs/theme.spec.js` with the toggle-removal contract test**

Replace the entire file content (all 10 old tests) with:

```js
import { test, expect } from '@playwright/test';

test('theme toggle is removed from the header', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#theme-toggle')).toHaveCount(0);
  await expect(page.locator('.theme-icon-sun, .theme-icon-moon')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the spec and verify it fails**

Run (no server running): `CI=1 npx playwright test theme.spec.js`
Expected: FAIL — `#theme-toggle` has count 1 (the button still exists in `index.html`).

- [ ] **Step 3: Delete the theme-toggle button from `assets/index.html`**

Delete this exact block (currently lines 44-55, between the Add button `</button>` and the edit pill-switch `</button>`):

```html
      <button id="theme-toggle" class="btn btn-ghost" role="switch" aria-label="Switch to light theme" aria-checked="false">
      <svg class="theme-icon-sun" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
      <svg class="theme-icon-moon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>
```

- [ ] **Step 4: Delete the FOWT inline script from `assets/index.html` `<head>`**

Delete this exact block (currently lines 5-15, before `<meta charset="utf-8">`):

```html
  <script>
    (function(){
      try{
        var s=localStorage.getItem('theme');
        var d=window.matchMedia('(prefers-color-scheme:dark)').matches;
        var t=(s==='light'||s==='dark')?s:(d?'dark':'light');
        document.documentElement.setAttribute('data-theme',t);
      }catch(e){
        document.documentElement.setAttribute('data-theme','dark');
      }
    })();
  </script>
```

- [ ] **Step 5: Change the `color-scheme` meta to dark-only**

In `assets/index.html`:

```html
  <meta name="color-scheme" content="light dark">
```

becomes:

```html
  <meta name="color-scheme" content="dark">
```

- [ ] **Step 6: Delete the `theme.js` script tag from `assets/index.html`**

Delete this line:

```html
  <script type="module" src="/assets/js/theme.js?v=0.2.0"></script>
```

- [ ] **Step 7: Delete `assets/js/theme.js`**

Run: `git rm assets/js/theme.js`
Expected: file removed.

- [ ] **Step 8: Remove the `js/theme.js` entry from `src/spa.rs`**

Delete this line from `get_asset()` in `src/spa.rs`:

```rust
        "js/theme.js" => include_bytes!("../assets/js/theme.js"),
```

- [ ] **Step 9: Rebuild and verify the spec passes**

Run: `cargo build --release` (webServer needs the fresh binary), then with no server running:
`CI=1 npx playwright test theme.spec.js`
Expected: PASS (1 test).

- [ ] **Step 10: Rust gates**

Run: `cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: all unit tests pass (93), clippy clean, fmt clean.

- [ ] **Step 11: Commit**

```bash
git add e2e/specs/theme.spec.js assets/index.html src/spa.rs
git commit -m "refactor(ui): remove light theme toggle button and theme.js"
```
(`git rm assets/js/theme.js` in Step 7 already staged the deletion.)

---

### Task 2: Collapse tokens.css to dark-only

**Files:**
- Modify: `assets/css/tokens.css`
- Test: `e2e/specs/theme.spec.js` (extend)

**Interfaces:**
- Consumes: Task 1's spec file and the running contract that no `data-theme` attribute is ever set.
- Produces: `:root` semantic tokens with fixed dark values (no `light-dark()` anywhere) and `color-scheme: dark`. Later tasks and the spec read `--color-surface-canvas` = `#0a1628` and `html` background = `rgb(26, 26, 46)`.

- [ ] **Step 1: Extend `e2e/specs/theme.spec.js` with dark-render contract tests**

Append to the file (keep the Task 1 test):

```js
const DARK_CANVAS = '#0a1628';
const DARK_HTML_BG = 'rgb(26, 26, 46)'; // #1a1a2e

async function canvasToken(page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-surface-canvas')
      .trim()
  );
}

test('app renders dark regardless of OS color scheme', async ({ page }) => {
  for (const colorScheme of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');

    // No script sets a data-theme attribute anymore
    expect(
      await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))
    ).toBe(false);

    // Dark tokens are the only values under both schemes
    expect(await canvasToken(page)).toBe(DARK_CANVAS);

    // Dark page background under both schemes
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).backgroundColor
    );
    expect(bg).toBe(DARK_HTML_BG);
  }
});

test('stored light theme preference is ignored', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload();

  expect(
    await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))
  ).toBe(false);
  expect(await canvasToken(page)).toBe(DARK_CANVAS);
});
```

- [ ] **Step 2: Run the spec and verify the new tests fail**

Run (no server running): `CI=1 npx playwright test theme.spec.js`
Expected: FAIL — `tokens.css` still uses `light-dark()`, and Playwright's default `colorScheme` is light, so `--color-surface-canvas` resolves to `#f2ede4` instead of `#0a1628`. (The Task 1 test still passes.)

- [ ] **Step 3: Set `color-scheme: dark` on `:root`**

In `assets/css/tokens.css`:

```css
:root {
  color-scheme: light dark;
```

becomes:

```css
:root {
  color-scheme: dark;
```

- [ ] **Step 4: Replace the semantic token block with fixed dark values**

In `assets/css/tokens.css`, replace everything from this comment:

```css
  /* ──────────────────────────────────────────────
     Layer 2: Semantic — Light (default)
     light-dark() provides automatic system-preference theming
     ────────────────────────────────────────────── */
```

through the line `--color-accent-ring:  light-dark(rgba(244, 163, 64, 0.28), rgba(244, 163, 64, 0.3));` (the end of the `:root` block) with:

```css
  /* ──────────────────────────────────────────────
     Layer 2: Semantic — Dark (single theme)
     Values are fixed; the light theme is removed
     ────────────────────────────────────────────── */

  /* Surface hierarchy */
  --color-surface-canvas: #0a1628;
  --color-surface:        rgba(232, 224, 216, 0.07);
  --color-surface-elevated: rgba(13, 28, 38, 0.9);

  /* Text hierarchy */
  --color-text-primary:   #e8e0d8;
  --color-text-secondary: #8b8078;

  /* Accent & status — theme-invariant */
  --color-accent: #f4a340;
  --color-success: #6baf92;
  --color-danger: #c4746e;

  /* Borders */
  --color-border:        rgba(255, 255, 255, 0.12);

  /* Glassmorphism recipe */
  --color-glass-bg:       rgba(232, 224, 216, 0.07);
  --color-glass-bg-hover: rgba(232, 224, 216, 0.12);
  --color-glass-border:   rgba(255, 255, 255, 0.12);
  --color-glass-highlight: rgba(255, 255, 255, 0.1);
  --color-glass-shadow:   0 12px 40px -8px rgba(0, 8, 16, 0.5);
  --shadow-tile-hover:    0 16px 48px -8px rgba(0, 8, 16, 0.6);

  /* Legacy aliases (backward compatibility) */
  --color-text: #e8e0d8;

  /* Component-specific tokens */
  --color-header-bg:     rgba(10, 22, 40, 0.55);
  --color-surface-hover: rgba(232, 224, 216, 0.12);
  --color-surface-raised: rgba(13, 28, 38, 0.88);
  --color-button-primary-text: #0a1628;
  --color-accent-hover: #f5b04a;
  --color-accent-glow:  rgba(244, 163, 64, 0.4);
  --color-overlay-bg:   rgba(4, 10, 18, 0.6);
  --color-accent-ring:  rgba(244, 163, 64, 0.3);
```

Note: every dark value above is copied verbatim from the existing `[data-theme="dark"]` block — do not invent values.

- [ ] **Step 5: Delete the `[data-theme="dark"]` override block**

In `assets/css/tokens.css`, delete this entire block (its values now live in `:root`):

```css
/* ═════════════════════════════════════════════════════════════════
   Layer 2: Semantic — Dark (explicit attribute override)
   ═════════════════════════════════════════════════════════════════ */
[data-theme="dark"] {
  --color-surface-canvas: #0a1628;
  --color-surface: rgba(232, 224, 216, 0.07);
  --color-surface-elevated: rgba(13, 28, 38, 0.9);

  --color-text-primary: #e8e0d8;
  --color-text-secondary: #8b8078;

  --color-border: rgba(255, 255, 255, 0.12);

  --color-glass-bg: rgba(232, 224, 216, 0.07);
  --color-glass-bg-hover: rgba(232, 224, 216, 0.12);
  --color-glass-border: rgba(255, 255, 255, 0.12);
  --color-glass-highlight: rgba(255, 255, 255, 0.1);
  --color-glass-shadow: 0 12px 40px -8px rgba(0, 8, 16, 0.5);
  --shadow-tile-hover: 0 16px 48px -8px rgba(0, 8, 16, 0.6);
  --color-accent-ring: rgba(244, 163, 64, 0.3);
  --color-overlay-bg: rgba(4, 10, 18, 0.6);

  /* Legacy aliases (backward compatibility) */
  --color-text: #e8e0d8;

  /* Component-specific */
  --color-header-bg:     rgba(10, 22, 40, 0.55);
  --color-surface-hover: rgba(232, 224, 216, 0.12);
  --color-surface-raised: rgba(13, 28, 38, 0.88);
}
```

- [ ] **Step 6: Update the file-header architecture comment**

In `assets/css/tokens.css`:

```css
     Layer 2 — Semantic     : Purpose-bound tokens, light (default) + dark override
```

becomes:

```css
     Layer 2 — Semantic     : Purpose-bound tokens, dark (single theme)
```

and:

```css
   Layer 1: Primitives + Layer 2: Semantic Light (default)
```

becomes:

```css
   Layer 1: Primitives + Layer 2: Semantic Dark (single theme)
```

- [ ] **Step 7: Rebuild and verify the spec passes**

Run: `cargo build --release`, then (no server running): `CI=1 npx playwright test theme.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 8: Verify no `light-dark()` remains in CSS**

Run: `grep -rn "light-dark" assets/css`
Expected: no matches.

- [ ] **Step 9: Rust gates**

Run: `cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add assets/css/tokens.css e2e/specs/theme.spec.js
git commit -m "refactor(ui): collapse design tokens to fixed dark values"
```

---

### Task 3: Collapse themes.css to dark-only

**Files:**
- Modify: `assets/css/themes.css`

**Interfaces:**
- Consumes: Task 1 (no `data-theme` attribute ever set) and Task 2 (`:root` dark tokens, `color-scheme: dark`).
- Produces: stylesheet with only dark rules — default `html` background, an unscoped `body::before` noise overlay, and the existing reduced-transparency / forced-colors / print a11y blocks.

- [ ] **Step 1: Update the file-header comment**

In `assets/css/themes.css`:

```css
/* Strandgut — Theme Switching & Accessibility */
/* Light/dark themes, a11y media queries, print styles */
```

becomes:

```css
/* Strandgut — Theme & Accessibility */
/* Single dark theme, a11y media queries, print styles */
```

- [ ] **Step 2: Promote the noise overlay and delete the OS-preference media query**

In `assets/css/themes.css`, delete this block:

```css
/* ─── Dark Theme via OS Preference ───
     Applies when no data-theme attribute is present and OS prefers dark. */
@media (prefers-color-scheme: dark) {
  html {
    background-color: #1a1a2e;
    background-image: linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55));
  }

  body::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    opacity: 0.03;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    background-repeat: repeat;
    background-size: 256px 256px;
  }
}
```

and replace it with the same `body::before` rule, unscoped, under a new comment:

```css
/* ─── Grain Noise Overlay ───
     Always on: the light theme that hid it is gone. */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  opacity: 0.03;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
}
```

- [ ] **Step 3: Delete the `[data-theme="dark"]` blocks**

In `assets/css/themes.css`, delete this entire section (comment, empty token block, `html` override, and `body::before` override — the unscoped rules from Step 2 and the default `html` background now cover it):

```css
/* ─── Dark Theme via Manual Override ───
     Same as above but with higher specificity than the media query,
     so manually selecting dark mode overrides the OS preference. */
[data-theme="dark"] {
  /* Dark tokens are already the default in :root (tokens.css) — no redefinition needed */
}

[data-theme="dark"] html {
  background-color: #1a1a2e;
  background-image: linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55));
}

[data-theme="dark"] body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  opacity: 0.03;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
}
```

- [ ] **Step 4: Delete the `[data-theme="light"]` token and background overrides**

In `assets/css/themes.css`, delete this entire section (light token overrides, light `html` background, and the light `body::before` hide):

```css
/* ─── Light Theme via Manual Override ───
     Lighter gradient overlay lets the beach colors show through.
     Noise is hidden in light mode. */
[data-theme="light"] {
  /* Semantic token overrides for light mode */
  --color-surface-canvas: #f2ede4;
  --color-surface: rgba(255, 255, 255, 0.55);
  --color-surface-elevated: rgba(255, 255, 255, 0.9);
  --color-text-primary: #2c2420;
  --color-text-secondary: #8a7e76;
  --color-accent: #d4862c;
  --color-success: #5a9a7a;
  --color-danger: #b05a54;
  --color-border: rgba(44, 36, 32, 0.12);
  --color-glass-bg: rgba(255, 255, 255, 0.5);
  --color-glass-bg-hover: rgba(255, 255, 255, 0.72);
  --color-glass-border: rgba(255, 255, 255, 0.65);
  --color-glass-highlight: rgba(255, 255, 255, 0.9);
  --color-glass-shadow: 0 12px 32px -8px rgba(80, 50, 20, 0.22);
  --shadow-tile-hover: 0 16px 48px -8px rgba(80, 50, 20, 0.28);
  --color-accent-ring: rgba(244, 163, 64, 0.28);

  /* Legacy tokens for backward compatibility with style.css */
  --color-text: #2c2420;
  --color-text-secondary: #8a7e76;

  /* Component-specific */
  --color-header-bg:     rgba(250, 246, 238, 0.6);
  --color-surface-hover: rgba(0, 0, 0, 0.06);
  --color-surface-raised: rgba(255, 255, 255, 0.85);
  --color-overlay-bg: rgba(70, 50, 30, 0.35);
}

[data-theme="light"] html {
  background-color: #e8ddd0;
  background-image: linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.25));
}

[data-theme="light"] body::before {
  display: none;
}
```

- [ ] **Step 5: Delete the theme-icon visibility rules**

In `assets/css/themes.css`, delete this entire section:

```css
/* ─── Theme Toggle Icon Visibility ───
     .theme-icon-sun  → visible in dark mode (click to switch to light)
     .theme-icon-moon → visible in light mode (click to switch to dark) */
.theme-icon-sun {
  display: inline-block;
}

.theme-icon-moon {
  display: none;
}

[data-theme="dark"] .theme-icon-sun {
  display: inline-block;
}

[data-theme="dark"] .theme-icon-moon {
  display: none;
}

[data-theme="light"] .theme-icon-sun {
  display: none;
}

[data-theme="light"] .theme-icon-moon {
  display: inline-block;
}
```

- [ ] **Step 6: Delete the light static/dynamic background variants**

In `assets/css/themes.css`, delete these two rules:

```css
[data-theme="light"] .static-background {
  background-image: linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2)), url('/assets/img/background.webp');
}
```

and:

```css
[data-theme="light"] .dynamic-background {
  background-image: linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2)), var(--bg-photo-url, url('/assets/img/background.webp'));
}
```

- [ ] **Step 7: Drop `[class*="theme-icon"]` from the print rules**

In `assets/css/themes.css`, inside `@media print`, change:

```css
  [class*="theme-icon"],
  .btn,
  .edit-controls,
  .pill-switch {
```

to:

```css
  .btn,
  .edit-controls,
  .pill-switch {
```

- [ ] **Step 8: Verify no theme machinery remains in CSS**

Run:
```bash
grep -rn "data-theme" assets/css
grep -rn "theme-icon" assets/css
grep -rn "prefers-color-scheme" assets/css
```
Expected: no matches from any of the three.

- [ ] **Step 9: Rebuild and run the theme spec**

Run: `cargo build --release`, then (no server running): `CI=1 npx playwright test theme.spec.js`
Expected: PASS (3 tests).

- [ ] **Step 10: Rust gates**

Run: `cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add assets/css/themes.css
git commit -m "refactor(ui): remove light theme styles and theme selectors from themes.css"
```

---

### Task 4: Clean up the manual QA script and AGENTS.md

**Files:**
- Modify: `e2e/qa-pill-switch-v2.mjs` (manual QA script, not CI-run; remove theme references)
- Modify: `AGENTS.md` (convention and structure lines)

**Interfaces:**
- Consumes: Task 1 (no `#theme-toggle` exists).
- Produces: repo with zero remaining references to `theme-toggle`, `theme.js`, or `data-theme` outside git history and the plan doc.

- [ ] **Step 1: Remove `THEME_SEL` / `themeBtn` from `e2e/qa-pill-switch-v2.mjs`**

Delete these lines:

```js
    const THEME_SEL = '#theme-toggle';
    const themeBtn = page.locator(THEME_SEL);
```

- [ ] **Step 2: Remove the "Force dark theme" prelude**

Delete this block near the top of the `try` block:

```js
    // Force dark theme
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(200);
```

- [ ] **Step 3: Delete SCENARIO 6 (theme switching while editing)**

Delete the entire `SCENARIO 6: Theme switching while in edit mode` section, from the comment banner:

```js
    // ============================================================
    // SCENARIO 6: Theme switching while in edit mode
    // ============================================================
```

through its closing:

```js
    await screenshot(page, 'qa-s6-light-edit-mode.png');
```

(This removes the light/dark `data-theme` setAttribute calls and both `s_fail`/`e_test` theme assertions inside.)

- [ ] **Step 4: Drop the `data-theme` call from the screenshot section**

In the `SCREENSHOTS: Dark theme ON vs OFF` block, inside the OFF `page.evaluate`, delete this line:

```js
      document.documentElement.setAttribute('data-theme', 'dark');
```

Keep the rest of the screenshot section (edit-mode ON/OFF screenshots) unchanged.

- [ ] **Step 5: Delete integration check I2 (theme toggle present)**

Delete this block:

```js
    // I2: Theme toggle still present and separate
    await (async () => {
      const ttVis = await themeBtn.isVisible();
      if (!ttVis) return i_fail('Theme toggle visibility', 'not visible');
      i_pass('Theme toggle still present and functional');
    })();
```

- [ ] **Step 6: Verify the script still parses**

Run: `node --check e2e/qa-pill-switch-v2.mjs`
Expected: no output (syntax OK).

- [ ] **Step 7: Update `AGENTS.md` conventions**

- Change the ID example (line ~134) so it does not reference the removed toggle:

```md
- IDs: `kebab-case` (e.g., `theme-toggle`)
```

becomes:

```md
- IDs: `kebab-case` (e.g., `add-button`)
```

- Change the theme convention line (~142):

```md
- `data-theme="dark"` / `data-theme="light"` on `<html>` for theme switching
```

becomes:

```md
- Single dark theme: no `data-theme` attribute and no theme toggle (light theme removed)
```

- In the project structure listing, delete the `theme.js` line:

```md
    theme.js        # Dark/light theme toggle
```

- [ ] **Step 8: Verify no stale references remain**

Run:
```bash
grep -rn "theme-toggle\|theme-icon\|light-dark\|js/theme.js" assets e2e src AGENTS.md
```
Expected: no matches.

- [ ] **Step 9: Commit**

```bash
git add e2e/qa-pill-switch-v2.mjs AGENTS.md
git commit -m "refactor(ui): drop theme references from QA script and AGENTS.md"
```

---

### Task 5: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Rust gates**

Run: `cargo test && cargo clippy -- -D warnings && cargo fmt --check`
Expected: all unit tests pass, clippy clean, fmt clean. (If only `scan::tests::test_follows_301_redirect` fails, it is the known pre-existing flake — rerun it alone; not a blocker.)

- [ ] **Step 2: JS syntax check**

Run: `node --check e2e/specs/theme.spec.js && node --check e2e/qa-pill-switch-v2.mjs`
Expected: no output.

- [ ] **Step 3: Full Playwright suite**

Run: `cargo build --release`, then (no server running): `CI=1 npx playwright test`
Expected: all specs pass in both the desktop and mobile (Pixel 5) projects; theme.spec.js contributes its 3 new tests and the old toggle tests are gone.

- [ ] **Step 4: Visual smoke test**

Start the server (`cargo run --release` on 13569) and drive a real browser to `http://localhost:13569`:
1. Default (light OS emulation, fresh profile): header has no theme toggle, page renders dark, `#theme-toggle` count is 0.
2. Emulate `colorScheme: light` and reload: page still renders dark.
3. Emulate `colorScheme: dark` and reload: page still renders dark.
4. Take a screenshot of the header and one of the full page in dark mode for the record.

Expected: identical dark rendering in all three cases; no toggle button.

- [ ] **Step 5: Confirm the final diff is theme-scoped**

Run: `git log --oneline -4 && git diff main...HEAD --stat 2>/dev/null || true`
Expected: the four commits from Tasks 1-4; changed files are exactly `e2e/specs/theme.spec.js`, `assets/index.html`, `assets/js/theme.js` (deleted), `src/spa.rs`, `assets/css/tokens.css`, `assets/css/themes.css`, `e2e/qa-pill-switch-v2.mjs`, `AGENTS.md`, and this plan file.
