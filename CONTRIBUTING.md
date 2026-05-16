# Contributing

## Setup

```bash
git clone https://github.com/RouHim/strandgut.git
cd strandgut
cargo run
```

## Before submitting a PR

- `cargo fmt` and `cargo clippy -- -D warnings`
- `cargo test` — all Rust unit tests pass
- `npm test` from `e2e/` — all E2E tests pass
- Use [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`)
- One thing per PR

## Code style

- No `unwrap()` in production paths
- No `#[allow(dead_code)]`
- Small, single-purpose functions

See [AGENTS.md](AGENTS.md) for architecture and design patterns.

## License

By contributing, you agree your contributions are MIT-licensed.
