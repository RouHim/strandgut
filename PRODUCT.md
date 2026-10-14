# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Homelab operators running self-hosted services on their own network. They already know roughly
what they run (NAS, Home Assistant, Pi-hole, media servers) and want one page that shows what is
up and links straight into it — typically opened from a desktop browser, often also from a phone.

Evidence: the sample `config.toml` (Truenas, Music Assistant, Home Assistant, Trilium Notes,
TurboPix, Plex, Jellyfin, Pi-hole, Grafana, Portainer, Nextcloud, Vaultwarden), the README's
"Auto-discover services on your network", and the mobile e2e spec.

## Product Purpose

Strandgut scans the local network, fingerprints known services, and presents them as a
configurable card dashboard the user can rearrange and extend by hand. Success means: open one
page on the LAN, see what is running, reach any service in one click — without configuring
anything first.

The product is the dashboard in its default view: the grid at rest, on whatever device it is
opened from — **not the scanner**. Scanning is a utility that fills the dashboard, alongside edit
mode, dialogs, panels and `config.toml`; none of them are the product. Work on this project is
judged by how the default view performs: what it shows about the services (identity, availability,
status) and how calm and legible it stays while doing it.

## Positioning

One self-contained binary that both finds services and presents them: no agent, no cloud, no
install scripts, the entire UI embedded at build time (~5 MB `FROM scratch` container, no runtime
dependencies). A neighboring tool that needs setup steps or an external service cannot truthfully
copy the zero-setup path.

## Operating Context

- Runs on the user's own host: `cargo run` (port 13569), `docker compose`, or a pre-built static
  binary; the release container is `FROM scratch`.
- Three scan speeds: simple (9 common ports), thorough, exhaustive (all 65,535); results stream
  into the dashboard while the scan runs.
- Persistent configuration in `config.toml` (`title`, `language`, `scan_defaults`,
  `background_rotate`, `[[services]]` with `name`/`url`/`icon` and grid position); containers
  mount `./data`.
- ICMP reachability inside containers needs the `net.ipv4.ping_group_range` sysctl.
- Verification: Rust unit tests (`cargo test`) plus Playwright e2e (`e2e/`, Node 24) with
  reference screenshots.

## Capabilities and Constraints

- Rust backend (hyper, tokio, matchit); Vanilla JS ES-module SPA; every asset embedded via
  `include_bytes!` in `src/spa.rs`, so the served UI is the compiled-in copy and UI changes need a
  rebuild.
- Internationalisation: embedded `en` and `de` bundles; the language follows the browser; every
  new user-facing string must land in both.
- Single fixed dark theme (the light theme was removed in `feat/single-dark-theme`); the README's
  "dark and light themes … switches with your system preference" claim is stale and must not be
  used as truth.
- The README's "Live results — watch services appear in the dashboard as the scan runs" (`README.md:14`)
  contradicts the default-view ruling in Product Purpose: scan results belong to the scan utility, not the
  dashboard. Correct the README — do not build the promise.
- No accounts, no cloud service, no telemetry; the core product must work fully offline on the LAN.
  Exception present in the code today: a service whose icon is not in the embedded set is fetched
  from `cdn.jsdelivr.net` (`assets/js/grid.js`), so "offline" holds for everything but unknown
  service icons.
- CI enforces `cargo fmt` and `cargo clippy -- -D warnings`.
- Undecided: no binding accessibility standard has been confirmed yet (ARIA labels, focus styles,
  reduced-motion and print rules exist, but that is current state, not a committed requirement).

## Brand Commitments

- Name "Strandgut", the logo (`assets/img/logo.svg`) and the README banner are identity; keep them.
- The washed-ashore metaphor is binding for voice: onboarding "Nothing washed ashore yet",
  flotsam/tide wording; keep new copy in that register, in both locales.
- Public MIT open-source repository: artifacts must not carry machine-specific paths, private
  data, or local-only details.

## Evidence on Hand

- The product itself and its docs: `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `docs/`, `CHANGELOG.md`.
- E2E reference screenshots in `e2e/specs/*.png` (initial, name-only cards, auto-fit centering,
  mobile single column, tablet, desktop).
- A realistic sample config and a built-in service icon set.
- No testimonials, benchmarks, pricing, press, or customer logos exist — future work must not
  fabricate any.

## Product Principles

1. Zero setup is the feature: anything that needs an installer step, an account, or a cloud round
   trip is out of scope.
2. Finding and showing are one product: the dashboard is the scanner's face, not a second tool
   bolted onto it.
3. The LAN stays private: no telemetry, no accounts, no stored credentials; offline use must
   remain sufficient, and every new outbound request (the icon CDN fallback is the one precedent)
   is a product decision, not an implementation detail.
4. Embed everything: assets, locales, and the icon set ship inside the binary, and new UI must
   survive `include_bytes!` and work with nothing but cargo.
5. The metaphor lives in the copy, never in the way of the tool: it sets tone, not navigation,
   controls, or information architecture.
