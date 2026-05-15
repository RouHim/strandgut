# Strandgut

Minimalist LAN service scanner dashboard. Single binary, no dependencies.

[![CI/CD](https://github.com/rouhim/strandgut/actions/workflows/ci.yml/badge.svg)](https://github.com/rouhim/strandgut/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GHCR](https://img.shields.io/badge/ghcr.io-rouhim%2Fstrandgut-blue)](https://github.com/rouhim/strandgut/pkgs/container/strandgut)

## Features

- **Auto-discover services on your network** — scan any host and Strandgut identifies what's running. Recognizes Home Assistant, Proxmox, Pi-hole, Synology, Portainer, Jellyfin, Plex, and Nextcloud automatically.
- **Three scan speeds** — quick (common ports), thorough (extended range), or exhaustive (all 65,535 ports).
- **Live results** — watch services appear in the dashboard as the scan runs.
- **Rearrange your dashboard** — drag cards where you want them, or use arrow buttons on your phone.
- **Dark and light themes** — switches with your system preference, or toggle manually. No flash of the wrong theme on load.
- **English and German** — picks up your browser language automatically.
- **Single file, no setup** — one binary with the entire UI embedded. No runtime dependencies, no install scripts.

## Quick start

```bash
git clone https://github.com/rouhim/strandgut.git
cd strandgut
cargo run
```

Open `http://localhost:13569` and click **Scan network**. The default scan (`simple`) checks 9 common ports, so it finishes in a couple of seconds.

### Docker

```bash
docker compose up -d
```

Also at `http://localhost:13569`.

The compose file sets `net.ipv4.ping_group_range` via `sysctls` so ICMP ping works for network scanning — this lets Strandgut check host reachability from within the container.

The compose file mounts `./data` as a volume for persistent config. Write your own `data/config.toml` or use the dashboard UI to save one.

### Production container

The release container is built `FROM scratch` and contains only the statically linked musl binary. It's about 5 MB. Pull it from GHCR:

```bash
docker pull ghcr.io/rouhim/strandgut:latest
docker run -p 13569:13569 -v ./data:/data --sysctl net.ipv4.ping_group_range='0 2147483647' ghcr.io/rouhim/strandgut:latest
```

> **Note**: The `--sysctl` flag is required so the container can send ICMP pings to check host reachability during network scans. Omit it if you don't need ping-based reachability checks. When using `docker compose`, this is handled automatically by the included `docker-compose.yaml`.

### Standalone binary

If you want the binary without Docker, the CI job cuts a statically linked musl release on every version tag. Download `strandgut` from the [latest release](https://github.com/rouhim/strandgut/releases/latest), `chmod +x` it, and run it. That's it.

```bash
./strandgut    # No libc, no runtime, no system dependencies
```

Set `STRANDGUT_CONFIG` if you need a config file somewhere else:

```bash
STRANDGUT_CONFIG=/etc/strandgut/config.toml ./strandgut
```

## Configuration

Strandgut looks for `config.toml` in the working directory. Set `STRANDGUT_CONFIG` to point it somewhere else. Logging is controlled with the `RUST_LOG` environment variable (via `env_logger`).

```toml
title = "Strandgut"
language = "en"          # "en" or "de"
scan_defaults = "simple" # "simple", "medium", or "deep"

[[services]]
name = "Home Assistant"
url = "http://192.168.1.100:8123"
icon = "homeassistant"
description = "Smart home control"
category = "Smart Home"
position = { row = 0, col = 0 }

[[services]]
name = "Pi-hole"
url = "http://192.168.1.1:80/admin"
icon = "pihole"
category = "Network"
position = { row = 1, col = 0 }
```

Icon slugs come from [SimpleIcons](https://simpleicons.org). Omit `icon` to show a generic globe. `description` and `category` are optional. `position` determines where the card appears on the grid.

## Development

```bash
git clone https://github.com/rouhim/strandgut.git
cd strandgut

# Run locally
cargo run

# Format
cargo fmt

# Lint (warnings are errors in CI)
cargo clippy -- -D warnings

# Run Rust unit tests
cargo test

# Run E2E tests (requires Node.js 24)
cd e2e
npm ci
npx playwright install --with-deps chromium
npm test
```

## License

MIT. Do whatever you want with it.
