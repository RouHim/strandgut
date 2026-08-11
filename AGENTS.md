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

## Project Structure

```
src/
  main.rs           # Entry point, TCP listener, graceful shutdown, AppState
  routes.rs         # HTTP route table (matchit), request dispatch, handlers
  config.rs         # TOML config loading/saving (atomic write via .tmp → rename)
  error.rs          # AppError enum, HTTP status mapping, JSON error bodies
  scan.rs           # Async TCP port scanner with SSE streaming, service fingerprinting
  spa.rs            # Embedded asset serving (include_bytes!), SPA fallback
  i18n.rs           # Accept-Language parser, locale detection
assets/
  index.html        # SPA shell
  js/               # Frontend modules (ES modules)
    app.js          # Main app logic, onboarding, event wiring
    api.js          # HTTP API wrappers (fetch)
    state.js        # Global config state, dirty tracking
    grid.js         # Service grid rendering
    drag.js         # Drag-and-drop for service cards
    edit.js         # Edit mode toggle
    add-dialog.js   # "Add service" modal dialog
    scan.js         # Network scan UI + SSE consumer
    theme.js        # Dark/light theme toggle
    i18n/
      en.js         # English translations
      de.js         # German translations
  css/              # Stylesheets
    style.css       # Main stylesheet (imports others)
    reset.css       # CSS reset
    tokens.css      # Design tokens (colours, spacing)
    themes.css      # Dark/light theme variables
    layout.css      # Grid and layout
    components.css  # Buttons, cards, dialogs
    animations.css  # Transitions and keyframes
  img/              # Images and icons
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
- `Option<T>` for nullable config fields (`icon`, `description`, `category` on `Service`).
- Explicit `BoxBody` type alias for HTTP responses to avoid generics leaking everywhere.

## Frontend Code Style (JavaScript)

### Patterns

- ES modules with explicit `import`/`export` (no bundler).
- Global `state` object in `state.js` for application state.
- Functions prefixed by purpose: `fetch*`, `render*`, `handle*`, `init*`
- Custom events for cross-module communication (`serviceadded`, `configsaved`, etc.).
- `escapeHtml()` from `api.js` for all user-provided content in templates.

### DOM Conventions

- IDs: `kebab-case` (e.g., `theme-toggle`)
- Data attributes: `data-testid` for testability, `data-i18n` for translations
- `data-testid` attributes **required** on all user-interactive elements
- `aria-*` attributes for accessibility (screen reader support)

### CSS Conventions

- CSS custom properties (variables) in `tokens.css` and `themes.css`
- `data-theme="dark"` / `data-theme="light"` on `<html>` for theme switching
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
category = "Tools"
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
| PUT | `/api/config` | Save config (JSON) |
| POST | `/api/scan` | Start network scan (returns SSE stream) |
| GET | `/assets/{*path}` | Static asset serving |
| GET | `/{*path}` | SPA fallback to `index.html` |

### Scan SSE Events

The `/api/scan` endpoint returns `text/event-stream` with:
- `event: found\ndata: <ScanResult JSON>` — for each discovered service
- `event: done` — when scan completes

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

**State mutations don't auto-render UI:** Functions in `assets/js/state.js` (e.g. `addService()`) update in-memory state but do not trigger any side effects. Callers in `assets/js/scan.js` and `assets/js/edit.js` must explicitly call `renderGrid()` and dispatch `serviceadded` or `editmodechange` events to refresh the UI.

**Edit panel must preserve existing service fields:** When saving edits in `assets/js/edit.js`, the updated service object must spread `...service` to preserve fields not present in the form (notably `position`). Rust's `Config` struct requires `position: { row, col }` and will reject partial objects without it.

**IO errors via `?` route to `AppError::Config`:** The existing `From<std::io::Error>` impl in `src/error.rs` maps `std::io::Error` to `AppError::Config`. New IO-heavy modules (like `src/ping.rs`) must explicitly use `.map_err(|e| AppError::Internal(e.to_string()))` instead of `?`, or user-facing errors will misleadingly say "configuration error".
**CSS Grid breakpoint layering in `layout.css`:** The `@media (min-width: 900px)` breakpoint overrides `grid-template-columns` on the base `.grid` rule. When editing grid layout, changes to the base rule won't take effect at desktop+ viewports unless the 900px breakpoint is also updated or cleared.

**`justify-self: center` shrink-wraps grid items to content size:** In CSS Grid, `justify-self: center` causes items to size to their intrinsic content width rather than stretching to fill the grid cell. This caused unequal card widths in the service grid — each card's width varied with its text length. Use `width: 100%` with the default `justify-self: stretch` for uniform sizing. If centering is needed, use `justify-content` on the grid container or fixed track sizes instead.
**Headless Chromium caches CSS across tab sessions:** After editing embedded CSS assets and rebuilding the server, the headless browser tab may still serve stale CSS even with `location.reload(true)`. Use `close(all: true)` then a fresh `open` to guarantee the latest assets are loaded. Re-using tab names without a full close will return cached styles.

**Playwright `webServer` times out on clean release builds:** The `e2e/playwright.config.ts` webServer runs `cargo run --release` with a 60s timeout. A clean release build takes ~55-90s. Pre-build with `cargo build --release` before running `CI=true npx playwright test`, or increase the webServer timeout.

**Import order defeats same-specificity overrides:** `style.css` imports `layout.css` BEFORE `components.css`, so `.tile`-level mobile overrides placed in layout.css's `@media (max-width: 599px)` block silently lose the cascade to components.css's base rules. Mobile tile overrides (`.tile`, `.tile-icon`, `.tile-info`, `.tile-title`) live at the END of `components.css` in their own `@media (max-width: 599px)` block.

**Stylesheet `@import` round-trips delay module scripts:** Deferred module scripts wait for pending stylesheets, so `@import "fonts.css"` in `style.css` delayed `app.js` past the `load` event and widened the e2e onboarding-skip race (`isVisible()` → `click()` vs. the async config apply that hides onboarding). Keep `@font-face` rules inlined in `style.css`; spec skip-clicks use a tolerant `click({ timeout: 3000 }).catch(() => {})`.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
