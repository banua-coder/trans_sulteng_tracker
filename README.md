# cektrans · trans_sulteng_tracker

Realtime tracker for **TransPalu** and **Trans Donggala** BRT, hosted at
[cektrans.banuacoder.com](https://cektrans.banuacoder.com).

A Vue 3 static SPA + a small Rust proxy run as two containers on the
shared Banuacoder VPS, fronted by **Traefik** (with Let's Encrypt TLS).
The proxy talks to the upstream BRT Nusantara GpsApi — handling
AES-256-CBC token + body crypto, REST caching, and Socket.IO fan-out —
and exposes a clean public API (`/api/*` + `/socket.io/`) to the
browser. Upstream endpoints and the shared secret are operator-only;
supply them via runtime env (see [.env.example](./.env.example)).

## Layout

```
trans_sulteng_tracker/
├─ apps/
│  ├─ web/          # Vue 3 + Vite + TS + Pinia + Tailwind v4
│  └─ proxy/        # Rust: axum + socketioxide + rust_socketio
├─ ops/
│  ├─ docker-compose.yml
│  ├─ web.Dockerfile
│  ├─ proxy.Dockerfile
│  └─ nginx-web.conf
├─ docs/            # design notes, API findings, ops runbooks
└─ scripts/         # one-off helpers
```

## Local development

Prerequisites: Node.js ≥ 20, pnpm ≥ 10, Rust stable (via [rustup](https://rustup.rs)),
Docker (for the full compose stack).

```bash
# 1. Install JS deps
pnpm install

# 2. Bring up the proxy (reads env from .env)
cp .env.example .env       # then fill in BRT_KEY etc.
cd apps/proxy && cargo run

# 3. In another shell, start the Vue dev server
pnpm dev                   # http://localhost:5173 — proxies /api + /socket.io
```

Or run both containers behind Traefik (mirrors prod):

```bash
# 1. Bring up the shared Traefik stack (Archipelago infra)
#    so the `traefik-public` network exists.

# 2. Build + start cektrans
docker compose -f ops/docker-compose.yml up --build -d

# 3. Add `cektrans.banuacoder.com 127.0.0.1` to /etc/hosts
#    or override the Host rule in compose for local testing.
```

## Configuration

All runtime config lives in environment variables. **Never commit a real `.env`.**

| Var | Where | Notes |
|---|---|---|
| `BIND_ADDR` | proxy | Default `0.0.0.0:8080`. |
| `BRT_REST_BASE` | proxy | Upstream REST base URL. |
| `BRT_SOCKET_BASE` | proxy | Upstream Socket.IO base URL. |
| `BRT_KEY` | proxy | 32-byte UTF-8 AES-256-CBC secret. **Rotate when upstream rotates.** |
| `ALLOW_ORIGIN` | proxy | CORS allow-origin for the public site. |
| `RUST_LOG` | proxy | tracing-subscriber filter. |
| `VITE_PROXY_TARGET` | web (dev only) | Where `vite` forwards `/api` + `/socket.io` in dev. |
| `VITE_BUILD_SHA` | web (build only) | Surfaced in the footer / health UI. |

In production these are injected by the deploy environment (GitHub Actions
secrets → container env). The frontend bundle is built with build-time
`VITE_*` vars — only public values belong there.

## Brand & UX

- Visual: Banuacoder warm-minimal (ink `#0A0E14` / paper `#F7F7F4` / cyan
  accent `#1D9CD4`) with Geist + Inter + JetBrains Mono.
- Map: CARTO Voyager raster tiles.
- Buses: TransJakarta-style — small filled circle, white ring, corridor
  code (e.g. `K1`) inside in bold mono, rotated to bus heading. Stale
  (>5 min since last fix) buses get a hatched gray treatment.

## Data source

BRT Nusantara · Mitra Darat (Kementerian Perhubungan). Upstream
endpoints, crypto schema, and wire DTOs are kept in operator-private
notes — never published in this repo.

> Operational note: the upstream is dev-grade infrastructure and may
> break or rotate keys without warning. The proxy is built to tolerate
> 401 + retry; full key rotation is a single env var change.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
