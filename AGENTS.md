# AGENTS.md - Strandgut

Guidelines for AI agents working in this codebase.

## Project Overview

Strandgut is a minimalist LAN service scanner dashboard. A single-binary Rust backend serves a
Vanilla JS SPA, with all static assets embedded at compile time via `include_bytes!`. It scans your
local network for open ports, fingerprints common services (Home Assistant, Proxmox, Pi-hole,
etc.), and presents them as a configurable grid of service cards.

## Tech Stack

- **Backend**: Rust (hyper HTTP server, tokio async runtime, matchit router)
- **Frontend**: Vanilla JavaScript (ES modules), HTML, CSS
- **Configuration**: TOML file (`config.toml` or path via `STRANDGUT_CONFIG` env var)
- **Static embedding**: `include_bytes!` (assets compiled into binary)
- **Internationalisation**: Embedded JS locale bundles (`en`, `de`)

## Build & Run Commands

```bash
# Development
cargo run                          # Run server at 0.0.0.0:13569
cargo build                        # Debug build
cargo build --release              # Release build (< 5MB self-contained)

# Code Quality
cargo fmt                          # Format Rust code
cargo clippy -- -D warnings        # Lint with warnings as errors
cargo test                         # Run unit tests
```

## Test Commands

### Rust Unit Tests

```bash
cargo test                                    # Run all tests
cargo test routes::tests::test_health_endpoint # Run single test by path
cargo test scan::tests::                       # Run tests in module
cargo test -- --nocapture                     # Show println! output
```

### JS Unit Tests (`node --test`)

```bash
node --test tests/js                          # Run DOM-free frontend tests
node --test tests/js/store.test.js            # Run one suite
```

These cover the config store and scan-session protocol. Browser behaviour stays in Playwright.

### E2E Tests (Playwright, `e2e/`)

```bash
cd e2e && npm ci && npx playwright install chromium
npm test
```

Specs import `test`/`expect` from `../support/app.js`. That fixture resets the server config
after every test (including request-only tests) and fails the test on uncaught page errors, so
spec files no longer depend on execution order. `app.js` sets
`document.documentElement.dataset.appReady = "true"` after its first init pass; use the fixture's
`waitForApp`/`gotoApp` instead of ad-hoc readiness selectors. Use `seedConfig`, `service`, and
`stubScan` instead of copying setup. `page.waitForLoadState('networkidle')` is unreliable here:
tile icons are fetched from external CDNs, so the browser may stay non-idle for a long time.
Manual QA scripts and reference screenshots live under `e2e/manual/` and `e2e/reference/`,
outside the default `testDir`.

## Project Structure

```
src/
  main.rs           # Entry point, TCP listener, graceful shutdown, AppState
  routes.rs         # HTTP route table (matchit), request dispatch, handlers
  store.rs          # ConfigStore: config path, load/save, cache root, write canary
  config.rs         # TOML config schema
  error.rs          # AppError enum, HTTP status mapping, JSON error bodies
  scan.rs           # Scan session: async port scanner, SSE events, service fingerprinting
  spa.rs            # Embedded asset serving (include_bytes!), SPA fallback
  status.rs         # Reachability probe for the tiles (GET /api/status)
  icons.rs          # Runtime icon search with a file cache
  background.rs     # Pexels rotation: state machine, cache, credit sidecar
assets/
  index.html        # SPA shell
  js/               # Frontend modules (ES modules)
    app.js          # Composition root: store wiring, onboarding, redraw path
    api.js          # HTTP API wrappers (fetch)
    store.js        # Config snapshot, service placement, dirty state, saves
    scan-session.js # Scan request, SSE transport, frame parsing, status
    i18n.js         # Language detection, t(), applyTranslations()
    overlay.js      # Modal session: focus, inert, scroll, Escape, backdrop, stack
    state.js        # UI-only state: edit mode and page-load statuses
    grid.js         # Service grid rendering
    drag.js         # Drag-and-drop for service cards
    edit.js         # Edit mode controls and add/edit panel
    add-dialog.js   # "Add service" modal dialog
    scan.js         # Scan dialog view (DOM only; protocol lives in scan-session.js)
    i18n/
      en.js         # English translations
      de.js         # German translations
  css/              # Stylesheets
    style.css       # Main stylesheet (imports others)
    reset.css       # CSS reset
    tokens.css      # Design tokens (colours, spacing)
    themes.css      # Theme variables (single dark theme)
    layout.css      # Grid and layout
    components.css  # Buttons, cards, dialogs
    animations.css  # Transitions and keyframes
  img/              # Images and icons
tests/
  js/               # Node --test suites for DOM-free frontend modules
e2e/
  specs/            # Playwright specs (default testDir)
  support/app.js    # Shared fixture: reset, readiness, seed, stubs, page errors
  manual/           # Manual QA scripts, outside the default testDir
  reference/        # Reference screenshots, outside the default testDir
```

## Rust Code Style

### Imports

Group imports in order: `std`, external crates, local modules. Use explicit paths.

```rust
use std::sync::Arc;
use hyper::Request;
use crate::config::Config;
```

### Error Handling

- **No `anyhow`**. Use the custom `AppError` enum defined in `error.rs`.
- Propagate with `?` where `From` impls exist (`toml::de::Error`, `serde_json::Error`, `std::io::Error`).
- Use `.map_err(|e| AppError::Internal(e.to_string()))?` for foreign errors without `From` impls.
- Fire-and-forget pattern for non-critical operations: log error, return `Ok(())`.

### Naming Conventions

- Functions: `snake_case` (e.g., `scan_host`, `serve_asset`)
- Types/Structs: `PascalCase` (e.g., `ScanResult`, `AppState`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `SIMPLE_PORTS`)
- Modules/files: `snake_case`

### Patterns

- Async handlers with `async fn handle_*(...)` naming in `routes.rs`
- `#[derive(Debug, Clone, Serialize, Deserialize)]` on data models
- Manual `Body` implementation for SSE streaming (`SseScanBody` in `scan.rs`)
- Static `matchit::Router` built once via `OnceLock` (see `routes::get_router`)
- `Arc<AppState>` shared across all request handlers

### Type Safety

- **No `unwrap()` in production paths** — use `?` or explicit `match` handling.
- `Option<T>` for nullable config fields (`icon`, `description` on `Service`).
- Explicit `BoxBody` type alias for HTTP responses to avoid generics leaking everywhere.

## Frontend Code Style (JavaScript)

### Patterns

- ES modules with explicit `import`/`export` (no bundler).
- Persisted dashboard state lives in `store.js`; UI-only state (edit mode, statuses) in `state.js`.
- Functions prefixed by purpose: `fetch*`, `render*`, `handle*`, `init*`
- Store subscriptions drive redraw and persistence; window events are only for `editmodechange` and `editservice`.
- Build DOM nodes and assign `textContent`/properties for user values. Never interpolate user values into HTML strings; there is no `escapeHtml` helper.

### DOM Conventions

- IDs: `kebab-case` (e.g., `add-button`)
- Data attributes: `data-testid` for testability, `data-i18n` for translations
- `data-testid` attributes **required** on all user-interactive elements
- `aria-*` attributes for accessibility (screen reader support)

### CSS Conventions

- CSS custom properties (variables) in `tokens.css` and `themes.css`
- Single dark theme: no `data-theme` attribute and no theme toggle (light theme removed)
- Mobile-first responsive design (no framework)

## Configuration

### Schema (`config.toml`)

```toml
title = "Strandgut"
language = "en"
scan_defaults = "simple"

[[services]]
name = "Example"
url = "https://example.com"
icon = "globe"
description = "Optional description"
position = { row = 0, col = 0 }
```

- `scan_defaults`: `"simple"` | `"medium"` | `"deep"`
- `services`: array of service cards displayed on the grid
- Config is loaded/saved as TOML but exposed via REST API as JSON

### Environment Variables

```env
STRANDGUT_CONFIG=./config.toml      # Path to TOML config file
RUST_LOG=info                        # Logging level (env_logger)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/readyz` | Readiness probe |
| GET | `/api/config` | Get current config (JSON) |
| GET | `/api/status` | Reachability of every configured service (one TCP probe per service, parallel, 1 s budget) |
| PUT | `/api/config` | Save config (JSON) |
| POST | `/api/scan` | Start network scan (returns SSE stream immediately) |
| GET | `/api/background/status` | Rotation availability, enabled flag, photo credit; triggers a fetch when due |
| GET | `/api/background/photo` | Cached background JPEG, or 204 |
| GET | `/api/icons/search?q=` | Search the cached icon index |
| GET | `/assets/{*path}` | Static asset serving |
| GET | `/{*path}` | SPA fallback to `index.html` |

### Scan SSE Events

The `/api/scan` endpoint returns `text/event-stream` with:
- `event: progress\ndata: {"scanned":N,"total":M}` — after each chunk (larger scans start at 0)
- `event: found\ndata: <ScanResult JSON>` — for each discovered service
- `event: error\ndata: <code>` — `host_not_found` or a scan-level failure
- `event: done` — when scan completes

The response is returned before the first port is scanned; the producer writes events as it goes.

## Port Scanner

### Scan Depths

- `simple`: Common ports (80, 443, 8080, 8443, 3000, 5000, 8006, 9090, 9443)
- `medium`: Simple + additional ports (81, 4443, 8000-8010, 8888, 9000-9010)
- `deep`: All ports 1-65535

### Service Fingerprinting

HTTP ports trigger a `GET /` request. The `<title>` tag is matched against known services:
- Proxmox, Pi-hole, Synology, Portainer, Home Assistant, Jellyfin, Plex, Nextcloud

## Common Tasks

### Adding a new API endpoint

1. Add variant to `Route` enum in `routes.rs`
2. Register path in `build_router()`
3. Add handler arm in `handle_request()`
4. Add corresponding business logic module if needed

### Adding a new config field

1. Add field to `Config` struct in `config.rs` with `#[serde(default)]` if optional
2. Update `Config::default()` if needed
3. Frontend will automatically receive it via `/api/config`

### Adding a new test

- Add `#[tokio::test]` (async) or `#[test]` (sync) function in the relevant module's `#[cfg(test)]` block
- Use `temp_config_path()` helper pattern from `routes::tests` for filesystem isolation
- Use `TcpListener::bind("127.0.0.1:0")` for ephemeral test servers

## General Conventions

- Keep functions small and single-purpose
- Clean code is prioritized over clever code
  - **KISS principle**
  - **DRY principle**
  - **YAGNI principle**
  - **Readability over brevity**
- **SOLID principles** where applicable
  - Favor composition over inheritance
  - Single responsibility
  - Open/closed principle
- **No `unwrap()` in production code** — explicit error handling only
- **No `#[allow(dead_code)]`** — remove unused code instead
- Before shipping a feature, run `cargo test` and `cargo clippy -- -D warnings`
- Do NOT verify your UI changes via curl, do it with playwright, if you have issues with playwright let the user know
- Develop just musl Linux only, this app only runs in a container

## Learnings

**Store mutations auto-render and auto-save:** `assets/js/store.js` is the mutation seam. Callers use `addService`, `updateService`, `removeService`, `reorderServices`, or `setBackgroundRotate`; the store normalizes `position`, notifies subscribers once, and serialises persistence. `app.js` owns the single redraw path (`renderGrid()` then `renderEditMode()`). Do not call the render functions from `edit.js`, `scan.js`, or `drag.js`, and do not dispatch `configchanged`/`serviceadded`; that double-renders and can leave new tiles without edit controls.

**Edit panel must preserve existing service fields:** When saving edits in `assets/js/edit.js`, the updated service object must spread `...service` to preserve fields not present in the form (notably `position`). The store normalizes positions to array order, but Rust's `Config` struct still requires `position: { row, col }` on save.

**IO errors via `?` route to `AppError::Config`:** The existing `From<std::io::Error>` impl in `src/error.rs` maps `std::io::Error` to `AppError::Config`. `ConfigStore` maps read/parse/write failures explicitly; new IO-heavy modules must do the same or user-facing errors will misleadingly say "configuration error".
**CSS Grid breakpoint layering in `layout.css`:** The `@media (min-width: 900px)` breakpoint overrides `grid-template-columns` on the base `.grid` rule. When editing grid layout, changes to the base rule won't take effect at desktop+ viewports unless the 900px breakpoint is also updated or cleared.

**`justify-self: center` shrink-wraps grid items to content size:** In CSS Grid, `justify-self: center` causes items to size to their intrinsic content width rather than stretching to fill the grid cell. This caused unequal card widths in the service grid — each card's width varied with its text length. Use `width: 100%` with the default `justify-self: stretch` for uniform sizing. If centering is needed, use `justify-content` on the grid container or fixed track sizes instead.
**Headless Chromium caches CSS across tab sessions:** After editing embedded CSS assets and rebuilding the server, the headless browser tab may still serve stale CSS even with `location.reload(true)`. Use `close(all: true)` then a fresh `open` to guarantee the latest assets are loaded. Re-using tab names without a full close will return cached styles.

**Never hardcode a Chromium path in `e2e/`:** `e2e/playwright.config.ts` must not set `launchOptions.executablePath` (e.g. `/usr/bin/chromium`) — that was a machine-specific workaround for one Arch box and breaks every other host (CI installs the bundled browser via `npx playwright install --with-deps chromium`; locally the same cache is used). Both projects rely on `devices['Desktop Chrome']`/`devices['Pixel 5']` which already pin `defaultBrowserType: 'chromium'`. Fix a broken local browser with `npx playwright install chromium`, never by hardcoding a system path.
**Harness shell exports `CI=1`:** The omp shell environment sets `CI=1`, which flips `playwright.config.ts`'s `reuseExistingServer: !process.env.CI` to false and errors with "url is already used" if a dev server is running. Run `CI= npx playwright test ...` locally to reuse the running server (list reporter, no retries), or stop the server and run with `CI=1` for the CI profile.

**Playwright `webServer` times out on clean release builds:** The `e2e/playwright.config.ts` webServer runs `cargo run --release` with a 60s timeout. A clean release build takes ~55-90s. Pre-build with `cargo build --release` before running `CI=true npx playwright test`, or increase the webServer timeout.

**Import order defeats same-specificity overrides:** `style.css` imports `layout.css` BEFORE `components.css`, so `.tile`-level mobile overrides placed in layout.css's `@media (max-width: 599px)` block silently lose the cascade to components.css's base rules. Mobile tile overrides (`.tile`, `.tile-icon`, `.tile-info`, `.tile-title`) live at the END of `components.css` in their own `@media (max-width: 599px)` block.

**Stylesheet `@import` round-trips delay module scripts:** Deferred module scripts wait for pending stylesheets, so `@import "fonts.css"` in `style.css` delayed `app.js` past the `load` event and widened the e2e onboarding-skip race (`isVisible()` → `click()` vs. the async config apply that hides onboarding). Keep `@font-face` rules inlined in `style.css`; spec skip-clicks use a tolerant `click({ timeout: 3000 }).catch(() => {})`.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

## Agent skills

### Issue tracker

Issues live as GitHub issues in `RouHim/strandgut`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
