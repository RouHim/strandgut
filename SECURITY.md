# Security

## Supported versions

Only the latest release gets security fixes.

## Deployment model

Strandgut is a LAN dashboard and is deliberately unauthenticated:

- The server binds `0.0.0.0:13569` and serves plain HTTP. There is no TLS, no login, and no CSRF token.
- Any client that can reach the port can read and rewrite the config (`PUT /api/config`), which includes the service URLs that `GET /api/status` later probes.
- `POST /api/scan` performs port scans from the server's network position against any host that resolves.

Run it only on a trusted network. To expose it beyond the LAN, put it behind a reverse proxy that terminates TLS and authenticates every request. Do not publish the port to the internet.

## Reporting

Email rouven@himmelstein.cloud — do not open a public issue.
