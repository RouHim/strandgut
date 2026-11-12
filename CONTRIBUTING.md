# Contributing

## Setup

```bash
git clone https://github.com/RouHim/strandgut.git
cd strandgut
cargo run
```

## Before submitting a PR

- `cargo fmt --all -- --check` and `cargo clippy --all-targets -- -D warnings`
- `cargo test` — all Rust unit tests pass
- `node --test tests/js/*.test.js` — frontend unit tests pass
- `npm test` from `e2e/` — all E2E tests pass (see below)
- Use [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`)
- One thing per PR

## Running the E2E tests

Playwright drives a real server on port 13569, so prepare the browser and the binary once:

```bash
cd e2e
npm ci
npx playwright install --with-deps chromium
cargo build --release --manifest-path ../Cargo.toml   # the webServer starts `cargo run --release`
npm test
```

Two traps:

- The config's `webServer` waits 60 s. A cold release build takes longer, so pre-build as above.
- The webServer passes `STRANDGUT_CONFIG=.e2e-config.toml` (gitignored by the `*.toml` rule) when it
  launches the server, so a plain `npm test` leaves your own `config.toml` alone. To attach to a
  server you already run, start it with `STRANDGUT_CONFIG=.e2e-config.toml`, then set
  `STRANDGUT_REUSE_SERVER=1`; an exported `STRANDGUT_CONFIG` overrides the fallback and lets the
  fixture's reset PUTs rewrite the file it names. `CI` no longer influences reuse and only selects
  the reporter, retries, and `forbidOnly`.

Manual QA scripts live in `e2e/manual/` and run with
`npx playwright test --config playwright.manual.config.ts`.

## Code style

- No `unwrap()` in production paths
- No `#[allow(dead_code)]`
- Small, single-purpose functions

See [AGENTS.md](AGENTS.md) for architecture and design patterns.

## License

By contributing, you agree your contributions are MIT-licensed.
